import { beforeEach, describe, expect, it } from "vitest";

import { getFixtureFile } from "../../tests/helpers";
import { getLoginCookie } from "../../tests/helpers/web";
import db from "../db";
import { customEmojis } from "../schema";
import { drive } from "../storage";
import app from "./index";

const emojiFile = await getFixtureFile("emoji.png", "image/png");

describe.sequential("emojis", () => {
  beforeEach(async () => {
    await db.delete(customEmojis);

    return () => {
      drive.restore();
    };
  });

  it("Successfully saves a new emoji", async () => {
    expect.assertions(4);

    const disk = drive.fake();
    const testShortCode = ":test-emoji:";

    const formData = new FormData();
    formData.append("shortcode", testShortCode);
    formData.append("image", emojiFile);

    const cookie = await getLoginCookie();

    const response = await app.request("/emojis", {
      method: "POST",
      body: formData,
      headers: {
        Cookie: cookie,
        "Sec-Fetch-Site": "same-origin",
      },
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/emojis");

    // Assert we uploaded the file:
    expect(() => disk.assertExists("emojis/test-emoji.png")).not.toThrowError();

    const emoji = await db.query.customEmojis.findFirst();

    expect(emoji).toMatchObject({
      category: null,
      url: "http://hollo.test/assets/emojis/test-emoji.png",
      shortcode: "test-emoji",
    });
  });

  it("Imports emojis from a Misskey instance", async () => {
    const formData = new FormData();
    formData.append("host", "example-misskey.test");

    const cookie = await getLoginCookie();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("/api/emojis")) {
        return new Response(
          JSON.stringify({
            emojis: [
              {
                name: "blob_smile",
                url: "https://example-misskey.test/emojis/blob_smile.png",
                category: "blobs",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return originalFetch(input, init);
    };

    try {
      const response = await app.request("/emojis/import-instance", {
        method: "POST",
        body: formData,
        headers: {
          Cookie: cookie,
          "Sec-Fetch-Site": "same-origin",
        },
      });

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe(
        "/emojis/import?imported=1",
      );

      const emoji = await db.query.customEmojis.findFirst();
      expect(emoji).toMatchObject({
        shortcode: "blob_smile",
        url: "https://example-misskey.test/emojis/blob_smile.png",
        category: "blobs",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
