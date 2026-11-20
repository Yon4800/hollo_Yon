import { describe, expect, it } from "vitest";

import {
  extractDomainFromIri,
  getDomainAndParents,
  isDomainInBlockedSet,
  normalizeDomain,
} from "./moderation";

describe("moderation domain helpers", () => {
  it("normalizes domain strings", () => {
    expect(normalizeDomain("Example.COM")).toBe("example.com");
    expect(normalizeDomain("https://Sub.Example.COM/users/foo")).toBe(
      "sub.example.com",
    );
    expect(normalizeDomain("  spam.social.  ")).toBe("spam.social");
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain("localhost")).toBeNull();
  });

  it("extracts domain from IRIs", () => {
    expect(extractDomainFromIri("https://Mastodon.Social/users/alice")).toBe(
      "mastodon.social",
    );
    expect(extractDomainFromIri(new URL("https://misskey.io/notes/1"))).toBe(
      "misskey.io",
    );
    expect(extractDomainFromIri("not-a-url")).toBeNull();
    expect(extractDomainFromIri(null)).toBeNull();
  });

  it("returns domain and parent domains", () => {
    expect(getDomainAndParents("a.b.example.com")).toEqual([
      "a.b.example.com",
      "b.example.com",
      "example.com",
    ]);
    expect(getDomainAndParents("example.com")).toEqual(["example.com"]);
  });

  it("matches exact domain and subdomains against blocked set", () => {
    const blocked = new Set(["spam.example"]);
    expect(isDomainInBlockedSet("spam.example", blocked)).toBe(true);
    expect(isDomainInBlockedSet("sub.spam.example", blocked)).toBe(true);
    expect(isDomainInBlockedSet("notspam.example", blocked)).toBe(false);
    expect(isDomainInBlockedSet("good.social", blocked)).toBe(false);
  });
});
