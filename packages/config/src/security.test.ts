import { describe, expect, it } from "vitest";
import { isExampleDatabaseUrl } from "./security";

describe("isExampleDatabaseUrl", () => {
  it("detects the documented placeholder", () => {
    expect(
      isExampleDatabaseUrl("postgresql://postgres:postgres@localhost:5432/minifactory?schema=public"),
    ).toBe(true);
  });

  it("does not treat a custom local role as a placeholder", () => {
    expect(isExampleDatabaseUrl("postgresql://ugurgenc@localhost:5432/minifactory?schema=public")).toBe(
      false,
    );
  });
});
