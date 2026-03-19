use serde::Serialize;
use std::env;

#[derive(Serialize)]
struct LogResearchParams<'a> {
    p_user_id:     &'a str,
    p_query_text:  &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_response:    Option<&'a str>,
    p_signal_type: &'a str,
    p_model:       &'a str,
    p_tier:        &'a str,
    p_tokens:      i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_score:       Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_sharpe:      Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_drawdown:    Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_latency_ms:  Option<i32>,
}

/// Detect a coarse signal type from the inquiry text.
pub fn detect_signal(inquiry: &str) -> &'static str {
    let q = inquiry.to_lowercase();
    if q.contains("buy") || q.contains("purchase") || q.contains("accumulate") {
        "buy"
    } else if q.contains("sell") || q.contains("exit") || q.contains("trim") {
        "sell"
    } else if q.contains("hold") || q.contains("keep") || q.contains("stay") {
        "hold"
    } else if q.contains("hedge") || q.contains("protect") || q.contains("put") || q.contains("short") {
        "hedge"
    } else if q.contains("rebalance") || q.contains("reallocate") || q.contains("rotate") {
        "rebalance"
    } else if q.contains("deploy") || q.contains("invest") || q.contains("i have $") || q.contains("i have $") {
        "capital_deploy"
    } else {
        "general"
    }
}

/// Fire-and-forget call to the log_research Supabase RPC.
/// Fails silently — never blocks the main verification path.
pub async fn log_research(
    user_id:    &str,
    query_text: &str,
    response:   Option<&str>,
    signal:     &str,
    model:      &str,
    tier:       &str,
    tokens:     i32,
    score:      Option<f64>,
    sharpe:     Option<f64>,
    drawdown:   Option<f64>,
    latency_ms: Option<i32>,
) {
    let supabase_url = match env::var("SUPABASE_URL")
        .or_else(|_| env::var("NEXT_PUBLIC_SUPABASE_URL"))
    {
        Ok(u) => u,
        Err(_) => { tracing::debug!("log_research: SUPABASE_URL not set, skipping"); return; }
    };
    let service_key = match env::var("SUPABASE_SERVICE_ROLE_KEY")
        .or_else(|_| env::var("SUPABASE_SERVICE_KEY"))
    {
        Ok(k) => k,
        Err(_) => { tracing::debug!("log_research: SUPABASE_SERVICE_ROLE_KEY not set, skipping"); return; }
    };

    // Truncate response to avoid massive payloads
    let response_owned: Option<String> = response.map(|r| {
        if r.len() > 1000 { r[..1000].to_string() } else { r.to_string() }
    });
    let response_ref = response_owned.as_deref();

    let params = LogResearchParams {
        p_user_id:    user_id,
        p_query_text: query_text,
        p_response:   response_ref,
        p_signal_type: signal,
        p_model:      model,
        p_tier:       tier,
        p_tokens:     tokens,
        p_score:      score,
        p_sharpe:     sharpe,
        p_drawdown:   drawdown,
        p_latency_ms: latency_ms,
    };

    let client = reqwest::Client::new();
    match client
        .post(format!("{}/rest/v1/rpc/log_research", supabase_url))
        .header("apikey",        &service_key)
        .header("Authorization", format!("Bearer {}", service_key))
        .header("Content-Type",  "application/json")
        .json(&params)
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            tracing::debug!("log_research: logged signal={} model={}", signal, model);
        }
        Ok(resp) => {
            tracing::warn!("log_research: RPC returned {}", resp.status());
        }
        Err(e) => {
            tracing::warn!("log_research: request failed: {}", e);
        }
    }
}
