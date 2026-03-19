use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Deserialize)]
pub struct ConsumeResult {
    pub ok:             bool,
    pub reason:         String,
    pub free_remaining: i32,
    pub balance:        i32,
}

#[derive(Debug, Serialize)]
struct ConsumeParams<'a> {
    p_user_id:    &'a str,
    p_credits:    i32,
    p_tier:       &'a str,
    p_model:      &'a str,
    p_tokens:     i32,
    p_latency_ms: i32,
    p_rust_valid: bool,
}

pub async fn consume_query(
    client:      &reqwest::Client,
    user_id:     &str,
    credits:     i32,
    tier:        &str,
    model:       &str,
    tokens:      i32,
    latency_ms:  i32,
    rust_valid:  bool,
) -> Result<ConsumeResult, reqwest::Error> {
    let supabase_url = env::var("SUPABASE_URL")
        .or_else(|_| env::var("NEXT_PUBLIC_SUPABASE_URL"))
        .expect("SUPABASE_URL not set");
    let service_key = env::var("SUPABASE_SERVICE_ROLE_KEY")
        .or_else(|_| env::var("SUPABASE_SERVICE_KEY"))
        .expect("SUPABASE_SERVICE_ROLE_KEY not set");

    let params = ConsumeParams {
        p_user_id: user_id,
        p_credits: credits,
        p_tier: tier,
        p_model: model,
        p_tokens: tokens,
        p_latency_ms: latency_ms,
        p_rust_valid: rust_valid,
    };

    let res = client
        .post(format!("{}/rest/v1/rpc/consume_query", supabase_url))
        .header("apikey",        &service_key)
        .header("Authorization", format!("Bearer {}", service_key))
        .header("Content-Type",  "application/json")
        .json(&params)
        .send()
        .await;

    match res {
        Ok(resp) => {
            // If RPC doesn't exist or columns missing, fail open (allow through)
            if !resp.status().is_success() {
                let status = resp.status();
                if status.as_u16() == 404 || status.as_u16() == 500 {
                    // RPC or columns not ready - fail open
                    tracing::warn!("consume_query RPC not ready, failing open");
                    return Ok(ConsumeResult {
                        ok: true,
                        reason: "credits_not_configured".to_string(),
                        free_remaining: 999,
                        balance: 999,
                    });
                }
            }
            let result: Result<ConsumeResult, _> = resp.json().await;
            match result {
                Ok(r) => Ok(r),
                Err(e) => {
                    // JSON parse failed - columns might not exist, fail open
                    tracing::warn!("consume_query response parse failed: {}, failing open", e);
                    Ok(ConsumeResult {
                        ok: true,
                        reason: "credits_not_configured".to_string(),
                        free_remaining: 999,
                        balance: 999,
                    })
                }
            }
        }
        Err(e) => {
            // Network error - fail open to not block users
            tracing::warn!("consume_query request failed: {}, failing open", e);
            Ok(ConsumeResult {
                ok: true,
                reason: "credits_check_failed".to_string(),
                free_remaining: 999,
                balance: 999,
            })
        }
    }
}
