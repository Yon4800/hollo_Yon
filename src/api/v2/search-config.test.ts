import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanDatabase } from "../../../tests/helpers";
import {
  bearerAuthorization,
  createAccount,
  createOAuthApplication,
  getAccessToken,
} from "../../../tests/helpers/oauth";
import db from "../../db";
import app from "../../index";
import { accounts as accountsTable, instances, posts } from "../../schema";
import type { Uuid } from "../../uuid";

describe.sequential("search configuration (ENABLE_SEARCH, ENABLE_ACCOUNT_SEARCH)", () => {
  let client: Awaited<ReturnType<typeof createOAuthApplication>>;
  let account: Awaited<ReturnType<typeof createAccount>>;
  let accessToken: Awaited<ReturnType<typeof getAccessToken>>;
  const originalEnableSearch = process.env.ENABLE_SEARCH;
  const originalEnableAccountSearch = process.env.ENABLE_ACCOUNT_SEARCH;

  beforeEach(async () => {
    await cleanDatabase();

    account = await createAccount({ generateKeyPair: true });
    client = await createOAuthApplication({
      scopes: ["read:search", "read:accounts", "write"],
    });
    accessToken = await getAccessToken(client, account, [
      "read:search",
      "read:accounts",
      "write",
    ]);

    // Create a target account for search
    await db
      .insert(instances)
      .values({
        host: "target.test",
      })
      .onConflictDoNothing();

    await db.insert(accountsTable).values({
      id: crypto.randomUUID() as Uuid,
      iri: "https://target.test/users/searchtarget",
      instanceHost: "target.test",
      type: "Person",
      name: "Search Target",
      emojis: {},
      handle: "@searchtarget@target.test",
      bioHtml: "",
      url: "https://target.test/@searchtarget",
      protected: false,
      inboxUrl: "https://target.test/users/searchtarget/inbox",
    });

    // Create a test post for search
    const postId = crypto.randomUUID() as Uuid;
    await db.insert(posts).values({
      id: postId,
      iri: `https://hollo.test/posts/${postId}`,
      type: "Note",
      accountId: account.id,
      visibility: "public",
      contentHtml: "<p>SearchableUniqueKeyword in post</p>",
      content: "SearchableUniqueKeyword in post",
      published: new Date(),
    });
  });

  afterEach(() => {
    if (originalEnableSearch !== undefined) {
      process.env.ENABLE_SEARCH = originalEnableSearch;
    } else {
      delete process.env.ENABLE_SEARCH;
    }
    if (originalEnableAccountSearch !== undefined) {
      process.env.ENABLE_ACCOUNT_SEARCH = originalEnableAccountSearch;
    } else {
      delete process.env.ENABLE_ACCOUNT_SEARCH;
    }
  });

  it("returns both accounts and statuses by default", async () => {
    delete process.env.ENABLE_SEARCH;
    delete process.env.ENABLE_ACCOUNT_SEARCH;

    const res = await app.request("/api/v2/search?q=searchtarget", {
      headers: { authorization: bearerAuthorization(accessToken) },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.accounts.length).toBeGreaterThan(0);

    const postRes = await app.request(
      "/api/v2/search?q=SearchableUniqueKeyword",
      {
        headers: { authorization: bearerAuthorization(accessToken) },
      },
    );
    expect(postRes.status).toBe(200);
    const postJson = await postRes.json();
    expect(postJson.statuses.length).toBeGreaterThan(0);
  });

  it("disables status search when ENABLE_SEARCH is false", async () => {
    process.env.ENABLE_SEARCH = "false";
    delete process.env.ENABLE_ACCOUNT_SEARCH;

    // Post search should return empty statuses
    const postRes = await app.request(
      "/api/v2/search?q=SearchableUniqueKeyword",
      {
        headers: { authorization: bearerAuthorization(accessToken) },
      },
    );
    expect(postRes.status).toBe(200);
    const postJson = await postRes.json();
    expect(postJson.statuses).toEqual([]);

    // Account search should still work
    const accountRes = await app.request("/api/v2/search?q=searchtarget", {
      headers: { authorization: bearerAuthorization(accessToken) },
    });
    expect(accountRes.status).toBe(200);
    const accountJson = await accountRes.json();
    expect(accountJson.accounts.length).toBeGreaterThan(0);
  });

  it("disables account search when ENABLE_ACCOUNT_SEARCH is false", async () => {
    delete process.env.ENABLE_SEARCH;
    process.env.ENABLE_ACCOUNT_SEARCH = "false";

    // Account search in v2 should return empty accounts
    const accountRes = await app.request("/api/v2/search?q=searchtarget", {
      headers: { authorization: bearerAuthorization(accessToken) },
    });
    expect(accountRes.status).toBe(200);
    const accountJson = await accountRes.json();
    expect(accountJson.accounts).toEqual([]);

    // Account search in v1 should return empty array
    const v1Res = await app.request("/api/v1/accounts/search?q=searchtarget", {
      headers: { authorization: bearerAuthorization(accessToken) },
    });
    expect(v1Res.status).toBe(200);
    const v1Json = await v1Res.json();
    expect(v1Json).toEqual([]);

    // Post search should still work
    const postRes = await app.request(
      "/api/v2/search?q=SearchableUniqueKeyword",
      {
        headers: { authorization: bearerAuthorization(accessToken) },
      },
    );
    expect(postRes.status).toBe(200);
    const postJson = await postRes.json();
    expect(postJson.statuses.length).toBeGreaterThan(0);
  });

  it("disables all search when both are false", async () => {
    process.env.ENABLE_SEARCH = "false";
    process.env.ENABLE_ACCOUNT_SEARCH = "false";

    const res = await app.request("/api/v2/search?q=searchtarget", {
      headers: { authorization: bearerAuthorization(accessToken) },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      accounts: [],
      statuses: [],
      hashtags: [],
    });
  });
});
