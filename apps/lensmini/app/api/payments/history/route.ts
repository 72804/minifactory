import { createPurchaseHistoryRoute } from "@minifactory/core/server";
import { appConfig } from "../../../../app.config";

export const { GET } = createPurchaseHistoryRoute(appConfig);
