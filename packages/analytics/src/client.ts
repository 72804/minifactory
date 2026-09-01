import { telegramAuthHeaders } from "@minifactory/telegram/client";
import type { AnalyticsEventName, AnalyticsMetadata } from "./index";

export async function track(
  name: AnalyticsEventName,
  metadata?: AnalyticsMetadata,
): Promise<void> {
  const headers = new Headers(telegramAuthHeaders());
  headers.set("content-type", "application/json");
  await fetch("/api/mf/analytics", {
    method: "POST",
    headers,
    body: JSON.stringify({ name, metadata }),
    credentials: "same-origin",
  });
}
