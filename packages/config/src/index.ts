import { z } from "zod";

export const capabilitySchema = z.enum([
  "telegramAuth",
  "database",
  "ai",
  "camera",
  "imageUpload",
  "fileUpload",
  "audio",
  "notifications",
  "payments",
  "ads",
  "referrals",
]);

export type Capability = z.infer<typeof capabilitySchema>;

export const listingSchema = z.object({
  shortDescription: z.string().min(1).max(120),
  longDescription: z.string().min(1).max(4000),
  category: z.string().min(1),
  keywords: z.array(z.string()).max(20).default([]),
  tagline: z.string().max(80).optional(),
});

export const themeSchema = z.object({
  accent: z.string().regex(/^#([0-9a-fA-F]{6})$/),
  radius: z.string().default("16px"),
  fontFamily: z
    .string()
    .default(
      'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    ),
});

export const usageFeatureSchema = z.object({
  freePerDay: z.number().int().min(0).nullable().default(null),
  extraAfterAd: z.number().int().min(0).default(0),
  premiumUnlimited: z.boolean().default(false),
  unlimited: z.boolean().default(false),
});

export const limitsSchema = z.object({
  anonymousUsage: z.boolean().default(false),
  features: z.record(usageFeatureSchema).default({}),
});

export const analyticsSchema = z.object({
  enabled: z.boolean().default(true),
});

export const monetizationProductSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  priceStars: z.number().int().positive(),
  type: z.enum(["consumable", "daily_unlock", "subscription_like", "lifetime"]),
});

export const monetizationSchema = z.object({
  enabled: z.boolean().default(false),
  products: z.array(monetizationProductSchema).default([]),
});

export const shellSchema = z.object({
  showUsage: z.boolean().default(true),
  showSettings: z.boolean().default(false),
  showShare: z.boolean().default(true),
  showPaywall: z.boolean().default(true),
  immersive: z.boolean().default(false),
});

export const slugSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{1,46}[a-z0-9]$/, "Use a lowercase slug like qrmini or lens-mini");

export const appConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(40),
  slug: slugSchema,
  description: z.string().min(1).max(280),
  botUsername: z.string().min(1),
  productionUrl: z.string().url().or(z.literal("")),
  theme: themeSchema,
  logo: z.string().default("/logo.svg"),
  supportContact: z.string().default(""),
  privacyUrl: z.string().default("/privacy"),
  termsUrl: z.string().default("/terms"),
  capabilities: z.array(capabilitySchema).default(["telegramAuth", "database"]),
  limits: limitsSchema.default({ anonymousUsage: false, features: {} }),
  analytics: analyticsSchema.default({ enabled: true }),
  monetization: monetizationSchema.default({ enabled: false, products: [] }),
  listing: listingSchema,
  shell: shellSchema.default({
    showUsage: true,
    showSettings: false,
    showShare: true,
    showPaywall: true,
    immersive: false,
  }),
});

export type AppConfig = z.infer<typeof appConfigSchema>;
export type AppConfigInput = z.input<typeof appConfigSchema>;
export type UsageFeatureConfig = z.infer<typeof usageFeatureSchema>;
export type MonetizationProduct = z.infer<typeof monetizationProductSchema>;

export function defineAppConfig(config: AppConfigInput): AppConfig {
  return appConfigSchema.parse(config);
}

export function hasCapability(config: AppConfig, capability: Capability): boolean {
  return config.capabilities.includes(capability);
}

export const CAPABILITY_STATUS = {
  telegramAuth: "implemented",
  database: "implemented",
  referrals: "implemented",
  payments: "partial",
  ads: "partial",
  ai: "implemented",
  camera: "implemented",
  imageUpload: "implemented",
  fileUpload: "interface",
  audio: "interface",
  notifications: "interface",
} as const satisfies Record<Capability, "implemented" | "partial" | "interface">;

export type CapabilityStatus = (typeof CAPABILITY_STATUS)[Capability];

