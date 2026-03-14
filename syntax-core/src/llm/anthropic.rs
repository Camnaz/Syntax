use async_trait::async_trait;
use reqwest;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use crate::llm::{LlmError, LlmProvider};
use crate::llm::tool::{LlmResponse, ToolCall};

#[derive(Clone)]
pub struct AnthropicProvider {
    api_key: String,
    client: reqwest::Client,
}

#[derive(Serialize)]
struct AnthropicRequest {
    model: String,
    max_tokens: u32,
    system: String,
    messages: Vec<Message>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<AnthropicTool>>,
}

#[derive(Serialize)]
struct AnthropicTool {
    name: String,
    description: String,
    input_schema: serde_json::Value,
}

#[derive(Serialize, Deserialize)]
struct Message {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct AnthropicResponse {
    content: Vec<ContentBlock>,
}

#[derive(Deserialize)]
struct ContentBlock {
    #[serde(rename = "type")]
    block_type: String,
    text: Option<String>,
    id: Option<String>,
    name: Option<String>,
    input: Option<serde_json::Value>,
}

impl AnthropicProvider {
    pub fn new(api_key: String) -> Self {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(60))
            .build()
            .expect("failed to build Anthropic HTTP client");
        Self {
            api_key,
            client,
        }
    }
}

#[async_trait]
impl LlmProvider for AnthropicProvider {
    async fn complete(&self, system: &str, user: &str) -> Result<LlmResponse, LlmError> {
        let request = AnthropicRequest {
            model: "claude-3-5-haiku-20241022".to_string(),
            max_tokens: 4096,
            system: system.to_string(),
            messages: vec![Message {
                role: "user".to_string(),
                content: user.to_string(),
            }],
            tools: Some(vec![
                AnthropicTool {
                    name: "propose_portfolio_actions".to_string(),
                    description: "Propose a set of portfolio actions to the user for confirmation. Use this when the user says they bought/sold a stock, or when you want to suggest trades, cash updates, or risk profile updates. Do not assume any action is final until confirmed.".to_string(),
                    input_schema: crate::llm::tools::portfolio::pending_actions_declaration().parameters
                },
                AnthropicTool {
                    name: "upsert_portfolio_position".to_string(),
                    description: "Updates or adds a stock position to the user's portfolio. Use this when the user explicitly tells you they bought, sold, or currently hold a specific stock with a specific number of shares.".to_string(),
                    input_schema: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "ticker": {
                                "type": "string",
                                "description": "The stock ticker symbol (e.g., AAPL, TSLA)"
                            },
                            "shares": {
                                "type": "number",
                                "description": "The number of shares the user currently owns. Set to 0 if they sold all of it."
                            },
                            "average_purchase_price": {
                                "type": "number",
                                "description": "The average purchase price per share, if known."
                            }
                        },
                        "required": ["ticker", "shares"]
                    }),
                }
            ]),
        };

        let response = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| {
                tracing::error!("Anthropic API request failed: {}", e);
                if e.status() == Some(reqwest::StatusCode::TOO_MANY_REQUESTS) {
                    LlmError::RateLimitExceeded
                } else if e.status() == Some(reqwest::StatusCode::UNAUTHORIZED) {
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
                    "Anthropic 429 rate limit: {}", body
                )));
            }
            if status == reqwest::StatusCode::BAD_REQUEST {
                let body_lower = body.to_lowercase();
                // Only trigger circuit breaker for actual billing/quota errors, not validation errors
                if (body_lower.contains("billing") && body_lower.contains("enabled"))
                    || (body_lower.contains("credit") && (body_lower.contains("insufficient") || body_lower.contains("balance")))
                    || (body_lower.contains("quota") && body_lower.contains("exceeded"))
                {
                    return Err(LlmError::CreditsExhausted(format!(
                        "Anthropic billing constraint: {}", body
                    )));
                }
            }
            return Err(LlmError::RequestFailed(format!(
                "HTTP {}: {}",
                status, body
            )));
        }

        let anthropic_response: AnthropicResponse = response
            .json()
            .await
            .map_err(|e| LlmError::ParseError(e.to_string()))?;

        let mut text = String::new();
        let mut tool_calls = Vec::new();
        
        for block in anthropic_response.content {
            if block.block_type == "text" {
                if let Some(t) = block.text {
                    text.push_str(&t);
                }
            } else if block.block_type == "tool_use" {
                if let (Some(id), Some(name), Some(input)) = (block.id, block.name, block.input) {
                    tool_calls.push(ToolCall {
                        id,
                        name,
                        arguments: input,
                    });
                }
            }
        }
        
        // Sometimes Claude responds with JUST a tool call and no text. That's OK.
        // We'll return what we have.

        let input_tokens_estimate = ((system.len() + user.len()) / 4) as u32;
        let output_tokens_estimate = (text.len() / 4) as u32;
        Ok(LlmResponse { text, tool_calls, input_tokens_estimate, output_tokens_estimate, grounding_metadata: None })
    }

    fn name(&self) -> &'static str {
        "anthropic"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_provider_name() {
        let provider = AnthropicProvider::new("test-key".to_string());
        assert_eq!(provider.name(), "anthropic");
    }
}
