import { defineAppConfig } from "@minifactory/config";

export const TRANSLATE_FEATURE = "translate";
export const TRANSLATE_FREE_PER_DAY = 5;

export const appConfig = defineAppConfig({
  id: "lensmini",
  name: "LensMini",
  slug: "lensmini",
  description: "Instant camera translation inside Telegram.",
  botUsername: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "YourBotUsername",
  productionUrl: "",
  theme: {
    accent: "#6366f1",
    radius: "16px",
    fontFamily:
      'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  logo: "/logo.svg",
  supportContact: "",
  privacyUrl: "/privacy",
  termsUrl: "/terms",
  capabilities: [
    "telegramAuth",
    "database",
    "ai",
    "camera",
    "imageUpload",
    "payments",
    "ads",
    "referrals",
  ],
  limits: {
    anonymousUsage: false,
    features: {
      [TRANSLATE_FEATURE]: {
        freePerDay: TRANSLATE_FREE_PER_DAY,
        extraAfterAd: 0,
        premiumUnlimited: false,
        unlimited: false,
      },
    },
  },
  analytics: { enabled: true },
  monetization: {
    enabled: false,
    products: [
      {
        id: "daily_unlimited",
        title: "Daily Unlimited",
        description: "Unlimited translations for the rest of the UTC day.",
        priceStars: 69,
        type: "daily_unlock",
      },
      {
        id: "credits_20",
        title: "20 translations",
        description: "A pack of 20 extra translations.",
        priceStars: 49,
        type: "consumable",
      },
      {
        id: "credits_50",
        title: "50 translations",
        description: "A pack of 50 extra translations.",
        priceStars: 99,
        type: "consumable",
      },
    ],
  },
  listing: {
    tagline: "Point. Translate. Understand.",
    shortDescription: "Instant camera translation inside Telegram.",
    longDescription:
      "Point your camera at menus, signs, labels, documents, and other foreign text. LensMini detects the language and translates it instantly without leaving Telegram.",
    category: "translation",
    keywords: [
      "translation",
      "translator",
      "camera",
      "OCR",
      "travel",
      "language",
      "photo",
      "text",
      "AI",
    ],
  },
  shell: {
    showUsage: true,
    showSettings: false,
    showShare: false,
    showPaywall: false,
    immersive: true,
  },
});
