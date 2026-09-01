import { prisma } from "@minifactory/db";
import type { AnalyticsEventName, AnalyticsMetadata } from "./index";

export async function track(
  input: {
    appId: string;
    userId?: string | null;
    name: AnalyticsEventName;
    metadata?: AnalyticsMetadata;
  },
): Promise<void> {
  await prisma.analyticsEvent.create({
    data: {
      appId: input.appId,
      userId: input.userId ?? null,
      name: input.name,
      metadata: input.metadata ?? undefined,
    },
  });
}
