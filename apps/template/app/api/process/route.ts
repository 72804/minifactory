import { createTextProcessRoute } from "@minifactory/core/server";
import { appConfig } from "../../../app.config";

export const { POST } = createTextProcessRoute(appConfig);
