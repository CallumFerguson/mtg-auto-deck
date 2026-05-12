import { queryDatabase } from "./db.js"

export type AdminUserSummary = {
  id: string
  email: string
  emailVerified: boolean
  name: string
  role: string | null
  banned: boolean
  banReason: string | null
  banExpires: string | null
  createdAt: string
  updatedAt: string
}

type AdminUserRow = {
  id: string
  email: string
  emailVerified: boolean
  name: string | null
  role: string | null
  banned: boolean | null
  banReason: string | null
  banExpires: Date | null
  createdAt: Date
  updatedAt: Date
}

export async function listAdminUsers() {
  const result = await queryDatabase<AdminUserRow>(`
    SELECT
      id,
      email,
      "emailVerified" AS "emailVerified",
      name,
      role,
      banned,
      "banReason" AS "banReason",
      "banExpires" AS "banExpires",
      "createdAt" AS "createdAt",
      "updatedAt" AS "updatedAt"
    FROM "user"
    ORDER BY "createdAt" DESC, lower(email) ASC
  `)

  return result.rows.map(toAdminUserSummary)
}

function toAdminUserSummary(row: AdminUserRow): AdminUserSummary {
  return {
    id: row.id,
    email: row.email,
    emailVerified: row.emailVerified,
    name: row.name ?? "",
    role: row.role,
    banned: row.banned ?? false,
    banReason: row.banReason,
    banExpires: formatDate(row.banExpires),
    createdAt: formatDate(row.createdAt) ?? "",
    updatedAt: formatDate(row.updatedAt) ?? "",
  }
}

function formatDate(value: Date | null) {
  return value ? value.toISOString() : null
}
