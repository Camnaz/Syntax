use crate::llm::{LlmError, LlmProvider};
use std::sync::Arc;

pub struct LlmRouter {
    primary: Arc<dyn LlmProvider>,
    fallback: Arc<dyn LlmProvider>,
}

impl LlmRouter {
    pub fn new(primary: Arc<dyn LlmProvider>, fallback: Arc<dyn LlmProvider>) -> Self {
        Self { primary, fallback }
    }

    pub async fn complete(&self, system: &str, user: &str) -> Result<(crate::llm::tool::LlmResponse, &'static str), LlmError> {
        match self.primary.complete(system, user).await {
            Ok(response) => {
                if response.text.trim().is_empty() && response.tool_calls.is_empty() {
                    let primary_empty_msg = format!("{} returned empty response", self.primary.name());
                    tracing::warn!(
                        "{}. Falling back to {}",
                        primary_empty_msg,
                        self.fallback.name()
                    );

                    match self.fallback.complete(system, user).await {
                        Ok(fallback_response) => {
                            if fallback_response.text.trim().is_empty() && fallback_response.tool_calls.is_empty() {
                                tracing::error!(
                                    "Fallback provider {} also returned empty response",
                                    self.fallback.name()
                                );
                                return Err(LlmError::AllProvidersFailed {
                                    primary_error: primary_empty_msg,
                                    fallback_error: format!("{} returned empty response", self.fallback.name()),
                                });
                            }
                            tracing::info!("LLM request succeeded with fallback provider: {}", self.fallback.name());
                            return Ok((fallback_response, self.fallback.name()));
                        }
                        Err(fallback_err) => {
                            tracing::error!(
                                "Fallback provider {} failed after empty primary response: {}",
                                self.fallback.name(),
                                fallback_err
                            );
                            return Err(LlmError::AllProvidersFailed {
                                primary_error: primary_empty_msg,
                                fallback_error: fallback_err.to_string(),
                            });
                        }
                    }
                }
                tracing::info!("LLM request succeeded with primary provider: {}", self.primary.name());
                Ok((response, self.primary.name()))
            }
            Err(primary_err) => {
                tracing::warn!(
                    "Primary provider {} failed: {}. Falling back to {}",
                    self.primary.name(),
                    primary_err,
                    self.fallback.name()
                );
                let primary_err_str = primary_err.to_string();

                match self.fallback.complete(system, user).await {
                    Ok(response) => {
                        tracing::info!("LLM request succeeded with fallback provider: {}", self.fallback.name());
                        Ok((response, self.fallback.name()))
                    }
                    Err(fallback_err) => {
                        tracing::error!(
                            "Fallback provider {} also failed: {}",
                            self.fallback.name(),
                            fallback_err
                        );
                        Err(LlmError::AllProvidersFailed {
                            primary_error: primary_err_str,
                            fallback_error: fallback_err.to_string(),
                        })
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;

    struct MockProvider {
        name: &'static str,
        should_fail: bool,
    }

    #[async_trait]
    impl LlmProvider for MockProvider {
        async fn complete(&self, _system: &str, _user: &str) -> Result<crate::llm::tool::LlmResponse, LlmError> {
            if self.should_fail {
                Err(LlmError::RequestFailed("Mock failure".to_string()))
            } else {
                Ok(crate::llm::tool::LlmResponse {
                    text: format!("Response from {}", self.name),
                    tool_calls: vec![],
                    input_tokens_estimate: 0,
                    output_tokens_estimate: 0,
                })
            }
        }

        fn name(&self) -> &'static str {
            self.name
        }
    }

    #[tokio::test]
    async fn test_primary_success() {
        let primary = Arc::new(MockProvider {
            name: "primary",
            should_fail: false,
        });
        let fallback = Arc::new(MockProvider {
            name: "fallback",
            should_fail: false,
        });

        let router = LlmRouter::new(primary, fallback);
        let result = router.complete("system", "user").await;

        assert!(result.is_ok());
        let (response, provider) = result.unwrap();
        assert_eq!(response.text, "Response from primary");
        assert_eq!(provider, "primary");
    }

    #[tokio::test]
    async fn test_fallback_on_primary_failure() {
        let primary = Arc::new(MockProvider {
            name: "primary",
            should_fail: true,
        });
        let fallback = Arc::new(MockProvider {
            name: "fallback",
            should_fail: false,
        });

        let router = LlmRouter::new(primary, fallback);
        let result = router.complete("system", "user").await;

        assert!(result.is_ok());
        let (response, provider) = result.unwrap();
        assert_eq!(response.text, "Response from fallback");
        assert_eq!(provider, "fallback");
    }

    #[tokio::test]
    async fn test_both_providers_fail() {
        let primary = Arc::new(MockProvider {
            name: "primary",
            should_fail: true,
        });
        let fallback = Arc::new(MockProvider {
            name: "fallback",
            should_fail: true,
        });

        let router = LlmRouter::new(primary, fallback);
        let result = router.complete("system", "user").await;

        assert!(result.is_err());
        match result.unwrap_err() {
            LlmError::AllProvidersFailed { .. } => {}
            _ => panic!("Expected AllProvidersFailed error"),
        }
    }
}
