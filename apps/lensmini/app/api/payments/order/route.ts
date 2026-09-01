import { createPurchaseStatusRoute } from "@minifactory/core/server";
import { appConfig } from "../../../../app.config";

export const { GET } = createPurchaseStatusRoute(appConfig);
