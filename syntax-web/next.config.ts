import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Cloudflare Pages deployment via @cloudflare/next-on-pages
  // Run: npx @cloudflare/next-on-pages to build for CF Pages
  experimental: {
    // Retain server actions on edge-compatible routes
  },
  // Security: strip x-powered-by header
  poweredByHeader: false,
  // Allow images from Supabase storage and other trusted domains
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "finance.yahoo.com" },
      { protocol: "https", hostname: "logo.clearbit.com" },
    ],
  },
};

export default nextConfig;
