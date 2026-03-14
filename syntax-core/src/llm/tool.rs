use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub id: String,
    pub name: String,
    pub result: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionDeclaration {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tool {
    #[serde(rename = "type")]
    pub tool_type: String, // e.g., "function"
    pub function: FunctionDeclaration,
}

#[derive(Debug, Clone)]
pub struct LlmResponse {
    pub text: String,
    pub tool_calls: Vec<ToolCall>,
    pub input_tokens_estimate: u32,
    pub output_tokens_estimate: u32,
    pub grounding_metadata: Option<crate::llm::gemini_metadata::GroundingMetadata>,
}

impl LlmResponse {
    pub fn text_with_citations(&self) -> String {
        let mut text = self.text.clone();
        if let Some(metadata) = &self.grounding_metadata {
            let mut supports = metadata.grounding_supports.clone();
            // Sort supports by end_index in descending order to avoid shifting issues when inserting.
            supports.sort_by(|a, b| b.segment.end_index.cmp(&a.segment.end_index));

            for support in supports {
                let end_index = support.segment.end_index;
                // Avoid out-of-bounds panics if byte length doesn't match string char length exactly
                if end_index <= text.len() && !support.grounding_chunk_indices.is_empty() {
                    let mut citation_links = Vec::new();
                    for i in support.grounding_chunk_indices {
                        if i < metadata.grounding_chunks.len() {
                            if let Some(web) = &metadata.grounding_chunks[i].web {
                                citation_links.push(format!("[{}]({})", i + 1, web.uri));
                            }
                        }
                    }
                    if !citation_links.is_empty() {
                        let citation_string = format!(" {}", citation_links.join(", "));
                        // Insert citation string at end_index using byte indices
                        text.insert_str(end_index, &citation_string);
                    }
                }
            }
        }
        text
    }
}
