import { getLogger } from "@logtape/logtape";
import { eq, inArray, or, sql } from "drizzle-orm";

import db from "./db";
import { updateAccountStats } from "./federation/account";
import {
  accountOwners,
  accounts,
  domainBlocks,
  follows,
  listPosts,
  posts,
  timelinePosts,
} from "./schema";
import type { Uuid } from "./uuid";

const logger = getLogger(["hollo", "moderation"]);

/**
 * Normalize user-supplied domain string (e.g., "https://Example.COM/foo" -> "example.com").
 * Returns null if the domain is empty or invalid.
 */
export function normalizeDomain(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = /^https?:\/\//i.test(trimmed)
      ? new URL(trimmed)
      : new URL(`https://${trimmed}`);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (!hostname || !hostname.includes(".")) return null;
    return hostname;
  } catch {
    return null;
  }
}

/**
 * Extract lowercase hostname from an IRI string or URL.
 */
export function extractDomainFromIri(
  iri: string | URL | null | undefined,
): string | null {
  if (iri == null) return null;
  try {
    const url = iri instanceof URL ? iri : new URL(iri);
    return url.hostname.toLowerCase().replace(/\.$/, "") || null;
  } catch {
    return null;
  }
}

/**
 * Return all parent domains including the domain itself for subdomain matching.
 * e.g., "sub.example.com" -> ["sub.example.com", "example.com"]
 */
export function getDomainAndParents(domain: string): string[] {
  const normalized = domain.toLowerCase().replace(/\.$/, "");
  const parts = normalized.split(".");
  if (parts.length < 2) return [normalized];
  const candidates: string[] = [];
  for (let i = 0; i <= parts.length - 2; i++) {
    candidates.push(parts.slice(i).join("."));
  }
  return candidates;
}

/**
 * Check if a domain (or any of its parent domains) is blocked.
 */
export async function isDomainBlocked(
  domain: string | null | undefined,
): Promise<boolean> {
  if (!domain) return false;
  const candidates = getDomainAndParents(domain);
  const match = await db.query.domainBlocks.findFirst({
    where: { domain: { in: candidates } },
  });
  return match != null;
}

/**
 * Check if a domain matches any entry in a pre-fetched set of blocked domains.
 */
export function isDomainInBlockedSet(
  domain: string | null | undefined,
  blockedDomains: ReadonlySet<string>,
): boolean {
  if (!domain || blockedDomains.size === 0) return false;
  for (const candidate of getDomainAndParents(domain)) {
    if (blockedDomains.has(candidate)) return true;
  }
  return false;
}

/**
 * Fetch all blocked domains as a lowercase Set.
 */
export async function getBlockedDomainsSet(): Promise<Set<string>> {
  const rows = await db
    .select({ domain: domainBlocks.domain })
    .from(domainBlocks);
  return new Set(rows.map((r) => r.domain.toLowerCase()));
}

/**
 * Check if an actor (by IRI) is suspended or belongs to a blocked domain.
 */
export async function isActorSuspendedOrDomainBlocked(
  actorIri: string | URL | null | undefined,
): Promise<boolean> {
  if (actorIri == null) return false;
  const iriStr = actorIri instanceof URL ? actorIri.href : actorIri;
  const domain = extractDomainFromIri(iriStr);
  if (domain && (await isDomainBlocked(domain))) {
    return true;
  }
  const account = await db.query.accounts.findFirst({
    where: { iri: { eq: iriStr } },
    columns: { suspended: true },
  });
  return account?.suspended === true;
}

/**
 * Block a remote domain, remove existing follows with accounts on that domain,
 * and purge their posts from local timelines and lists.
 */
