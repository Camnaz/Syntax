use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub port: u16,
    pub supabase_url: String,
    pub supabase_jwt_secret: String,
    pub supabase_service_role_key: String,
    pub anthropic_api_key: String,
    pub gemini_api_key: String,
    pub llm_primary_provider: String,
    pub llm_fallback_provider: String,
    pub max_concurrent_verifications: usize,
    pub olea_margin_pct: f64,
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        Ok(Config {
            port: env::var("PORT")
                .unwrap_or_else(|_| "8080".to_string())
                .parse()
                .map_err(|_| "Invalid PORT")?,
            supabase_url: env::var("SUPABASE_URL")
                .map_err(|_| "SUPABASE_URL not set")?,
            supabase_jwt_secret: env::var("SUPABASE_JWT_SECRET")
                .map_err(|_| "SUPABASE_JWT_SECRET not set")?,
            supabase_service_role_key: env::var("SUPABASE_SERVICE_ROLE_KEY")
                .map_err(|_| "SUPABASE_SERVICE_ROLE_KEY not set")?,
            anthropic_api_key: env::var("ANTHROPIC_API_KEY")
                .map_err(|_| "ANTHROPIC_API_KEY not set")?,
            gemini_api_key: env::var("GEMINI_API_KEY")
                .map_err(|_| "GEMINI_API_KEY not set")?,
            llm_primary_provider: env::var("LLM_PRIMARY_PROVIDER")
                .unwrap_or_else(|_| "anthropic".to_string()),
            llm_fallback_provider: env::var("LLM_FALLBACK_PROVIDER")
                .unwrap_or_else(|_| "gemini".to_string()),
            max_concurrent_verifications: env::var("MAX_CONCURRENT_VERIFICATIONS")
                .unwrap_or_else(|_| "200".to_string())
                .parse()
                .map_err(|_| "Invalid MAX_CONCURRENT_VERIFICATIONS")?,
            olea_margin_pct: env::var("OLEA_MARGIN_PCT")
                .unwrap_or_else(|_| "0.30".to_string())
                .parse()
                .map_err(|_| "Invalid OLEA_MARGIN_PCT")?,
        })
    }
}
