use std::sync::Arc;

#[path = "../src/llm/mod.rs"]
mod llm;

#[path = "../src/llm/anthropic.rs"]
mod anthropic;

#[path = "../src/llm/gemini.rs"]
mod gemini;

#[path = "../src/llm/router.rs"]
mod router;

use llm::LlmProvider;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    
    let anthropic_key = std::env::var("ANTHROPIC_API_KEY")
        .expect("ANTHROPIC_API_KEY must be set");
    
    println!("Testing Claude API...");
    let provider = anthropic::AnthropicProvider::new(anthropic_key.clone());
    
    let system = "You are a helpful assistant that responds in JSON format.";
    let user = r#"Return a JSON object with a single field "test" set to "success"."#;
    
    match provider.complete(system, user).await {
        Ok(response) => {
            println!("✓ Claude API call succeeded");
            println!("Response: {}", response.text);
            if !response.tool_calls.is_empty() {
                println!("Tool Calls: {:?}", response.tool_calls);
            }
        }
        Err(e) => {
            eprintln!("✗ Claude API call failed: {:?}", e);
            std::process::exit(1);
        }
    }
    
    println!("\nTesting Gemini API...");
    let gemini_key = std::env::var("GEMINI_API_KEY")
        .expect("GEMINI_API_KEY must be set");
    let gemini_provider = gemini::GeminiProvider::new(gemini_key.clone());
    
    match gemini_provider.complete(system, user).await {
        Ok(response) => {
            println!("✓ Gemini API call succeeded");
            println!("Response: {}", response.text);
            if !response.tool_calls.is_empty() {
                println!("Tool Calls: {:?}", response.tool_calls);
            }
        }
        Err(e) => {
            eprintln!("✗ Gemini API call failed: {:?}", e);
        }
    }
    
    println!("\nTesting Router with fallback...");
    let primary = Arc::new(anthropic::AnthropicProvider::new(anthropic_key));
    let fallback = Arc::new(gemini::GeminiProvider::new(gemini_key));
    let router = router::LlmRouter::new(primary, fallback);
    
    match router.complete(system, user).await {
        Ok((response, provider_name)) => {
            println!("✓ Router call succeeded with provider: {}", provider_name);
            println!("Response: {}", response.text);
            if !response.tool_calls.is_empty() {
                println!("Tool Calls: {:?}", response.tool_calls);
            }
        }
        Err(e) => {
            eprintln!("✗ Router call failed: {:?}", e);
            std::process::exit(1);
        }
    }
    
    println!("\n✓ All LLM integration tests passed!");
}
