export const USE_STRIPE_ENVIRONMENT_VARIABLE = "USE_STRIPE"

const STRIPE_DISABLED_VALUES = new Set(["false", "0", "no", "off"])

export function isStripeBillingEnabled(
  environment: Record<string, string | undefined> = process.env
) {
  const value = environment[USE_STRIPE_ENVIRONMENT_VARIABLE]
    ?.trim()
    .toLowerCase()

  return !value || !STRIPE_DISABLED_VALUES.has(value)
}
