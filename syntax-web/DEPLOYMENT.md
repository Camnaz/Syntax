# SYNTAX Web Deployment

## Cloudflare Pages Deployment

This project is configured for **Cloudflare Pages**, not Vercel.

### Build Configuration

**Framework preset:** Next.js  
**Build command:** `npm run build`  
**Build output directory:** `.next`  
**Node version:** 20.x

### Environment Variables

Set these in Cloudflare Pages dashboard:

```bash
NEXT_PUBLIC_SUPABASE_URL=<your-production-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-production-anon-key>
NEXT_PUBLIC_SYNTAX_API_URL=<your-railway-backend-url>
```

### Deployment Steps

1. Connect GitHub repository to Cloudflare Pages
2. Configure build settings (see above)
3. Add environment variables
4. Deploy

### Custom Domain

Configure custom domain in Cloudflare Pages dashboard after first deployment.

### Notes

- Cloudflare Pages supports Next.js with Edge Runtime
- Static assets are automatically optimized
- Global CDN distribution included
- Free SSL/TLS certificates
