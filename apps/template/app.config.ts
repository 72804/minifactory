import { defineAppConfig } from "@minifactory/config";

export const appConfig = defineAppConfig({
  id: "template",
  name: "Template Mini",
  slug: "template",
  description: "Starter Mini App that proves factory wiring: auth, UI, API, usage, analytics.",
  botUsername: "YourBotUsername",
  productionUrl: "",
  theme: {
    accent: "#2481cc",
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
    shortDescription: "A factory starter Mini App.",
    longDescription:
      "Template Mini transforms text to prove Telegram auth, shared UI, usage limits, and analytics.",
    category: "utilities",
    keywords: ["template", "minifactory", "telegram"],
  },
  shell: {
    showUsage: true,
    showSettings: false,
    showShare: true,
    showPaywall: true,
  },
});
