import { desc } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { z } from "zod";

import { db } from "../../db";
import { blockDomain, unblockDomain } from "../../moderation";
import {
  scopeRequired,
  tokenRequired,
  type AccountOwnerVariables,
} from "../../oauth/middleware";
import { domainBlocks } from "../../schema";

const app = new Hono<{ Variables: AccountOwnerVariables }>();

const domainBodySchema = z.object({
  domain: z.string().min(1),
});

async function extractDomainParam(c: Context): Promise<string | null> {
  const contentType = c.req.header("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await c.req.json().catch(() => null);
    const parsed = domainBodySchema.safeParse(body);
    if (parsed.success) return parsed.data.domain;
  } else if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const body = await c.req.parseBody().catch(() => null);
    const parsed = domainBodySchema.safeParse(body);
    if (parsed.success) return parsed.data.domain;
  }
  const queryDomain = c.req.query("domain");
  if (queryDomain && queryDomain.trim().length > 0) {
    return queryDomain;
  }
  return null;
}

app.get("/", tokenRequired, scopeRequired(["read:blocks"]), async (c) => {
  const limitParam = c.req.query("limit");
  const limit = limitParam
    ? Math.min(200, Math.max(1, Number.parseInt(limitParam, 10) || 40))
    : 40;
  const rows = await db
    .select({ domain: domainBlocks.domain })
    .from(domainBlocks)
    .orderBy(desc(domainBlocks.created))
    .limit(limit);
  return c.json(rows.map((r) => r.domain));
});

app.post("/", tokenRequired, scopeRequired(["write:blocks"]), async (c) => {
  const domain = await extractDomainParam(c);
  if (domain == null) {
    return c.json({ error: "Validation failed: Domain is required" }, 422);
  }
  try {
    await blockDomain(domain);
  } catch {
    return c.json({ error: "Validation failed: Domain is invalid" }, 422);
  }
  return c.json({});
});

app.delete("/", tokenRequired, scopeRequired(["write:blocks"]), async (c) => {
  const domain = await extractDomainParam(c);
  if (domain == null) {
    return c.json({ error: "Validation failed: Domain is required" }, 422);
  }
  try {
    await unblockDomain(domain);
  } catch {
    return c.json({ error: "Validation failed: Domain is invalid" }, 422);
  }
  return c.json({});
});

export default app;
