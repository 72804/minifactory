import { handleTranslateRequest } from "../../../lib/translate-api";

export const maxDuration = 60;

export async function POST(request: Request) {
  return handleTranslateRequest(request);
}
