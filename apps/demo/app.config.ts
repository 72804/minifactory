import { defineAppConfig } from "@minifactory/config";

export const appConfig = defineAppConfig({
  id: "demo",
  name: "Demo Mini",
  slug: "demo",
  description: "Generated Mini App that proves the factory CLI.",
  botUsername: "YourBotUsername",
  productionUrl: "",
  theme: {
    accent: "#16a34a",
    radius: "16px",
    fontFamily:
      'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  logo: "/logo.svg",
  supportContact: "",
  privacyUrl: "/privacy",
  termsUrl: "/terms",
  capabilities: ["telegramAuth", "database", "referrals"],
  limits: {
    anonymousUsage: false,
    features: {
      process: {
        freePerDay: 5,
        extraAfterAd: 1,
        premiumUnlimited: true,
        unlimited: false,
      },
    },
  },
  analytics: { enabled: true },
  monetization: { enabled: false, products: [] },
  listing: {
    shortDescription: "Generated Mini App that proves the factory CLI.",
    longDescription: "Generated Mini App that proves the factory CLI.",
    category: "utilities",
    keywords: ["demo", "telegram", "minifactory"],
  },
  shell: {
    showUsage: true,
    showSettings: false,
    showShare: true,
    showPaywall: true,
  },
});
