import { createTelegramWebhookRoute } from "@minifactory/core/server";
import { appConfig } from "../../../../app.config";

export const { POST } = createTelegramWebhookRoute(appConfig);
