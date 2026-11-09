import { PrismaClient } from "@prisma/client";

export const BASE = process.env.BASE_URL ?? "http://localhost:3100";
export const PASSWORD = process.env.DEMO_PASSWORD!;
export const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

/** Minimal cookie-holding HTTP client. */
export class Client {
  cookie = "";
  constructor(public origin: string | null = BASE) {}

  async req(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
    const headers: Record<string, string> = { ...extraHeaders };
    if (this.cookie) headers.cookie = this.cookie;
    if (this.origin && method !== "GET") headers.origin = this.origin;
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(`${BASE}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) {
      const [pair] = c.split(";");
      if (/max-age=0|expires=thu, 01 jan 1970/i.test(c) || pair.endsWith("=")) this.cookie = "";
      else this.cookie = pair;
    }
    const text = await res.text();
    let json: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, json, headers: res.headers };
  }
  get = (p: string) => this.req("GET", p);
  post = (p: string, b?: unknown) => this.req("POST", p, b ?? {});
  put = (p: string, b: unknown) => this.req("PUT", p, b);
  patch = (p: string, b: unknown) => this.req("PATCH", p, b);
}

export async function login(email: string, password = PASSWORD) {
  const c = new Client();
  const r = await c.post("/auth/login", { email, password });
  if (r.status !== 200) throw new Error(`login ${email} failed: ${r.status} ${JSON.stringify(r.json)}`);
  return c;
}

export const userId = async (email: string) => (await db.user.findUniqueOrThrow({ where: { email }, select: { id: true } })).id;
