export type QuotaUsage = {
  proActive?: boolean;
  proRemainingToday?: number | null;
  credits?: number;
  freeRemaining?: number;
  freeLimit?: number | null;
  remaining: number;
  limit: number | null;
};

export function quotaLabel(usage: QuotaUsage): string {
  if (usage.proActive) {
    const left = usage.proRemainingToday ?? usage.remaining;
    return `PRO · ${Number.isFinite(left) ? left : 0} left today`;
  }
  const freeLimit = usage.freeLimit ?? usage.limit;
  const freeRemaining = usage.freeRemaining ?? (typeof usage.remaining === "number" ? usage.remaining : 0);
  if ((usage.credits ?? 0) > 0 && (freeRemaining === 0 || freeLimit === 0)) {
    return `${usage.credits} credits`;
  }
  if (freeLimit == null) {
    return "Unlimited";
  }
  return `${Number.isFinite(freeRemaining) ? freeRemaining : freeLimit} / ${freeLimit} free`;
}
