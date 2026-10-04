import { describe, expect, it } from "vitest";

import { AccountForm } from "./AccountForm.tsx";

describe("AccountForm", () => {
  it("renders unchecked bot checkbox by default", async () => {
    const jsx = (
      <AccountForm
        action="/accounts"
        officialAccount="@hollo@hollo.social"
        host="hollo.test"
        submitLabel="Create account"
      />
    );
    const html = await jsx.toString();
    expect(html).toContain('name="bot"');
    expect(html).not.toMatch(/name="bot"[^>]*checked/);
  });

  it("renders checked bot checkbox when values.bot is true", async () => {
    const jsx = (
      <AccountForm
        action="/accounts"
        values={{ bot: true }}
        officialAccount="@hollo@hollo.social"
        host="hollo.test"
        submitLabel="Create account"
      />
    );
    const html = await jsx.toString();
    expect(html).toContain('name="bot"');
    expect(html).toMatch(/name="bot"[^>]*checked/);
  });
});
