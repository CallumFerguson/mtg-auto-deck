import type { QueryResultRow } from "pg"

import {
  getHighestBillingTier,
  isAdminGrantBillingTier,
  normalizeBillingTier,
  type AdminGrantBillingTier,
  type BillingTier,
} from "./subscription-tiers.js"

type Queryable = {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<{
    rowCount: number | null
    rows: T[]
  }>
}

export type ActiveAdminSubscriptionTierGrant = {
  expiresAt: string
  grantedAt: string
  grantedByAdminUserId: string | null
  id: string
  tier: AdminGrantBillingTier
}

export type UserBillingTierSummary = {
  adminGrant: ActiveAdminSubscriptionTierGrant | null
  effectiveTier: BillingTier
  stripeTier: BillingTier
}

type BillingTierSummaryRow = {
  admin_grant_expires_at: Date | null
  admin_grant_granted_at: Date | null
  admin_grant_granted_by_admin_user_id: string | null
  admin_grant_id: string | null
  admin_grant_tier: string | null
  stripe_tier: string | null
}

type UserRow = {
  id: string
}

export const ACTIVE_BILLING_SUBSCRIPTION_STATUSES = ["active", "trialing"]

export async function ensureAdminSubscriptionTierGrantsSchema(
  client: Queryable
) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS admin_subscription_tier_grants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

      user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      tier text NOT NULL,
      expires_at timestamptz NOT NULL,

      granted_by_admin_user_id text REFERENCES "user"(id) ON DELETE SET NULL,
      revoked_at timestamptz,
      revoked_by_admin_user_id text REFERENCES "user"(id) ON DELETE SET NULL,

      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  await client.query(`
    ALTER TABLE admin_subscription_tier_grants
    DROP CONSTRAINT IF EXISTS admin_subscription_tier_grants_tier_check
  `)
  await client.query(`
    ALTER TABLE admin_subscription_tier_grants
    ADD CONSTRAINT admin_subscription_tier_grants_tier_check
      CHECK (tier IN ('plus', 'pro', 'super_max'))
  `)
  await client.query(`
    ALTER TABLE admin_subscription_tier_grants
    DROP CONSTRAINT IF EXISTS admin_subscription_tier_grants_expires_after_created_check
  `)
  await client.query(`
    ALTER TABLE admin_subscription_tier_grants
    ADD CONSTRAINT admin_subscription_tier_grants_expires_after_created_check
      CHECK (expires_at > created_at)
  `)
  await client.query(`
    CREATE INDEX IF NOT EXISTS admin_subscription_tier_grants_active_user_idx
      ON admin_subscription_tier_grants (user_id, expires_at DESC)
      WHERE revoked_at IS NULL
  `)
}

export async function getUserBillingTierSummary(
  client: Queryable,
  ownerUserId: string,
  now = new Date()
): Promise<UserBillingTierSummary> {
  const query = buildUserBillingTierSummaryQuery(ownerUserId, now)
  const result = await client.query<BillingTierSummaryRow>(
    query.text,
    query.values
  )

  return toUserBillingTierSummary(result.rows[0] ?? null)
}

export async function setAdminSubscriptionTierGrant(
  client: Queryable,
  {
    adminUserId,
    days,
    targetUserId,
    tier,
  }: {
    adminUserId: string
    days: number
    targetUserId: string
    tier: AdminGrantBillingTier
  }
): Promise<UserBillingTierSummary | null> {
  const nowResult = await client.query<{ now: Date }>("SELECT now() AS now")
  const now = nowResult.rows[0]?.now

  if (!now) {
    throw new Error("Failed to resolve grant timestamp.")
  }

  const user = await lockUser(client, targetUserId)

  if (!user) {
    return null
  }

  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

  await client.query(
    `
      UPDATE admin_subscription_tier_grants
      SET revoked_at = $3,
          revoked_by_admin_user_id = $2,
          updated_at = $3
      WHERE user_id = $1
        AND revoked_at IS NULL
    `,
    [targetUserId, adminUserId, now]
  )
  await client.query(
    `
      INSERT INTO admin_subscription_tier_grants (
        user_id,
        tier,
        expires_at,
        granted_by_admin_user_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $5)
    `,
    [targetUserId, tier, expiresAt, adminUserId, now]
  )

  return await getUserBillingTierSummary(client, targetUserId, now)
}

