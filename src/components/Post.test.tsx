import { describe, expect, it } from "vitest";

import type { Account } from "../schema.ts";
import { type PostForView, Post } from "./Post.tsx";

describe("Post", () => {
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
  };

  const basePost: PostForView = {
    id: "00000000-0000-0000-0000-000000000002",
    iri: "https://hollo.test/users/botuser/posts/1",
    type: "Note",
    accountId: baseAccount.id,
    account: baseAccount,
    applicationId: null,
    replyTargetId: null,
    replyTarget: null,
    sharingId: null,
    sharing: null,
    quoteTargetId: null,
    quoteTarget: null,
    quoteTargetIri: null,
    quoteState: null,
    quoteAuthorizationIri: null,
    quoteApprovalPolicy: "public",
    visibility: "public",
    summary: null,
    contentHtml: "<p>Test post</p>",
    content: "Test post",
    pollId: null,
    poll: null,
    language: "en",
    tags: {},
    emojis: {},
    sensitive: false,
    url: "https://hollo.test/@test/1",
    previewCard: null,
    repliesCount: 0,
    sharesCount: 0,
    likesCount: 0,
    quotesCount: 0,
    idempotenceKey: null,
    published: new Date(),
    updated: new Date(),
    media: [],
    reactions: [],
  };

  it("does not render Bot badge for Person author", async () => {
    const html = await (
      <Post post={basePost} baseUrl="https://hollo.test" />
    ).toString();
    expect(html).not.toContain(">Bot<");
  });

  it("renders audio player for audio media attachment", async () => {
    const post: PostForView = {
      ...basePost,
      media: [
        {
          id: "00000000-0000-0000-0000-000000000003",
          postId: basePost.id,
          position: 0,
          type: "audio/mpeg",
          url: "https://hollo.test/media/song.mp3",
          width: 0,
          height: 0,
          description: "My cool song",
          thumbnailUrl: "https://hollo.test/media/song.mp3",
          thumbnailType: "audio/mpeg",
          thumbnailWidth: 0,
          thumbnailHeight: 0,
          thumbnailCleaned: false,
          created: new Date(),
        },
      ],
    };
    const html = await (
      <Post post={post} baseUrl="https://hollo.test" />
    ).toString();
    expect(html).toContain("<audio");
    expect(html).toContain("My cool song");
    expect(html).toContain("https://hollo.test/media/song.mp3");
  });

  it("renders download card for MIDI attachment", async () => {
    const post: PostForView = {
      ...basePost,
      media: [
        {
          id: "00000000-0000-0000-0000-000000000004",
          postId: basePost.id,
          position: 0,
          type: "audio/midi",
          url: "https://hollo.test/media/tune.mid",
          width: 0,
          height: 0,
          description: "Piano track",
          thumbnailUrl: "https://hollo.test/media/tune.mid",
          thumbnailType: "audio/midi",
          thumbnailWidth: 0,
          thumbnailHeight: 0,
          thumbnailCleaned: false,
          created: new Date(),
        },
      ],
    };
    const html = await (
      <Post post={post} baseUrl="https://hollo.test" />
    ).toString();
    expect(html).toContain("MIDI file (.mid)");
    expect(html).toContain("Piano track");
    expect(html).toContain("download");
  });
});
