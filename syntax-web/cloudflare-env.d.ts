// Extends the CloudflareEnv interface used by getCloudflareContext()
// so env.AI is correctly typed in API routes.
declare global {
  interface CloudflareEnv {
    AI: Ai;
  }
}
export {};
