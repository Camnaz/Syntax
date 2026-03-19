use serde::{Deserialize, Serialize};
use std::env;
use tokio::select;

const HAIKU:      &str = "claude-haiku-4-5-20251001";
const FLASH_LITE: &str = "gemini-2.0-flash-lite";
const OPUS:       &str = "claude-opus-4-6";

const SYSTEM_PROMPT: &str = "You are a financial analysis assistant. Be concise. Output actionable analysis only.";

#[derive(Debug, Serialize)]
struct AnthropicRequest<'a> {
    model:      &'a str,
    max_tokens: u32,
    system:     &'a str,
    messages:   Vec<AnthropicMessage<'a>>,
}

#[derive(Debug, Serialize)]
struct AnthropicMessage<'a> {
    role:    &'a str,
    content: &'a str,
}

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicContent>,
    usage:   AnthropicUsage,
}

#[derive(Debug, Deserialize)]
struct AnthropicContent {
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnthropicUsage {
    input_tokens:  u32,
    output_tokens: u32,
}

#[derive(Debug, Serialize)]
struct GeminiRequest<'a> {
    contents:           Vec<GeminiContent<'a>>,
    system_instruction: Option<GeminiSystemInstruction<'a>>,
}

#[derive(Debug, Serialize)]
struct GeminiContent<'a> {
    parts: Vec<GeminiPart<'a>>,
    role:  &'a str,
}

#[derive(Debug, Serialize)]
struct GeminiSystemInstruction<'a> {
    parts: Vec<GeminiPart<'a>>,
}

#[derive(Debug, Serialize)]
struct GeminiPart<'a> {
    text: &'a str,
}

#[derive(Debug, Deserialize)]
struct GeminiResponse {
    candidates:    Vec<GeminiCandidate>,
    #[serde(rename = "usageMetadata")]
    usage_metadata: Option<GeminiUsage>,
}

#[derive(Debug, Deserialize)]
struct GeminiCandidate {
    content: GeminiCandidateContent,
}

#[derive(Debug, Deserialize)]
struct GeminiCandidateContent {
    parts: Vec<GeminiResponsePart>,
}

#[derive(Debug, Deserialize)]
struct GeminiResponsePart {
    text: String,
}

#[derive(Debug, Deserialize)]
struct GeminiUsage {
    #[serde(rename = "totalTokenCount")]
    total_token_count: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmResult {
    pub text:   String,
    pub model:  String,
    pub tokens: u32,
    pub tier:   String,
}

pub fn is_quality_tier(query: &str) -> bool {
    let q = query.to_lowercase();
    [
        "deep risk", "max drawdown", "maxdrawdown",
        "sector concentration", "diversif", "macro hedge",
        "overnight rebalanc", "weakest position",
        "exit strateg", "sharpe optim", "model scenario",
        "risk assessment",
    ]
    .iter()
    .any(|p| q.contains(p))
}

pub async fn call_haiku(client: &reqwest::Client, query: &str, ctx: &str) -> anyhow::Result<LlmResult> {
    let api_key = env::var("ANTHROPIC_API_KEY")?;
    let system = if ctx.is_empty() {
        SYSTEM_PROMPT.to_string()
    } else {
        format!("{}\n\nContext:\n{}", SYSTEM_PROMPT, ctx)
    };

    let req = AnthropicRequest {
        model: HAIKU,
        max_tokens: 512,
        system: &system,
        messages: vec![AnthropicMessage { role: "user", content: query }],
    };

    let res: AnthropicResponse = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key",         &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type",      "application/json")
        .json(&req)
        .send()
        .await?
        .json()
        .await?;

    let text = res.content.into_iter()
        .filter_map(|c| c.text)
        .collect::<Vec<_>>()
        .join("");

    Ok(LlmResult {
        text,
        model:  HAIKU.to_string(),
        tokens: res.usage.input_tokens + res.usage.output_tokens,
        tier:   "race".to_string(),
    })
}

pub async fn call_flash_lite(client: &reqwest::Client, query: &str, ctx: &str) -> anyhow::Result<LlmResult> {
    let api_key = env::var("GEMINI_API_KEY")
        .or_else(|_| env::var("GOOGLE_API_KEY"))?;

    let system_text = if ctx.is_empty() {
        SYSTEM_PROMPT.to_string()
    } else {
        format!("{}\n\nContext:\n{}", SYSTEM_PROMPT, ctx)
    };

    let req = GeminiRequest {
        system_instruction: Some(GeminiSystemInstruction {
            parts: vec![GeminiPart { text: &system_text }],
        }),
        contents: vec![GeminiContent {
            role:  "user",
            parts: vec![GeminiPart { text: query }],
        }],
    };

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        FLASH_LITE, api_key
    );

    let res: GeminiResponse = client
        .post(&url)
        .header("content-type", "application/json")
        .json(&req)
        .send()
        .await?
        .json()
        .await?;

    let text = res.candidates
        .into_iter()
        .flat_map(|c| c.content.parts)
        .map(|p| p.text)
        .collect::<Vec<_>>()
        .join("");

    let tokens = res.usage_metadata
        .and_then(|u| u.total_token_count)
        .unwrap_or(800);

    Ok(LlmResult {
        text,
        model:  FLASH_LITE.to_string(),
        tokens,
        tier:   "race".to_string(),
    })
}

pub async fn call_opus(client: &reqwest::Client, query: &str, ctx: &str) -> anyhow::Result<LlmResult> {
    let api_key = env::var("ANTHROPIC_API_KEY")?;
    let system = format!(
        "{}\n{}\n\nBefore answering, output a <think> block:\n\
        1. What is being asked\n2. Relevant context\n\
        3. Key risks\n4. Your conclusion\nThen write the final answer.",
        SYSTEM_PROMPT, ctx
    );

    let req = AnthropicRequest {
        model: OPUS,
        max_tokens: 2048,
        system: &system,
        messages: vec![AnthropicMessage { role: "user", content: query }],
    };

    let res: AnthropicResponse = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key",         &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type",      "application/json")
        .json(&req)
        .send()
        .await?
        .json()
        .await?;

    let text = res.content.into_iter()
        .filter_map(|c| c.text)
        .collect::<Vec<_>>()
        .join("");

    Ok(LlmResult {
        text,
        model:  OPUS.to_string(),
        tokens: res.usage.input_tokens + res.usage.output_tokens,
        tier:   "quality".to_string(),
    })
}

pub async fn dispatch(client: &reqwest::Client, query: &str, ctx: &str) -> anyhow::Result<LlmResult> {
    if is_quality_tier(query) {
        return call_opus(client, query, ctx).await;
    }

    let haiku_fut = call_haiku(client, query, ctx);
    let flash_fut = call_flash_lite(client, query, ctx);

    select! {
        res = haiku_fut => res,
        res = flash_fut => res,
    }
}
