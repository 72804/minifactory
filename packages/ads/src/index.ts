export type AdPlacement = "interstitial" | "rewarded";

export type AdShowResult = {
  shown: boolean;
  rewarded: boolean;
  provider: string;
};

export type AdsProvider = {
  id: string;
  showInterstitial: () => Promise<AdShowResult>;
  showRewardedAd: () => Promise<AdShowResult>;
  trackAdRevenue: (amount: number, currency?: string) => Promise<void>;
};

export const disabledAdsProvider: AdsProvider = {
  id: "disabled",
  async showInterstitial() {
    return { shown: false, rewarded: false, provider: "disabled" };
  },
  async showRewardedAd() {
    return { shown: false, rewarded: false, provider: "disabled" };
  },
  async trackAdRevenue() {
    return undefined;
  },
};

export const mockAdsProvider: AdsProvider = {
  id: "mock",
  async showInterstitial() {
    return { shown: true, rewarded: false, provider: "mock" };
  },
  async showRewardedAd() {
    return { shown: true, rewarded: true, provider: "mock" };
  },
  async trackAdRevenue() {
    return undefined;
  },
};

export function getAdsProvider(id: string | undefined): AdsProvider {
  if (id === "mock") {
    return mockAdsProvider;
  }
  return disabledAdsProvider;
}

// TODO: add RichAds / other Telegram-compatible networks behind AdsProvider.
