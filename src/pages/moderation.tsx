import { isActor } from "@fedify/vocab";
import { getLogger } from "@logtape/logtape";
import { desc } from "drizzle-orm";
import { Hono } from "hono";
import { csrf } from "hono/csrf";

import { DashboardLayout } from "../components/DashboardLayout";
import db from "../db";
import federation from "../federation";
import { persistAccount } from "../federation/account";
import { loginRequired } from "../login";
import { proxyUrl } from "../media-proxy";
import {
  blockDomain,
  suspendRemoteAccount,
  unblockDomain,
  unsuspendRemoteAccount,
} from "../moderation";
import { domainBlocks } from "../schema";
import { isUuid } from "../uuid";

const logger = getLogger(["hollo", "pages", "moderation"]);

const moderation = new Hono();

moderation.use(csrf());
moderation.use(loginRequired);

moderation.get("/", async (c) => {
  const done = c.req.query("done");
  const error = c.req.query("error");

  const [blockedDomains, suspendedAccounts] = await Promise.all([
    db.select().from(domainBlocks).orderBy(desc(domainBlocks.created)),
    db.query.accounts.findMany({
      where: { suspended: { eq: true } },
      orderBy: (accounts, { desc }) => [desc(accounts.updated)],
    }),
  ]);

  const sectionClass =
    "rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900";
  const inputClass =
    "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:ring-brand-900";
  const primaryButtonClass =
    "rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 dark:bg-brand-700 dark:hover:bg-brand-800";
  const dangerButtonClass =
    "rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800";
  const secondaryButtonClass =
    "rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800";

  const statusMessages: Record<string, string> = {
    "domain:blocked": "The domain has been blocked.",
    "domain:unblocked": "The domain block has been removed.",
    "account:suspended": "The remote account has been suspended.",
    "account:unsuspended": "The remote account has been unsuspended.",
  };

  const errorMessages: Record<string, string> = {
    "domain:invalid": "Please enter a valid domain name (e.g. spam.example).",
    "account:not-found":
      "Could not find the specified remote account. Check the handle or URI and try again.",
    "account:local": "You cannot suspend a local account.",
    "account:invalid": "Please enter a valid handle or actor URI.",
  };

  return c.html(
    <DashboardLayout title="Hollo: Moderation" selectedMenu="moderation">
      <header class="mb-6">
        <h1 class="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
          Moderation
        </h1>
        <p class="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Block remote servers (domains) and suspend remote accounts.
        </p>
      </header>

      {done && statusMessages[done] && (
        <div class="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
          {statusMessages[done]}
        </div>
      )}

      {error && (
        <div class="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {errorMessages[error] ?? `Error: ${error}`}
        </div>
      )}

      <div class="space-y-6">
        <section class={sectionClass}>
          <header class="mb-4">
            <h2 class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Domain blocks (Server blocks)
            </h2>
            <p class="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              Drop all incoming activities from blocked servers and stop
              delivering posts to them.
            </p>
          </header>

          <form
            method="post"
            action="/moderation/domain-blocks"
            class="mb-6 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          >
            <div>
              <label
                htmlFor="block-domain"
                class="block text-sm font-medium text-neutral-800 dark:text-neutral-200"
              >
                Domain
              </label>
              <input
                id="block-domain"
                type="text"
                name="domain"
                placeholder="spam.example"
                required
                class={`${inputClass} mt-1 w-full`}
              />
            </div>
            <div>
              <label
                htmlFor="block-reason"
                class="block text-sm font-medium text-neutral-800 dark:text-neutral-200"
              >
                Reason (optional)
              </label>
              <input
                id="block-reason"
                type="text"
                name="reason"
                placeholder="Spam / Harassment"
                class={`${inputClass} mt-1 w-full`}
              />
            </div>
            <button type="submit" class={dangerButtonClass}>
              Block domain
            </button>
          </form>

          {blockedDomains.length > 0 ? (
            <div class="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
              <table class="w-full text-sm">
                <thead class="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
                  <tr>
                    <th class="px-3 py-2 text-left font-semibold">Domain</th>
                    <th class="px-3 py-2 text-left font-semibold">Reason</th>
                    <th class="px-3 py-2 text-left font-semibold">Blocked</th>
                    <th class="px-3 py-2 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-neutral-200 bg-white dark:divide-neutral-800 dark:bg-neutral-900">
                  {blockedDomains.map((row) => (
                    <tr>
                      <td class="px-3 py-2 font-mono text-neutral-900 dark:text-neutral-100">
                        {row.domain}
                      </td>
                      <td class="px-3 py-2 text-neutral-600 dark:text-neutral-400">
                        {row.reason ?? "—"}
                      </td>
                      <td class="px-3 py-2 text-neutral-600 dark:text-neutral-400 tabular-nums">
                        {row.created.toISOString().slice(0, 10)}
                      </td>
                      <td
                        class="px-3 py-2 text-right"
                        aria-label={`Actions for ${row.domain}`}
                      >
                        <form
                          method="post"
                          action="/moderation/domain-blocks/delete"
                          class="inline m-0"
                        >
                          <input
                            type="hidden"
                            name="domain"
                            value={row.domain}
                          />
                          <button
                            type="submit"
                            aria-label={`Unblock ${row.domain}`}
                            class={secondaryButtonClass}
                          >
                            Unblock
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p class="text-sm text-neutral-500 dark:text-neutral-400">
              No servers are currently blocked.
            </p>
          )}
        </section>

        <section class={sectionClass}>
          <header class="mb-4">
            <h2 class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Suspended remote accounts
            </h2>
            <p class="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              Suspend individual remote accounts to drop all their incoming
              activities and hide them from timelines.
            </p>
          </header>

          <form
            method="post"
            action="/moderation/accounts/suspend"
            class="mb-6 space-y-3"
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div class="flex-1">
                <label
                  htmlFor="suspend-handle"
                  class="block text-sm font-medium text-neutral-800 dark:text-neutral-200"
                >
                  Remote account handle or URI
                </label>
                <input
                  id="suspend-handle"
                  type="text"
                  name="target"
                  placeholder="@user@example.social"
                  required
                  class={`${inputClass} mt-1 w-full`}
                />
              </div>
              <button type="submit" class={dangerButtonClass}>
                Suspend account
              </button>
            </div>
            <label class="inline-flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
              <input
                type="checkbox"
                name="deletePosts"
                value="true"
                class="size-4 rounded border-neutral-300 text-brand-600 focus:ring-brand-200 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:ring-brand-900"
              />
              Also delete cached posts from this account
            </label>
          </form>

          {suspendedAccounts.length > 0 ? (
            <div class="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
              <table class="w-full text-sm">
                <thead class="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
                  <tr>
                    <th class="px-3 py-2 text-left font-semibold">Account</th>
                    <th class="px-3 py-2 text-left font-semibold">Instance</th>
                    <th class="px-3 py-2 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-neutral-200 bg-white dark:divide-neutral-800 dark:bg-neutral-900">
                  {suspendedAccounts.map((acc) => {
                    const avatar = proxyUrl(acc.avatarUrl, c.req.url);
                    return (
                      <tr>
                        <td class="px-3 py-2">
                          <div class="flex items-center gap-2.5">
                            {avatar && (
                              <img
                                src={avatar}
                                alt=""
                                class="size-7 rounded-full object-cover"
                              />
                            )}
                            <div>
                              <div class="font-medium text-neutral-900 dark:text-neutral-100">
                                {acc.name || acc.handle}
                              </div>
                              <div class="font-mono text-xs text-neutral-500 dark:text-neutral-400">
                                {acc.handle}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td class="px-3 py-2 font-mono text-neutral-600 dark:text-neutral-400">
                          {acc.instanceHost}
                        </td>
                        <td
                          class="px-3 py-2 text-right"
                          aria-label={`Actions for ${acc.handle}`}
                        >
                          <form
                            method="post"
                            action="/moderation/accounts/unsuspend"
                            class="inline m-0"
                          >
                            <input type="hidden" name="id" value={acc.id} />
                            <button
                              type="submit"
                              aria-label={`Unsuspend ${acc.handle}`}
                              class={primaryButtonClass}
                            >
                              Unsuspend
                            </button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p class="text-sm text-neutral-500 dark:text-neutral-400">
              No remote accounts are currently suspended.
            </p>
          )}
        </section>
      </div>
    </DashboardLayout>,
  );
});

moderation.post("/domain-blocks", async (c) => {
  const form = await c.req.formData();
  const domain = form.get("domain")?.toString() ?? "";
  const reason = form.get("reason")?.toString() ?? null;
  try {
    await blockDomain(domain, reason);
    return c.redirect("/moderation?done=domain:blocked");
  } catch {
    return c.redirect("/moderation?error=domain:invalid");
  }
});

moderation.post("/domain-blocks/delete", async (c) => {
  const form = await c.req.formData();
  const domain = form.get("domain")?.toString() ?? "";
  try {
    await unblockDomain(domain);
    return c.redirect("/moderation?done=domain:unblocked");
  } catch {
    return c.redirect("/moderation?error=domain:invalid");
  }
});

moderation.post("/accounts/suspend", async (c) => {
  const form = await c.req.formData();
  const rawTarget = form.get("target")?.toString().trim();
  const deletePosts = form.get("deletePosts") === "true";

  if (!rawTarget) {
    return c.redirect("/moderation?error=account:invalid");
  }

  // Try matching cached account by handle or IRI first
  const normalizedHandle = rawTarget.startsWith("@")
    ? rawTarget
    : rawTarget.includes("@") && !rawTarget.startsWith("http")
      ? `@${rawTarget}`
      : rawTarget;

  let account = await db.query.accounts.findFirst({
    where: {
      RAW: (accounts, { eq, or }) =>
        or(eq(accounts.handle, normalizedHandle), eq(accounts.iri, rawTarget))!,
    },
    with: { owner: true },
  });

  // If not cached, try looking up via WebFinger / ActivityPub
  if (account == null) {
    const owner = await db.query.accountOwners.findFirst({});
    if (owner != null) {
      const fedCtx = federation.createContext(c.req.raw, undefined);
      try {
        const documentLoader = await fedCtx.getDocumentLoader({
          username: owner.handle,
        });
        const object = await fedCtx.lookupObject(rawTarget, { documentLoader });
        if (isActor(object)) {
          const persisted = await persistAccount(db, object, c.req.url, {
            ...fedCtx,
            documentLoader,
          });
          if (persisted != null) {
            account = await db.query.accounts.findFirst({
              where: { id: { eq: persisted.id } },
              with: { owner: true },
            });
          }
        }
      } catch (err) {
        logger.warning("Failed to lookup remote account {target}: {error}", {
          target: rawTarget,
          error: err,
        });
      }
    }
  }

  if (account == null) {
    return c.redirect("/moderation?error=account:not-found");
  }

  if (account.owner != null) {
    return c.redirect("/moderation?error=account:local");
  }

  try {
    await suspendRemoteAccount(account.id, { deletePosts });
    return c.redirect("/moderation?done=account:suspended");
  } catch (err) {
    logger.error("Failed to suspend account {id}: {error}", {
      id: account.id,
      error: err,
    });
    return c.redirect("/moderation?error=account:invalid");
  }
});

moderation.post("/accounts/unsuspend", async (c) => {
  const form = await c.req.formData();
  const id = form.get("id")?.toString();
  if (!id || !isUuid(id)) {
    return c.redirect("/moderation?error=account:invalid");
  }
  const existing = await db.query.accounts.findFirst({
    where: { id: { eq: id } },
  });
  if (existing == null) {
    return c.redirect("/moderation?error=account:not-found");
  }
  await unsuspendRemoteAccount(id);
  return c.redirect("/moderation?done=account:unsuspended");
});

export default moderation;
