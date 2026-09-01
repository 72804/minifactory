import { disabledAdsProvider, getAdsProvider, type AdShowResult, type AdsProvider } from "./index";

let activeProvider: AdsProvider = disabledAdsProvider;

export function configureAds(providerId: string | undefined): void {
  activeProvider = getAdsProvider(providerId);
}

export async function showInterstitial(): Promise<AdShowResult> {
  return activeProvider.showInterstitial();
}

export async function showRewardedAd(): Promise<AdShowResult> {
  return activeProvider.showRewardedAd();
}

export async function trackAdRevenue(amount: number, currency = "USD"): Promise<void> {
  await activeProvider.trackAdRevenue(amount, currency);
}
