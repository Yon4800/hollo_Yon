import { describe, expect, it } from "vitest";

import type { Account, AccountOwner } from "../schema.ts";
import { type ProfileAccount, Profile } from "./Profile.tsx";

describe("Profile", () => {
  const baseAccount: Account = {
    id: "00000000-0000-0000-0000-000000000001",
    iri: "https://hollo.test/users/botuser",
    instanceHost: "hollo.test",
    type: "Person",
    name: "Test User",
    handle: "@test@hollo.test",
    bioHtml: "<p>Hello</p>",
    url: "https://hollo.test/@test",
    protected: false,
    avatarUrl: null,
    coverUrl: null,
    inboxUrl: "https://hollo.test/users/test/inbox",
    followersUrl: "https://hollo.test/users/test/followers",
    sharedInboxUrl: "https://hollo.test/inbox",
    featuredUrl: null,
    followingCount: 0,
    followersCount: 0,
    postsCount: 0,
    fieldHtmls: {},
    emojis: {},
    published: new Date(),
    updated: new Date(),
    fetched: null,
    successorId: null,
    aliases: [],
    sensitive: false,
    suspended: false,
  };

  const baseOwner: AccountOwner = {
    id: baseAccount.id,
    handle: "test",
    bio: "Hello",
    fields: {},
    language: "en",
    visibility: "public",
    themeColor: "indigo",
    discoverable: true,
    expandSpoilers: false,
    followingListPublic: true,
    followedTags: [],
    rsaPublicKeyJwk: {},
    rsaPrivateKeyJwk: {},
    ed25519PublicKeyJwk: {},
    ed25519PrivateKeyJwk: {},
  };

  it("does not render Bot badge for Person account", async () => {
    const account: ProfileAccount = { ...baseAccount, successor: null };
    const html = await (
      <Profile
        accountOwner={{ ...baseOwner, account }}
        baseUrl="https://hollo.test"
      />
    ).toString();
    expect(html).not.toContain(">Bot<");
  });

  it("renders Bot badge for Service account", async () => {
    const account: ProfileAccount = {
      ...baseAccount,
      type: "Service",
      successor: null,
    };
    const html = await (
      <Profile
        accountOwner={{ ...baseOwner, account }}
        baseUrl="https://hollo.test"
      />
    ).toString();
    expect(html).toContain(">Bot<");
  });
});
