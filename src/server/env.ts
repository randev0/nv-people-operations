import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export const env = {
  get appUrl(): string {
    return required("APP_URL").replace(/\/$/, "");
  },
  get appOrigin(): string {
    return new URL(this.appUrl).origin;
  },
  get sessionSecret(): string {
    const s = required("SESSION_SECRET");
    if (s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
    return s;
  },
  get secureCookies(): boolean {
    return this.appUrl.startsWith("https://");
  },
  anthropicKey: () => process.env.ANTHROPIC_API_KEY || null,
  anthropicModel: () => process.env.ANTHROPIC_MODEL || null,
  /** "anthropic" (default) or "openai". */
  aiProvider: () => (process.env.AI_PROVIDER === "openai" ? "openai" : "anthropic") as "anthropic" | "openai",
  openaiKey: () => process.env.OPENAI_API_KEY || null,
  openaiModel: () => process.env.OPENAI_MODEL || null,
  loginLimit: () => Number(process.env.LOGIN_RATE_LIMIT ?? 10),
  loginWindowMinutes: () => Number(process.env.LOGIN_RATE_WINDOW_MINUTES ?? 15),
  aiLimitPerMinute: () => Number(process.env.AI_RATE_LIMIT_PER_MINUTE ?? 10),
};
