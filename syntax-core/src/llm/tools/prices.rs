use serde::Deserialize;

pub async fn fetch_price(ticker: &str) -> Result<f64, String> {
    let api_key = std::env::var("FINNHUB_API_KEY").unwrap_or_default();
    if api_key.is_empty() {
        return Err("FINNHUB_API_KEY not set".to_string());
    }
    
    let url = format!("https://finnhub.io/api/v1/quote?symbol={}&token={}", ticker, api_key);
    let client = reqwest::Client::new();
    
    #[derive(Deserialize)]
    struct FinnhubQuote {
        c: f64, // Current price
    }
    
    match client.get(&url).send().await {
        Ok(res) => {
            if let Ok(quote) = res.json::<FinnhubQuote>().await {
                if quote.c > 0.0 {
                    return Ok(quote.c);
                }
            }
            Err(format!("Could not get valid price for {}", ticker))
        }
        Err(e) => Err(e.to_string())
    }
}

#[derive(Debug, Deserialize)]
struct YahooChartResponse {
    chart: ChartData,
}

#[derive(Debug, Deserialize)]
struct ChartData {
    result: Option<Vec<ChartResult>>,
}

#[derive(Debug, Deserialize)]
struct ChartResult {
    indicators: Indicators,
}

#[derive(Debug, Deserialize)]
struct Indicators {
    quote: Vec<Quote>,
}

#[derive(Debug, Deserialize)]
struct Quote {
    close: Vec<Option<f64>>,
}

#[derive(Debug, Clone)]
pub struct RiskMetrics {
    pub annualized_return: f64,
    pub annualized_volatility: f64,
    pub sharpe_ratio: f64,
    pub max_drawdown: f64,
}

pub async fn calculate_asset_metrics(ticker: &str) -> Result<RiskMetrics, String> {
    let url = format!("https://query1.finance.yahoo.com/v8/finance/chart/{}?interval=1d&range=1y", ticker);
    let client = reqwest::Client::new();
    
    let res = client.get(&url)
        .header("User-Agent", "Mozilla/5.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;
        
    let text = res.text().await.map_err(|e| e.to_string())?;
    let data: YahooChartResponse = serde_json::from_str(&text).map_err(|e| format!("Failed to parse Yahoo Finance response: {}", e))?;
    
    let closes = data.chart.result
        .and_then(|mut r| r.pop())
        .and_then(|mut r| r.indicators.quote.pop())
        .map(|q| q.close)
        .ok_or_else(|| format!("No historical data for {}", ticker))?;
        
    let valid_closes: Vec<f64> = closes.into_iter().filter_map(|c| c).collect();
    if valid_closes.len() < 2 {
        return Err(format!("Insufficient data for {}", ticker));
    }
    
    let mut daily_returns = Vec::new();
    let mut peak = valid_closes[0];
    let mut max_drawdown = 0.0;
    
    for i in 1..valid_closes.len() {
        let ret = (valid_closes[i] - valid_closes[i-1]) / valid_closes[i-1];
        daily_returns.push(ret);
        
        if valid_closes[i] > peak {
            peak = valid_closes[i];
        }
        let drawdown = (peak - valid_closes[i]) / peak;
        if drawdown > max_drawdown {
            max_drawdown = drawdown;
        }
    }
    
    let mean_return = daily_returns.iter().sum::<f64>() / daily_returns.len() as f64;
    let variance = daily_returns.iter().map(|r| (r - mean_return).powi(2)).sum::<f64>() / daily_returns.len() as f64;
    let volatility = variance.sqrt();
    
    let annualized_return = mean_return * 252.0;
    let annualized_volatility = volatility * (252.0_f64).sqrt();
    let risk_free_rate = 0.04; // Assume 4% risk free rate
    
    let sharpe_ratio = if annualized_volatility > 0.0 {
        (annualized_return - risk_free_rate) / annualized_volatility
    } else {
        0.0
    };
    
    Ok(RiskMetrics {
        annualized_return,
        annualized_volatility,
        sharpe_ratio,
        max_drawdown,
    })
}
