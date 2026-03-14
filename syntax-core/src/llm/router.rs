use crate::llm::{LlmError, LlmProvider};
use crate::llm::tool::LlmResponse;
use std::sync::Arc;

pub struct LlmRouter {
    primary: Arc<dyn LlmProvider>,
    fallback: Arc<dyn LlmProvider>,
}

fn is_valid(r: &LlmResponse) -> bool {
    !r.text.trim().is_empty() || !r.tool_calls.is_empty()
}

impl LlmRouter {
    pub fn new(primary: Arc<dyn LlmProvider>, fallback: Arc<dyn LlmProvider>) -> Self {
        Self { primary, fallback }
    }

    /// Race both providers in parallel. First valid response wins.
    /// If the winner returned empty/error, the other result is checked.
    pub async fn complete(&self, system: &str, user: &str) -> Result<(LlmResponse, &'static str), LlmError> {
        let p = Arc::clone(&self.primary);
        let f = Arc::clone(&self.fallback);
        let sys_p = system.to_owned();
        let usr_p = user.to_owned();
        let sys_f = system.to_owned();
        let usr_f = user.to_owned();

        let mut primary_handle = tokio::spawn(async move { p.complete(&sys_p, &usr_p).await });
        let mut fallback_handle = tokio::spawn(async move { f.complete(&sys_f, &usr_f).await });

        let primary_name = self.primary.name();
        let fallback_name = self.fallback.name();

        // Race: whichever finishes first
        tokio::select! {
            biased;
            r = &mut primary_handle => {
                let result = r.map_err(|e| LlmError::RequestFailed(e.to_string()))?;
                match result {
                    Ok(resp) if is_valid(&resp) => {
                        tracing::info!("Race won by {} (valid response)", primary_name);
                        return Ok((resp, primary_name));
                    }
                    first => {
                        let first_err = match first {
                            Ok(_) => format!("{} returned empty", primary_name),
                            Err(e) => { tracing::warn!("Race: {} failed: {}", primary_name, e); e.to_string() }
                        };
                        // Wait for fallback
                        match fallback_handle.await {
                            Ok(Ok(resp)) if is_valid(&resp) => {
                                tracing::info!("Race: {} failed, {} succeeded", primary_name, fallback_name);
                                Ok((resp, fallback_name))
                            }
                            Ok(Ok(_)) => Err(LlmError::AllProvidersFailed {
                                primary_error: first_err,
                                fallback_error: format!("{} returned empty", fallback_name),
                            }),
                            Ok(Err(e)) => Err(LlmError::AllProvidersFailed {
                                primary_error: first_err,
                                fallback_error: e.to_string(),
                            }),
                            Err(e) => Err(LlmError::RequestFailed(e.to_string())),
                        }
                    }
                }
            }
            r = &mut fallback_handle => {
                let result = r.map_err(|e| LlmError::RequestFailed(e.to_string()))?;
                match result {
                    Ok(resp) if is_valid(&resp) => {
                        tracing::info!("Race won by {} (valid response)", fallback_name);
                        return Ok((resp, fallback_name));
                    }
                    first => {
                        let first_err = match first {
                            Ok(_) => format!("{} returned empty", fallback_name),
                            Err(e) => { tracing::warn!("Race: {} failed: {}", fallback_name, e); e.to_string() }
                        };
                        // Wait for primary
                        match primary_handle.await {
                            Ok(Ok(resp)) if is_valid(&resp) => {
                                tracing::info!("Race: {} failed, {} succeeded", fallback_name, primary_name);
                                Ok((resp, primary_name))
                            }
                            Ok(Ok(_)) => Err(LlmError::AllProvidersFailed {
                                primary_error: format!("{} returned empty", primary_name),
                                fallback_error: first_err,
                            }),
                            Ok(Err(e)) => Err(LlmError::AllProvidersFailed {
                                primary_error: e.to_string(),
                                fallback_error: first_err,
                            }),
                            Err(e) => Err(LlmError::RequestFailed(e.to_string())),
                        }
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
