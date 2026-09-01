import { createSessionRoute } from "@minifactory/core/server";
import { appConfig } from "../../../../app.config";

export const { POST } = createSessionRoute(appConfig);