export async function blockDomain(
  rawDomain: string,
  reason?: string | null,
): Promise<string> {
  const domain = normalizeDomain(rawDomain);
  if (!domain) {
    throw new Error(`Invalid domain: ${rawDomain}`);
  }

  const trimmedReason = reason?.trim() || null;

  await db.transaction(async (tx) => {
    await tx
      .insert(domainBlocks)
      .values({ domain, reason: trimmedReason })
      .onConflictDoUpdate({
        target: domainBlocks.domain,
        set: { reason: trimmedReason },
      });

    // Find all remote accounts belonging to this domain (exact or subdomain)
    const matchingAccounts = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        or(
          eq(sql`lower(${accounts.instanceHost})`, domain),
          sql`lower(${accounts.instanceHost}) LIKE ${`%.${domain}`}`,
        ),
      );

    // Exclude any local account owners just in case
    const localOwners = await tx
      .select({ id: accountOwners.id })
      .from(accountOwners);
    const localOwnerIds = new Set(localOwners.map((o) => o.id));
    const targetIds = matchingAccounts
      .map((a) => a.id)
      .filter((id) => !localOwnerIds.has(id));

    if (targetIds.length > 0) {
      // Remove follows involving these accounts
      const deletedFollows = await tx
        .delete(follows)
        .where(
          or(
            inArray(follows.followerId, targetIds),
            inArray(follows.followingId, targetIds),
          ),
        )
        .returning({
          followerId: follows.followerId,
          followingId: follows.followingId,
        });

      // Remove their posts from timeline_posts and list_posts
      const targetPostIds = tx
        .select({ id: posts.id })
        .from(posts)
        .where(inArray(posts.accountId, targetIds));

      await tx
        .delete(timelinePosts)
        .where(inArray(timelinePosts.postId, targetPostIds));
      await tx
        .delete(listPosts)
        .where(inArray(listPosts.postId, targetPostIds));

      // Update stats for affected local accounts
      const affectedLocalIds = new Set<Uuid>();
      for (const f of deletedFollows) {
        if (localOwnerIds.has(f.followerId)) affectedLocalIds.add(f.followerId);
        if (localOwnerIds.has(f.followingId)) {
          affectedLocalIds.add(f.followingId);
        }
      }
      for (const localId of affectedLocalIds) {
        await updateAccountStats(tx, { id: localId });
      }
    }
  });

  logger.info("Blocked domain {domain}", { domain });
  return domain;
}

/**
 * Unblock a previously blocked domain.
 */
export async function unblockDomain(rawDomain: string): Promise<string> {
  const domain = normalizeDomain(rawDomain);
  if (!domain) {
    throw new Error(`Invalid domain: ${rawDomain}`);
  }
  await db.delete(domainBlocks).where(eq(domainBlocks.domain, domain));
  logger.info("Unblocked domain {domain}", { domain });
  return domain;
}

/**
 * Suspend a remote account: mark suspended=true, sever follows,
 * remove posts from timelines/lists, and optionally delete cached posts.
 */
export async function suspendRemoteAccount(
  accountId: Uuid,
  options: { deletePosts?: boolean } = {},
): Promise<void> {
  const owner = await db.query.accountOwners.findFirst({
    where: { id: { eq: accountId } },
  });
  if (owner != null) {
    throw new Error("Cannot suspend a local account");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(accounts)
      .set({ suspended: true })
      .where(eq(accounts.id, accountId));

    const localOwners = await tx
      .select({ id: accountOwners.id })
      .from(accountOwners);
    const localOwnerIds = new Set(localOwners.map((o) => o.id));

    const deletedFollows = await tx
      .delete(follows)
      .where(
        or(
          eq(follows.followerId, accountId),
          eq(follows.followingId, accountId),
        ),
      )
      .returning({
        followerId: follows.followerId,
        followingId: follows.followingId,
      });

    const targetPostIds = tx
      .select({ id: posts.id })
      .from(posts)
      .where(eq(posts.accountId, accountId));

    await tx
      .delete(timelinePosts)
      .where(inArray(timelinePosts.postId, targetPostIds));
    await tx.delete(listPosts).where(inArray(listPosts.postId, targetPostIds));

    if (options.deletePosts) {
      await tx.delete(posts).where(eq(posts.accountId, accountId));
    }

    const affectedLocalIds = new Set<Uuid>();
    for (const f of deletedFollows) {
      if (localOwnerIds.has(f.followerId)) affectedLocalIds.add(f.followerId);
      if (localOwnerIds.has(f.followingId)) affectedLocalIds.add(f.followingId);
    }
    for (const localId of affectedLocalIds) {
      await updateAccountStats(tx, { id: localId });
    }
  });

  logger.info("Suspended remote account {accountId}", { accountId });
}

/**
 * Unsuspend a previously suspended remote account.
 */
export async function unsuspendRemoteAccount(accountId: Uuid): Promise<void> {
  await db
    .update(accounts)
    .set({ suspended: false })
    .where(eq(accounts.id, accountId));
  logger.info("Unsuspended remote account {accountId}", { accountId });
}
