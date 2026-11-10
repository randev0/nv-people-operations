/**
 * DEBUG_LOG Bug 2 class check: a <form> without an explicit method falls back to GET when
 * client JavaScript fails, and the browser then puts every field (passwords included) in
 * the URL. Every form in src/ must say method="post" (or method="get" for filter forms).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

test("every <form> in src declares its method", () => {
  const missing: string[] = [];
  for (const f of files("src")) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/<form\b[^>]*>/gs)) {
      if (!/\bmethod=/.test(m[0])) missing.push(`${f}:${src.slice(0, m.index).split("\n").length}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("forms with a password field post", () => {
  for (const f of files("src")) {
    const src = readFileSync(f, "utf8");
    if (!/type=\{?["']?password|type=\{shown \? "text" : "password"\}/.test(src)) continue;
    for (const m of src.matchAll(/<form\b[^>]*>/gs)) assert.match(m[0], /method="post"/, f);
  }
});
