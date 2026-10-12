import { describe, expect, it } from "vitest";
import { spaceAction } from "./words";

describe("space handling", () => {
  it("types, skips, or ignores depending on the position in the word", () => {
    expect(spaceAction("ab cd", 2)).toBe("space");
    expect(spaceAction("ab cd", 1)).toBe("skip");
    expect(spaceAction("ab cd", 0)).toBe("ignore");
    expect(spaceAction("ab cd", 3)).toBe("ignore");
  });
});
