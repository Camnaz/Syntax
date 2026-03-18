use async_trait::async_trait;
use reqwest;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use crate::llm::{LlmError, LlmProvider};
use crate::llm::tool::{LlmResponse, ToolCall};

#[derive(Clone)]
pub struct GeminiProvider {
    api_key: String,
    model: String,
    client: reqwest::Client,
}

#[derive(Serialize)]
struct GeminiRequest {
    contents: Vec<Content>,
    #[serde(rename = "systemInstruction")]
    system_instruction: SystemInstruction,
    #[serde(rename = "generationConfig")]
    generation_config: GenerationConfig,
    tools: Vec<ToolWrapper>,
}

#[derive(Serialize)]
struct ToolWrapper {
    #[serde(rename = "google_search", skip_serializing_if = "Option::is_none")]
    google_search: Option<GoogleSearchTool>,
    #[serde(rename = "functionDeclarations", skip_serializing_if = "Option::is_none")]
    function_declarations: Option<Vec<crate::llm::tool::FunctionDeclaration>>,
}

#[derive(Serialize)]
struct GoogleSearchTool {}

#[derive(Serialize)]
struct SystemInstruction {
    parts: Vec<Part>,
}

#[derive(Serialize)]
struct Content {
    parts: Vec<Part>,
}

#[derive(Serialize)]
struct Part {
    text: String,
}

#[derive(Serialize)]
struct GenerationConfig {
    #[serde(rename = "maxOutputTokens")]
    max_output_tokens: u32,
    #[serde(rename = "responseMimeType", skip_serializing_if = "Option::is_none")]
    response_mime_type: Option<String>,
}

#[derive(Deserialize)]
struct GeminiResponse {
    candidates: Vec<Candidate>,
}

#[derive(Deserialize)]
struct Candidate {
    content: ResponseContent,
    #[serde(rename = "groundingMetadata", default)]
    grounding_metadata: Option<crate::llm::gemini_metadata::GroundingMetadata>,
}

#[derive(Deserialize)]
struct ResponseContent {
    parts: Vec<ResponsePart>,
}

#[derive(Deserialize)]
struct ResponsePart {
    text: Option<String>,
    #[serde(rename = "functionCall")]
    function_call: Option<GeminiFunctionCall>,
}

#[derive(Deserialize)]
struct GeminiFunctionCall {
    name: String,
    args: serde_json::Value,
}

impl GeminiProvider {
    pub fn new(api_key: String) -> Self {
        // Default to ultra-cheap Flash-Lite for most operations
        Self::new_with_model(api_key, "gemini-2.5-flash-lite".to_string())
    }

    pub fn new_flash_standard(api_key: String) -> Self {
        // Standard Flash for complex analysis
        Self::new_with_model(api_key, "gemini-2.5-flash".to_string())
    }

    pub fn new_flash_pro(api_key: String) -> Self {
        // Pro for deep research tasks
        Self::new_with_model(api_key, "gemini-2.5-pro".to_string())
    }

    pub fn new_with_model(api_key: String, model: String) -> Self {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(25))
            .build()
            .unwrap_or_default();
        Self {
            api_key,
            model,
            client,
        }
    }
}

#[async_trait]
impl LlmProvider for GeminiProvider {
    async fn complete(&self, system: &str, user: &str) -> Result<LlmResponse, LlmError> {
        let request = GeminiRequest {
            contents: vec![Content {
                parts: vec![Part {
                    text: user.to_string(),
                }],
            }],
            system_instruction: SystemInstruction {
                parts: vec![Part {
                    text: system.to_string(),
                }],
            },
            generation_config: GenerationConfig {
                max_output_tokens: 8192,
                response_mime_type: None,
            },
            tools: vec![
                ToolWrapper {
                    google_search: Some(GoogleSearchTool {}),
                    function_declarations: None,
                },
            ],
        };

        let url = format!(
            "https://generativelanguage.googleapis.com/v1alpha/models/{}:generateContent?key={}",
            self.model, self.api_key
        );

        let response = self
            .client
            .post(&url)
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| {
                if e.status() == Some(reqwest::StatusCode::TOO_MANY_REQUESTS) {
                    LlmError::RateLimitExceeded
                } else if e.status() == Some(reqwest::StatusCode::UNAUTHORIZED) 
                    || e.status() == Some(reqwest::StatusCode::FORBIDDEN) {
                    LlmError::InvalidApiKey
                } else {
                    LlmError::RequestFailed(e.to_string())
                }
            })?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            // Circuit breaker: 429 (rate limit / resource exhaustion) or 400 (billing constraint)
            if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
                return Err(LlmError::CreditsExhausted(format!(
                    "Gemini 429 resource exhausted: {}", body
                )));
            }
            if status == reqwest::StatusCode::BAD_REQUEST {
                let body_lower = body.to_lowercase();
                // Only trigger circuit breaker for actual billing/quota errors, not validation errors
                // RESOURCE_EXHAUSTED is a quota limit (retry-able), not a billing failure — don't break the loop
                if (body_lower.contains("billing") && (body_lower.contains("disabled") || body_lower.contains("account")))
                    || (body_lower.contains("quota") && body_lower.contains("exceeded") && !body.contains("RESOURCE_EXHAUSTED"))
                {
                    return Err(LlmError::CreditsExhausted(format!(
                        "Gemini billing constraint: {}", body
                    )));
                }
            }
            return Err(LlmError::RequestFailed(format!(
                "HTTP {}: {}",
                status, body
            )));
        }

        let gemini_response: GeminiResponse = response
            .json()
            .await
            .map_err(|e| LlmError::ParseError(e.to_string()))?;

        let mut text = String::new();
        let mut tool_calls = Vec::new();

        if let Some(candidate) = gemini_response.candidates.first() {
            for part in &candidate.content.parts {
                if let Some(t) = &part.text {
                    text.push_str(t);
                }
                if let Some(fc) = &part.function_call {
                    tool_calls.push(ToolCall {
                        id: uuid::Uuid::new_v4().to_string(), // Gemini doesn't provide call IDs natively in the same way OpenAI does
                        name: fc.name.clone(),
                        arguments: fc.args.clone(),
                    });
                }
            }
        }
            
        let input_tokens_estimate = ((system.len() + user.len()) / 4) as u32;
        let output_tokens_estimate = (text.len() / 4) as u32;
        let grounding_metadata = gemini_response.candidates.first().and_then(|c| c.grounding_metadata.clone());
        Ok(LlmResponse { text, tool_calls, input_tokens_estimate, output_tokens_estimate, grounding_metadata })
    }

    fn name(&self) -> &'static str {
        // Return tiered name for cost tracking
        if self.model.contains("flash-lite") {
            "gemini-flash-lite"
        } else if self.model.contains("pro") && !self.model.contains("flash") {
            "gemini-pro"
        } else {
            "gemini"
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_provider_name() {
        let provider = GeminiProvider::new("test-key".to_string());
        assert_eq!(provider.name(), "gemini");
    }
}
