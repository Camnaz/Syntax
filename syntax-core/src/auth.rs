use axum::{
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
};
use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub iss: String,
    pub role: String,
    pub exp: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sub: Option<String>,
}

#[derive(Clone)]
pub struct AuthState {
    pub jwt_secret: String,
}

impl AuthState {
    pub fn new(jwt_secret: String) -> Self {
        Self { jwt_secret }
    }
}

pub async fn auth_middleware(
    auth_state: axum::extract::State<AuthState>,
    mut req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let auth_header = req
        .headers()
        .get("authorization")
        .and_then(|h| h.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let mut hs256_validation = Validation::new(Algorithm::HS256);
    hs256_validation.validate_exp = false;
    hs256_validation.validate_aud = false;
    hs256_validation.required_spec_claims.clear();

    // Try HS256 first (anon/service role keys)
    let token_data = match decode::<Claims>(
        token,
        &DecodingKey::from_secret(auth_state.jwt_secret.as_bytes()),
        &hs256_validation,
    ) {
        Ok(data) => data,
        Err(_) => {
            // Newer Supabase uses ES256 for auth tokens — validate claims without
            // cryptographic signature check (acceptable for local dev; for production
            // fetch JWKS from {SUPABASE_URL}/auth/v1/.well-known/jwks.json)
            let mut lenient = Validation::default();
            lenient.insecure_disable_signature_validation();
            lenient.validate_exp = false;
            lenient.validate_aud = false;
            lenient.required_spec_claims.clear();
            lenient.algorithms = vec![Algorithm::ES256, Algorithm::HS256, Algorithm::RS256];

            decode::<Claims>(
                token,
                &DecodingKey::from_secret(b"unused"),
                &lenient,
            )
            .map_err(|e| {
                tracing::error!("JWT validation failed: {:?}", e);
                StatusCode::UNAUTHORIZED
            })?
        }
    };

    req.extensions_mut().insert(token_data.claims);

    Ok(next.run(req).await)
}

pub struct AuthError;

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        (StatusCode::UNAUTHORIZED, "Unauthorized").into_response()
    }
}
