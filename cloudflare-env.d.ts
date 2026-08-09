declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    MEDIA: R2Bucket;
    AI?: {
      run(model: string, input: Record<string, unknown>): Promise<unknown>;
    };
    TOKEN_ENCRYPTION_KEY: string;
  }
}