export async function revokeAdminSubscriptionTierGrant(
  client: Queryable,
  {
    adminUserId,
    targetUserId,
  }: {
    adminUserId: string
    targetUserId: string
  }
): Promise<UserBillingTierSummary | null> {
  const nowResult = await client.query<{ now: Date }>("SELECT now() AS now")
  const now = nowResult.rows[0]?.now

  if (!now) {
    throw new Error("Failed to resolve grant revocation timestamp.")
  }

  const user = await lockUser(client, targetUserId)

  if (!user) {
    return null
  }

  await client.query(
    `
      UPDATE admin_subscription_tier_grants
      SET revoked_at = $3,
          revoked_by_admin_user_id = $2,
          updated_at = $3
      WHERE user_id = $1
        AND revoked_at IS NULL
        AND expires_at > $3
    `,
    [targetUserId, adminUserId, now]
  )

  return await getUserBillingTierSummary(client, targetUserId, now)
}

export function buildUserBillingTierSummaryQuery(
  ownerUserId: string,
  now: Date
) {
  return {
    text: `
      WITH stripe_tier AS (
        SELECT lower(plan) AS tier
        FROM "subscription"
        WHERE "referenceId" = $1
          AND status = ANY($2::text[])
          AND lower(plan) IN ('plus', 'pro')
        ORDER BY
          CASE lower(plan)
            WHEN 'pro' THEN 2
            WHEN 'plus' THEN 1
            ELSE 0
          END DESC
        LIMIT 1
      ),
      active_admin_grant AS (
        SELECT
          id,
          tier,
          expires_at,
          created_at,
          granted_by_admin_user_id
        FROM admin_subscription_tier_grants
        WHERE user_id = $1
          AND revoked_at IS NULL
          AND expires_at > $3
        ORDER BY
          CASE tier
            WHEN 'super_max' THEN 3
            WHEN 'pro' THEN 2
            WHEN 'plus' THEN 1
            ELSE 0
          END DESC,
          expires_at DESC,
          created_at DESC
        LIMIT 1
      )
      SELECT
        COALESCE((SELECT tier FROM stripe_tier), 'free') AS stripe_tier,
        active_admin_grant.id AS admin_grant_id,
        active_admin_grant.tier AS admin_grant_tier,
        active_admin_grant.expires_at AS admin_grant_expires_at,
        active_admin_grant.created_at AS admin_grant_granted_at,
        active_admin_grant.granted_by_admin_user_id AS admin_grant_granted_by_admin_user_id
      FROM (SELECT 1) singleton
      LEFT JOIN active_admin_grant ON true
    `,
    values: [ownerUserId, ACTIVE_BILLING_SUBSCRIPTION_STATUSES, now],
  }
}

export function toUserBillingTierSummary(
  row: BillingTierSummaryRow | null
): UserBillingTierSummary {
  const stripeTier = normalizeBillingTier(row?.stripe_tier) ?? "free"
  const adminGrant = toActiveAdminSubscriptionTierGrant(row)
  const effectiveTier = getHighestBillingTier([
    stripeTier,
    adminGrant?.tier ?? null,
  ])

  return {
    adminGrant,
    effectiveTier,
    stripeTier,
  }
}

function toActiveAdminSubscriptionTierGrant(
  row: BillingTierSummaryRow | null
): ActiveAdminSubscriptionTierGrant | null {
  if (!row?.admin_grant_id || !isAdminGrantBillingTier(row.admin_grant_tier)) {
    return null
  }

  return {
    expiresAt: formatDate(row.admin_grant_expires_at) ?? "",
    grantedAt: formatDate(row.admin_grant_granted_at) ?? "",
    grantedByAdminUserId: row.admin_grant_granted_by_admin_user_id,
    id: row.admin_grant_id,
    tier: row.admin_grant_tier,
  }
}

async function lockUser(client: Queryable, userId: string) {
  const result = await client.query<UserRow>(
    `
      SELECT id
      FROM "user"
      WHERE id = $1
      FOR UPDATE
    `,
    [userId]
  )

  return result.rows[0] ?? null
}

function formatDate(value: Date | null) {
  return value ? value.toISOString() : null
}
