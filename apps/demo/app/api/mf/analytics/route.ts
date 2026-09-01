import { createAnalyticsRoute } from "@minifactory/core/server";
import { appConfig } from "../../../../app.config";

export const { POST } = createAnalyticsRoute(appConfig);
