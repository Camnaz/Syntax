use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GroundingMetadata {
    #[serde(default)]
    pub web_search_queries: Vec<String>,
    #[serde(default)]
    pub grounding_chunks: Vec<GroundingChunk>,
    #[serde(default)]
    pub grounding_supports: Vec<GroundingSupport>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GroundingChunk {
    pub web: Option<WebChunk>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WebChunk {
    pub uri: String,
    pub title: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GroundingSupport {
    pub segment: Segment,
    #[serde(default)]
    pub grounding_chunk_indices: Vec<usize>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Segment {
    pub start_index: usize,
    pub end_index: usize,
    pub text: String,
}
