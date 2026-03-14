use serde::Serialize;

#[derive(Serialize)]
struct ToolWrapper {
    google_search: Option<GoogleSearchTool>,
    function_declarations: Option<Vec<crate::llm::tool::FunctionDeclaration>>,
}
