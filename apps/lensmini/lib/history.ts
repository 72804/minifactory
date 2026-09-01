import { prisma } from "@minifactory/db";

export const HISTORY_LIMIT = 20;

export type HistoryEntry = {
  id: string;
  sourceLanguage: string;
  targetLanguage: string;
  originalText: string;
  translatedText: string;
  createdAt: string;
};

export async function persistTranslation(input: {
  appId: string;
  userId: string;
  sourceLanguage: string;
  targetLanguage: string;
  originalText: string;
  translatedText: string;
  keep?: number;
}): Promise<void> {
  await prisma.translation.create({
    data: {
      appId: input.appId,
      userId: input.userId,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
      originalText: input.originalText,
      translatedText: input.translatedText,
    },
  });

  const keep = input.keep ?? HISTORY_LIMIT;
  const extras = await prisma.translation.findMany({
    where: { appId: input.appId, userId: input.userId },
    orderBy: { createdAt: "desc" },
    skip: keep,
    select: { id: true },
  });
  if (extras.length > 0) {
    await prisma.translation.deleteMany({
      where: { id: { in: extras.map((row) => row.id) } },
    });
  }
}

export async function listHistory(appId: string, userId: string): Promise<HistoryEntry[]> {
  const rows = await prisma.translation.findMany({
    where: { appId, userId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });
  return rows.map((row) => ({
    id: row.id,
    sourceLanguage: row.sourceLanguage,
    targetLanguage: row.targetLanguage,
    originalText: row.originalText,
    translatedText: row.translatedText,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function deleteHistoryEntry(appId: string, userId: string, id: string): Promise<boolean> {
  const result = await prisma.translation.deleteMany({
    where: { id, appId, userId },
  });
  return result.count > 0;
}

export async function clearHistory(appId: string, userId: string): Promise<number> {
  const result = await prisma.translation.deleteMany({
    where: { appId, userId },
  });
  return result.count;
}
