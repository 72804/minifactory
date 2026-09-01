import { defineAppConfig } from "@minifactory/config";

export const TRANSLATE_FEATURE = "translate";
export const TRANSLATE_FREE_PER_DAY = 5;

export const appConfig = defineAppConfig({
  id: "lensmini",
  name: "LensMini",
  slug: "lensmini",
  description: "Translate text instantly with your camera.",
  botUsername: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "LensMiniBot",
  productionUrl: "https://lensmini.vercel.app",
  theme: {
    accent: "#7c5cff",
    radius: "16px",
    fontFamily:
      'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  logo: "/listing/icon.png",
  supportContact: process.env.SUPPORT_TELEGRAM ?? "",
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
    enabled: true,
    currency: "XTR",
    products: [
      {
        id: "lens_20",
        title: "20 Translations",
        description: "20 extra translations",
        priceStars: 49,
        type: "consumable",
        grantCredits: 20,
      },
      {
        id: "lens_100",
        title: "100 Translations",
        description: "100 extra translations",
        priceStars: 149,
        type: "consumable",
        grantCredits: 100,
        badge: "BEST VALUE",
      },
      {
        id: "lens_pro_30d",
        title: "LensMini Pro — 30 Days",
        description: "100 translations/day for 30 days",
        priceStars: 299,
        type: "period_entitlement",
        periodDays: 30,
        dailyLimit: 100,
      },
    ],
  },
  listing: {
    tagline: "Point. Translate. Done.",
    shortDescription: "Translate text instantly with your camera.",
    longDescription:
      "Point your camera at any text and get an instant translation. LensMini works with signs, menus, labels, documents, and photos — right inside Telegram.",
    category: "translation",
    keywords: [
      "translator",
      "camera",
      "translate",
      "travel",
      "language",
      "photo",
      "text",
      "AI",
    ],
  },
  telegram: {
    botName: "LensMini",
    shortDescription: "Translate text instantly with your camera.",
    description:
      "Point your camera at signs, menus, labels, documents, or photos and translate the text instantly — right inside Telegram.",
    menuButtonText: "Translate",
    profileImage: "public/listing/icon.png",
    startText: [
      "📷 LensMini",
      "",
      "Point. Translate. Done.",
      "",
      "Translate signs, menus, labels, documents and photos instantly with your camera.",
      "",
      "👇 Tap below to start",
    ].join("\n"),
    startButtonText: "📷 OPEN LENSMINI",
    startPhoto: "/telegram/lensmini-hero.png",
    helpText: [
      "LensMini is simple:",
      "",
      "1. Open the translator",
      "2. Point your camera at text",
      "3. Choose a language",
      "4. Tap capture",
      "",
      "You can also upload a photo.",
    ].join("\n"),
    privacyText: "LensMini uses photos only to translate text and does not keep them.",
    commands: [
      { command: "start", description: "Open LensMini" },
      { command: "help", description: "How to use LensMini" },
      { command: "privacy", description: "Privacy information" },
      { command: "terms", description: "Terms of service" },
      { command: "paysupport", description: "Purchase support" },
    ],
  },
  shell: {
    showUsage: false,
    showSettings: false,
    showShare: false,
    showPaywall: false,
    immersive: true,
    showHeader: false,
  },
});
