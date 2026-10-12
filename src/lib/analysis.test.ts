import { describe, expect, it } from "vitest";
import { analyze, calculateResult } from "./analysis";
import type { KeyEvent } from "./types";

const event = (actual: string, expected: string, index: number, time: number, gap = 100): KeyEvent => ({
  kind: "input", actual, expected, index, time, gap, correct: actual === expected, code: "KeyA",
});

describe("typing analysis", () => {
  it("only surfaces a repeat mistake after enough evidence", () => {
    expect(analyze([event("e", "r", 0, 0), event("e", "r", 1, 100), event("e", "r", 2, 200)]).map((item) => item.title)).toContain("Recurring mix-up: e → r");
    expect(analyze([event("e", "r", 0, 0), event("e", "r", 1, 100)])).toHaveLength(0);
  });

  it("calculates net and raw speed from test duration", () => {
    const events = [event("a", "a", 0, 0), event("b", "b", 1, 100), event("x", "c", 2, 200)];
    const result = calculateResult({ duration: 15, seed: 1, prompt: "abc", typedText: "abx", events });
    expect(result.netWpm).toBe(1.6);
    expect(result.rawWpm).toBe(2.4);
    expect(result.accuracy).toBe(66.7);
  });

  it("counts skipped letters as missed without penalizing key accuracy", () => {
    const events = [event("a", "a", 0, 0), { kind: "skip" as const, actual: "", expected: "b", index: 1, time: 50, correct: false, code: "Space" }];
    const result = calculateResult({ duration: 15, seed: 1, prompt: "ab ", typedText: "a\0 ", events });
    expect(result.characters).toMatchObject({ correct: 2, incorrect: 0, missed: 1 });
    expect(result.accuracy).toBe(100);
  });

  it("scores an early finish over the time actually typed", () => {
    const events = [event("a", "a", 0, 0), event("b", "b", 1, 100)];
    const result = calculateResult({ duration: 30, seed: 1, prompt: "ab", typedText: "ab", events, elapsed: 6 });
    expect(result.netWpm).toBe(4);
    expect(result.elapsed).toBe(6);
    expect(result.timeline).toHaveLength(6);
  });

  it("does not count skipped letters that were backspaced and typed", () => {
    const events = [{ kind: "skip" as const, actual: "", expected: "a", index: 0, time: 0, correct: false, code: "Space" }];
    const result = calculateResult({ duration: 15, seed: 1, prompt: "ab", typedText: "ab", events });
    expect(result.characters.missed).toBe(0);
  });

  it("does not blame rhythm on corrected errors", () => {
    const events: KeyEvent[] = [];
    let time = 0;
    for (let index = 0; index < 6; index += 1) {
      events.push(event("x", "a", index * 2, (time += 100)));
      events.push({ kind: "backspace", actual: "x", expected: "a", index, time: (time += 600), correct: true, code: "Backspace" });
      events.push(event("a", "a", index * 2, (time += 100), 700));
      events.push(event("b", "b", index * 2 + 1, (time += 100)));
    }
    expect(analyze(events).map((item) => item.kind)).not.toContain("pace");
  });
});
