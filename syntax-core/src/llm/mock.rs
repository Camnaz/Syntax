use async_trait::async_trait;
use std::sync::Mutex;
use crate::llm::{LlmError, LlmProvider};
use crate::llm::tool::LlmResponse;

pub struct MockProvider {
    pub responses: Vec<String>,
    pub current: Mutex<usize>,
}

#[async_trait]
impl LlmProvider for MockProvider {
    async fn complete(&self, _system: &str, _user: &str) -> Result<LlmResponse, LlmError> {
        let mut current = self.current.lock().unwrap();
        if *current < self.responses.len() {
            let response = self.responses[*current].clone();
            *current += 1;
            Ok(LlmResponse { text: response, tool_calls: vec![], input_tokens_estimate: 0, output_tokens_estimate: 0, grounding_metadata: None })
        } else {
            Err(LlmError::RequestFailed("No more mock responses".to_string()))
        }
    }

    fn name(&self) -> &'static str {
        "mock"
    }
}
