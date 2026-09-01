import { createTelegramWebhookRoute } from "@minifactory/core/server";
import { appConfig } from "../../../../app.config";

export const { POST } = createTelegramWebhookRoute(appConfig, {
  text: [
    "📷 LensMini",
    "",
    "Point. Translate. Understand.",
    "",
    "Translate menus, signs, labels and documents instantly from your camera.",
    "",
    "👇 Open the translator",
  ].join("\n"),
  buttonText: "📷 OPEN LENSMINI",
});
