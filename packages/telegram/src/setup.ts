import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  getBotCommands,
  getBotDescription,
  getBotName,
  getBotShortDescription,
  getChatMenuButton,
  getTelegramBotProfile,
  getTelegramWebhookInfo,
  setBotCommands,
  setBotDescription,
  setBotName,
  setBotProfilePhoto,
  setBotShortDescription,
  setMiniAppMenuButton,
  setTelegramWebhook,
} from "./bot-api";
import { withTempBotProfileJpeg } from "./profile-photo";
import type { ResolvedTelegramPresentation } from "./presentation";

export type TelegramSetupReport = {
  bot: string;
  profilePhoto: "updated" | "skipped";
  name: string;
  shortDescription: "updated" | "mismatch";
  description: "updated" | "mismatch";
  commands: "updated" | "mismatch";
  menuButton: string;
  webhook: "correct" | "mismatch";
  pending: number | "n/a";
  lastError: "none" | "yes";
};

export async function configureTelegramBot(options: {
  appDir: string;
  webhookUrl: string;
  webhookSecret: string;
  miniAppUrl: string;
  presentation: ResolvedTelegramPresentation;
}): Promise<TelegramSetupReport> {
  const { presentation, miniAppUrl, webhookUrl, webhookSecret, appDir } = options;

  await setTelegramWebhook(webhookUrl, webhookSecret);
  await setBotName(presentation.botName);
  await setBotShortDescription(presentation.shortDescription);
  await setBotDescription(presentation.description);
  await setBotCommands(presentation.commands);
  await setMiniAppMenuButton(miniAppUrl, presentation.menuButtonText);

  let profilePhoto: "updated" | "skipped" = "skipped";
  if (presentation.profileImage) {
    const pngPath = resolve(appDir, presentation.profileImage);
    if (!existsSync(pngPath)) {
      throw new Error(`Telegram profile image is missing: ${presentation.profileImage}`);
    }
    await withTempBotProfileJpeg(pngPath, async (_path, jpeg) => {
      await setBotProfilePhoto(jpeg);
    });
    profilePhoto = "updated";
  }

  const [me, name, short, description, commands, menu, webhook] = await Promise.all([
    getTelegramBotProfile(),
    getBotName(),
    getBotShortDescription(),
    getBotDescription(),
    getBotCommands(),
    getChatMenuButton(),
    getTelegramWebhookInfo(),
  ]);

  const commandOk =
    [...(commands ?? [])]
      .map((item) => `${item.command}:${item.description}`)
      .sort()
      .join("|") ===
    [...presentation.commands]
      .map((item) => `${item.command}:${item.description}`)
      .sort()
      .join("|");
  const menuText = menu && "text" in menu ? (menu.text ?? "") : "";
  const menuUrl = (menu && "web_app" in menu ? menu.web_app?.url ?? "" : "").replace(/\/$/, "");
  const webhookOk = (webhook?.url ?? "").replace(/\/$/, "") === webhookUrl.replace(/\/$/, "");

  return {
    bot: me?.username ? `@${me.username}` : "@(unknown)",
    profilePhoto,
    name: name?.name ?? "",
    shortDescription:
      (short?.short_description ?? "") === presentation.shortDescription ? "updated" : "mismatch",
    description: (description?.description ?? "") === presentation.description ? "updated" : "mismatch",
    commands: commandOk ? "updated" : "mismatch",
    menuButton:
      menuText === presentation.menuButtonText && menuUrl === miniAppUrl.replace(/\/$/, "")
        ? menuText
        : "mismatch",
    webhook: webhookOk ? "correct" : "mismatch",
    pending: webhook?.pending_update_count ?? "n/a",
    lastError: webhook?.last_error_message ? "yes" : "none",
  };
}
