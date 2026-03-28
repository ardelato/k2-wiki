export const TIER_UNLOCK_REQUIREMENTS: Record<number, number> = {
  2: 5,
  3: 10,
  4: 15,
  5: 20,
}

export function getTotalCompletedExpeditions(
  completions: Record<string, Record<number, number>>,
): number {
  let total = 0
  for (const tiers of Object.values(completions)) {
    for (const count of Object.values(tiers)) {
      total += count
    }
  }
  return total
}

export function getMaxUnlockedTier(
  expeditionTypeId: string,
  completions: Record<string, Record<number, number>>,
): number {
  const tiers = completions[expeditionTypeId]
  if (!tiers) return 1

  let maxTier = 1
  for (let tier = 2; tier <= 5; tier++) {
    const required = TIER_UNLOCK_REQUIREMENTS[tier]
    const prevTierCount = tiers[tier - 1] ?? 0
    if (prevTierCount >= required) {
      maxTier = tier
    } else {
      break
    }
  }
  return maxTier
}
