import { createInvoiceRoute } from "@minifactory/core/server";
import { appConfig } from "../../../../app.config";

export const { POST } = createInvoiceRoute(appConfig);
