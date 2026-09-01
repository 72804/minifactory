import type { AppConfig } from "@minifactory/config";
import type { TelegramBotCommand } from "./bot-api";

export type ResolvedTelegramPresentation = {
  botName: string;
  shortDescription: string;
  description: string;
  menuButtonText: string;
  profileImage?: string;
  startText: string;
  startButtonText: string;
  startPhoto?: string;
  helpText?: string;
  privacyText?: string;
  commands: TelegramBotCommand[];
};

function clip(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return value.slice(0, max - 1).trimEnd();
}

export function resolveTelegramPresentation(config: AppConfig): ResolvedTelegramPresentation {
  const telegram = config.telegram ?? {};
  const tagline = config.listing.tagline ?? config.description;
  return {
    botName: telegram.botName ?? config.name,
    shortDescription: telegram.shortDescription ?? clip(config.listing.shortDescription, 120),
    description: telegram.description ?? clip(config.listing.longDescription, 512),
    menuButtonText: telegram.menuButtonText ?? "Open",
    profileImage: telegram.profileImage,
    startText:
      telegram.startText ?? `${config.name}\n\n${tagline}\n\nOpen the Mini App below.`,
    startButtonText: telegram.startButtonText ?? `Open ${config.name}`,
    startPhoto: telegram.startPhoto,
    helpText: telegram.helpText,
    privacyText: telegram.privacyText,
    commands: telegram.commands ?? [{ command: "start", description: `Open ${config.name}` }],
  };
}
