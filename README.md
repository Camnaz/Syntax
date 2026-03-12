# SYNTAX — Deterministic Capital Command Center
**Olea Computer Company**

> Loop Engineering over Vibe Coding. Determinism through verification.

## Architecture

| Layer | Technology | Deployment |
|-------|-----------|------------|
| Backend | Rust + Axum | Railway |
| Frontend | Next.js 14 + Tailwind | Vercel |
| Database | PostgreSQL via Supabase | Supabase |
| Auth | Supabase Auth + JWT | Supabase |
| Billing | Stripe | Stripe |
| LLM | Claude (primary) + Gemini (fallback) | API |

## Quick Start

```bash
# 1. Copy environment variables
cp .env.example .env
# Fill in all values in .env

# 2. Start Supabase locally
supabase start
supabase db push

# 3. Run Rust backend
cd syntax-core && cargo run

# 4. Run Next.js frontend (new terminal)
cd syntax-web && npm install && npm run dev
```

## Development Phases

See [WINDSURF.md](./WINDSURF.md) for the complete phased implementation guide.  
Each phase ends with a checkpoint requiring manual confirmation before proceeding.

## Tiers

| Tier | Price | Verifications/mo |
|------|-------|-----------------|
| Observer | Free | 0 (read signals) |
| Operator | $29 | 50 |
| Sovereign | $99 | Unlimited |
| Institutional | $499 | Unlimited + API |

## Compliance

SYNTAX is an analytical modeling tool. It does not constitute personalized 
investment advice and is not a registered investment advisor. See full disclaimer 
in the application footer.

---
*Olea Computer Company — Built with Loop Engineering principles*
