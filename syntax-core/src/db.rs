use postgrest::Postgrest;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub id: Uuid,
    pub portfolio_id: Uuid,
    pub ticker: String,
    #[serde(default)]
    pub shares: Option<f64>,
    #[serde(default)]
    pub dollar_amount: Option<f64>,
    #[serde(default)]
    pub average_purchase_price: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Portfolio {
    pub id: Uuid,
    pub user_id: Uuid,
    pub name: String,
    #[serde(default)]
    pub total_capital: f64,
    #[serde(default)]
    pub available_cash: f64,
    #[serde(default = "default_max_drawdown")]
    pub max_drawdown_limit: f64,
    #[serde(default = "default_min_sharpe")]
    pub min_sharpe_ratio: f64,
    #[serde(default = "default_max_position")]
    pub max_position_size: f64,
}

fn default_max_drawdown() -> f64 { 0.05 }
fn default_min_sharpe() -> f64 { 1.2 }
fn default_max_position() -> f64 { 0.25 }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostCeilingStatus {
    pub allowed: bool,
    pub current_cost_cents: i32,
    pub limit_cents: i32,
    pub warning_level: String,
}

#[derive(Clone)]
pub struct SupabaseClient {
    client: Postgrest,
}

impl SupabaseClient {
    pub fn new(url: &str, service_role_key: &str) -> Self {
        let client = Postgrest::new(format!("{}/rest/v1", url))
            .insert_header("apikey", service_role_key)
            .insert_header("Authorization", format!("Bearer {}", service_role_key));
        
        Self { client }
    }

    pub async fn get_portfolio(&self, portfolio_id: Uuid) -> Result<Option<Portfolio>, Box<dyn std::error::Error + Send + Sync>> {
        let resp = self.client
            .from("portfolios")
            .select("*")
            .eq("id", portfolio_id.to_string())
            .execute()
            .await
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
            
        let body = resp.text().await
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
        let portfolios: Vec<Portfolio> = serde_json::from_str(&body).map_err(|e| {
            tracing::warn!("get_portfolio serde error: {} | body_preview: {}", e, &body[..body.len().min(200)]);
            Box::new(e) as Box<dyn std::error::Error + Send + Sync>
        })?;
        
        Ok(portfolios.into_iter().next())
    }

    pub async fn get_positions(&self, portfolio_id: Uuid) -> Result<Vec<Position>, Box<dyn std::error::Error + Send + Sync>> {
        let resp = self.client
            .from("positions")
            .select("*")
            .eq("portfolio_id", portfolio_id.to_string())
            .execute()
            .await
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
            
        let body = resp.text().await
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
        let positions: Vec<Position> = serde_json::from_str(&body).map_err(|e| {
            tracing::warn!("get_positions serde error: {} | body_preview: {}", e, &body[..body.len().min(200)]);
            Box::new(e) as Box<dyn std::error::Error + Send + Sync>
        })?;
        
        Ok(positions)
    }

    pub async fn upsert_position(
        &self, 
        portfolio_id: Uuid, 
        ticker: &str, 
        shares: Option<f64>,
        price: Option<f64>
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let payload = serde_json::json!({
            "portfolio_id": portfolio_id.to_string(),
            "ticker": ticker.to_uppercase(),
            "shares": shares,
            "average_purchase_price": price
        });

        // Supabase REST UPSERT equivalent: we use on_conflict
        let resp = self.client
            .from("positions")
            .upsert(payload.to_string())
            .on_conflict("portfolio_id,ticker")
            .execute()
            .await
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;

        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to upsert position: {}", body),
            )));
        }

        Ok(())
    }

    /// Check if user is within their cost ceiling. Returns (allowed, current_cost_cents, limit_cents, warning_level).
    pub async fn check_cost_ceiling(&self, user_id: Uuid) -> Result<CostCeilingStatus, Box<dyn std::error::Error + Send + Sync>> {
        let resp = self.client
            .rpc("check_cost_ceiling", format!(r#"{{"p_user_id":"{}"}}"#, user_id))
            .execute()
            .await
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;

        let body = resp.text().await
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
        let results: Vec<CostCeilingStatus> = serde_json::from_str(&body)
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;

        results.into_iter().next().ok_or_else(|| {
            Box::new(std::io::Error::new(std::io::ErrorKind::NotFound, "No subscription found")) as Box<dyn std::error::Error + Send + Sync>
        })
    }

    /// Add cost (in cents) after a verification completes.
    pub async fn add_verification_cost(&self, user_id: Uuid, cost_cents: i32) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let resp = self.client
            .rpc("add_verification_cost", format!(r#"{{"p_user_id":"{}","p_cost_cents":{}}}"#, user_id, cost_cents))
            .execute()
            .await
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;

        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to add verification cost: {}", body),
            )));
        }
        Ok(())
    }

    /// Return all portfolio IDs in the system — used by the always-on research daemon.
    pub async fn list_portfolio_ids(&self) -> Result<Vec<Uuid>, Box<dyn std::error::Error + Send + Sync>> {
        #[derive(Deserialize)]
        struct Row { id: Uuid }
        let resp = self.client
            .from("portfolios")
            .select("id")
            .execute()
            .await
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
        let body = resp.text().await
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
        let rows: Vec<Row> = serde_json::from_str(&body)
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
        Ok(rows.into_iter().map(|r| r.id).collect())
    }

    pub async fn update_available_cash(
        &self,
        portfolio_id: Uuid,
        new_cash: f64
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let payload = serde_json::json!({
            "available_cash": new_cash
        });

        let resp = self.client
            .from("portfolios")
            .update(payload.to_string())
            .eq("id", portfolio_id.to_string())
            .execute()
            .await
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;

        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to update available cash: {}", body),
            )));
        }

        Ok(())
    }
}
