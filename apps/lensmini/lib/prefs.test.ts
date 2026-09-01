import { describe, expect, it } from "vitest";
import { languagesForPicker } from "./prefs";

describe("languagesForPicker", () => {
  it("keeps recent languages out of the full list", () => {
    const lists = languagesForPicker("", ["de", "tr"]);
    expect(lists.recent.map((language) => language.code)).toEqual(["de", "tr"]);
    expect(lists.all.map((language) => language.code)).not.toContain("de");
    expect(lists.all.map((language) => language.code)).not.toContain("tr");
    expect(lists.all.filter((language) => language.code === "en")).toHaveLength(1);
  });

  it("does not duplicate recent codes", () => {
    const lists = languagesForPicker("", ["tr", "tr", "en"]);
    expect(lists.recent.map((language) => language.code)).toEqual(["tr", "en"]);
  });

  it("shows search matches once, including recent languages", () => {
    const lists = languagesForPicker("turk", ["tr"]);
    expect(lists.recent).toEqual([]);
    expect(lists.all.map((language) => language.code)).toEqual(["tr"]);
  });
});
