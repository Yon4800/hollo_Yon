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
import { accounts, follows, instances, posts } from "../../schema";
import type { Uuid } from "../../uuid";
import { uuidv7 } from "../../uuid";

describe.sequential("reblog muting (POST /follow reblogs parameter, SHOW_REBLOGS, shares=false)", () => {
  let owner: Awaited<ReturnType<typeof createAccount>>;
  let client: Awaited<ReturnType<typeof createOAuthApplication>>;
  let accessToken: Awaited<ReturnType<typeof getAccessToken>>;
  const originalShowReblogs = process.env.SHOW_REBLOGS;

  beforeEach(async () => {
    await cleanDatabase();

    owner = await createAccount({ generateKeyPair: true });
    client = await createOAuthApplication({
      scopes: ["read:statuses", "write:follows", "read:accounts", "write"],
    });
    accessToken = await getAccessToken(client, owner, [
      "read:statuses",
      "write:follows",
      "read:accounts",
      "write",
    ]);

    await db
      .insert(instances)
      .values({
        host: "remote.test",
      })
      .onConflictDoNothing();
  });

  afterEach(() => {
    if (originalShowReblogs !== undefined) {
      process.env.SHOW_REBLOGS = originalShowReblogs;
    } else {
      delete process.env.SHOW_REBLOGS;
    }
  });

  async function createRemoteAccount(username: string): Promise<Uuid> {
    const id = crypto.randomUUID() as Uuid;
    await db.insert(accounts).values({
      id,
      iri: `https://remote.test/users/${username}`,
      instanceHost: "remote.test",
      type: "Person",
      name: username,
      emojis: {},
      handle: `@${username}@remote.test`,
      bioHtml: "",
      url: `https://remote.test/@${username}`,
      protected: false,
      inboxUrl: `https://remote.test/users/${username}/inbox`,
    });
    return id;
  }

  it("sets and updates reblogs via POST /api/v1/accounts/:id/follow", async () => {
    const targetId = await createRemoteAccount("targetuser");

    // Follow with reblogs: false
    const followRes = await app.request(`/api/v1/accounts/${targetId}/follow`, {
      method: "POST",
      headers: {
        authorization: bearerAuthorization(accessToken),
        "content-type": "application/json",
      },
      body: JSON.stringify({ reblogs: false }),
    });
    expect(followRes.status).toBe(200);
    const followJson = await followRes.json();
    expect(followJson.following).toBe(true);
    expect(followJson.showing_reblogs).toBe(false);

    // Update to reblogs: true
    const updateRes = await app.request(`/api/v1/accounts/${targetId}/follow`, {
      method: "POST",
      headers: {
        authorization: bearerAuthorization(accessToken),
        "content-type": "application/json",
      },
      body: JSON.stringify({ reblogs: true }),
    });
    expect(updateRes.status).toBe(200);
    const updateJson = await updateRes.json();
    expect(updateJson.following).toBe(true);
    expect(updateJson.showing_reblogs).toBe(true);
  });

  it("filters out reblogs from accounts with shares=false in home timeline", async () => {
    const userA = await createRemoteAccount("userA");
    const userB = await createRemoteAccount("userB");
    const originalAuthor = await createRemoteAccount("originalAuthor");

    // Follow userA with shares: true
    await db.insert(follows).values({
      iri: `https://hollo.test/follows/${crypto.randomUUID()}`,
      followerId: owner.id,
      followingId: userA,
      shares: true,
      approved: new Date(),
    });

    // Follow userB with shares: false (reblog muted)
    await db.insert(follows).values({
      iri: `https://hollo.test/follows/${crypto.randomUUID()}`,
      followerId: owner.id,
      followingId: userB,
      shares: false,
      approved: new Date(),
    });

    // Create an original post by originalAuthor
    const originalPostId = uuidv7();
    await db.insert(posts).values({
      id: originalPostId,
      iri: `https://remote.test/posts/${originalPostId}`,
      type: "Note",
      accountId: originalAuthor,
      visibility: "public",
      contentHtml: "<p>Original Post</p>",
      content: "Original Post",
      published: new Date(),
    });

    // userA boosts the post
    const boostAId = uuidv7();
    await db.insert(posts).values({
      id: boostAId,
      iri: `https://remote.test/posts/${boostAId}`,
      type: "Note",
      accountId: userA,
      sharingId: originalPostId,
      visibility: "public",
      contentHtml: "",
      content: "",
      published: new Date(),
    });

    // userB boosts the post
    const boostBId = uuidv7();
    await db.insert(posts).values({
      id: boostBId,
      iri: `https://remote.test/posts/${boostBId}`,
      type: "Note",
      accountId: userB,
      sharingId: originalPostId,
      visibility: "public",
      contentHtml: "",
      content: "",
      published: new Date(),
    });

    // userB also writes an original post
    const postBId = uuidv7();
    await db.insert(posts).values({
      id: postBId,
      iri: `https://remote.test/posts/${postBId}`,
      type: "Note",
      accountId: userB,
      visibility: "public",
      contentHtml: "<p>User B Original Post</p>",
      content: "User B Original Post",
      published: new Date(),
    });

    // Query home timeline
    const res = await app.request("/api/v1/timelines/home", {
      headers: { authorization: bearerAuthorization(accessToken) },
    });
    expect(res.status).toBe(200);
    const timeline = await res.json();
    const timelineIds = timeline.map((p: { id: string }) => p.id);

    // boostA should be present
    expect(timelineIds).toContain(boostAId);
    // boostB should be filtered out because userB has shares = false
    expect(timelineIds).not.toContain(boostBId);
    // userB's original post should still be present
    expect(timelineIds).toContain(postBId);
  });

  it("filters out all reblogs when SHOW_REBLOGS is false", async () => {
    process.env.SHOW_REBLOGS = "false";

    const userA = await createRemoteAccount("userA2");
    const originalAuthor = await createRemoteAccount("author2");

    await db.insert(follows).values({
      iri: `https://hollo.test/follows/${crypto.randomUUID()}`,
      followerId: owner.id,
      followingId: userA,
      shares: true,
      approved: new Date(),
    });

    const originalPostId = uuidv7();
    await db.insert(posts).values({
      id: originalPostId,
      iri: `https://remote.test/posts/${originalPostId}`,
      type: "Note",
      accountId: originalAuthor,
      visibility: "public",
      contentHtml: "<p>Original</p>",
      content: "Original",
      published: new Date(),
    });

    const boostId = uuidv7();
    await db.insert(posts).values({
      id: boostId,
      iri: `https://remote.test/posts/${boostId}`,
      type: "Note",
      accountId: userA,
      sharingId: originalPostId,
      visibility: "public",
      contentHtml: "",
      content: "",
      published: new Date(),
    });

    const directPostId = uuidv7();
    await db.insert(posts).values({
      id: directPostId,
      iri: `https://remote.test/posts/${directPostId}`,
      type: "Note",
      accountId: userA,
      visibility: "public",
      contentHtml: "<p>Direct Post</p>",
      content: "Direct Post",
      published: new Date(),
    });

    const res = await app.request("/api/v1/timelines/home", {
      headers: { authorization: bearerAuthorization(accessToken) },
    });
    expect(res.status).toBe(200);
    const timeline = await res.json();
    const timelineIds = timeline.map((p: { id: string }) => p.id);

    // Boost should be absent because SHOW_REBLOGS=false
    expect(timelineIds).not.toContain(boostId);
    // Direct post should be present
    expect(timelineIds).toContain(directPostId);
  });
});
