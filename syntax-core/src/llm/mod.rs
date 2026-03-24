use async_trait::async_trait;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum LlmError {
    #[error("HTTP request failed: {0}")]
    RequestFailed(String),
    
    #[error("Failed to parse response: {0}")]
    ParseError(String),
    
    #[error("Rate limit exceeded")]
    RateLimitExceeded,
    
    #[error("Credits exhausted: {0}")]
    CreditsExhausted(String),
    
    #[error("All providers failed. Anthropic: {primary_error}; Gemini: {fallback_error}")]
    AllProvidersFailed {
        primary_error: String,
        fallback_error: String,
    },
    
    #[error("Invalid API key")]
    InvalidApiKey,
}

impl LlmError {
    pub fn is_credits_exhausted(&self) -> bool {
        matches!(self, LlmError::CreditsExhausted(_))
    }
}

#[async_trait]
pub trait LlmProvider: Send + Sync {
    async fn complete(&self, system: &str, user: &str) -> Result<crate::llm::tool::LlmResponse, LlmError>;
    fn name(&self) -> &'static str;
}

pub mod anthropic;
pub mod gemini;
pub mod mock;
pub mod router;
pub mod tool;
pub mod tools;

pub use anthropic::AnthropicProvider;
pub use gemini::GeminiProvider;
#[allow(unused_imports)]
pub use mock::MockProvider;
pub use router::LlmRouter;
pub mod gemini_metadata;
