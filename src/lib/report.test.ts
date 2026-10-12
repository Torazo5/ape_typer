import { describe, expect, it } from "vitest";
import { binomialTail, buildReport, holm, mannWhitney, regression, wilson } from "./report";
import type { KeyEvent, TestResult } from "./types";

const input = (expected: string, actual: string, time: number): KeyEvent => ({ kind: "input", expected, actual, index: 0, time, correct: expected === actual, code: "" });
const trace = (events: KeyEvent[]) => ({ events, result: { createdAt: "2026-01-01", netWpm: 50 } as TestResult });

describe("statistics", () => {
  it("matches textbook values", () => {
    const [low, high] = wilson(5, 10);
    expect(low).toBeCloseTo(0.2366, 3);
    expect(high).toBeCloseTo(0.7634, 3);
    expect(binomialTail(3, 3, 0.5)).toBeCloseTo(0.125, 6);
    expect(binomialTail(0, 10, 0.3)).toBe(1);
    expect(holm([0.01, 0.04, 0.03])).toEqual([0.03, 0.06, 0.06]);
    expect(regression([0, 1, 2, 3, 4], [1, 3, 5, 7, 9]).slope).toBeCloseTo(2, 9);
  });

  it("detects a clearly slower group and not an identical one", () => {
    const slow = Array.from({ length: 20 }, (_, i) => 300 + i);
    const fast = Array.from({ length: 20 }, (_, i) => 100 + i);
    expect(mannWhitney(slow, fast).p).toBeLessThan(0.001);
    expect(mannWhitney(slow, fast).effect).toBe(1);
    expect(mannWhitney(fast, fast).p).toBeGreaterThan(0.4);
  });
});

describe("statistical report", () => {
  it("flags a key whose error rate is significantly elevated", () => {
    const events: KeyEvent[] = [];
    let time = 0;
    for (let i = 0; i < 30; i += 1) events.push(input("e", i < 12 ? "r" : "e", (time += 150)));
    for (let i = 0; i < 200; i += 1) events.push(input("a", i < 4 ? "s" : "a", (time += 150)));
    const report = buildReport({ events, elapsed: 30 }, [trace(events)]);
    const finding = report.findings.find((item) => item.target === "e");
    expect(finding?.title).toContain("“e”");
    expect(finding?.evidence).toContain("most often typed as “r” (12/12)");
  });

  it("makes no per-key claim below the minimum sample size", () => {
    const events = Array.from({ length: 10 }, (_, i) => input("e", "r", i * 150));
    const report = buildReport({ events, elapsed: 15 }, [trace(events)]);
    expect(report.findings).toHaveLength(0);
  });

  it("separates corrected from uncorrected errors", () => {
    const events: KeyEvent[] = [input("a", "x", 100), { kind: "backspace", expected: "a", actual: "x", index: 0, time: 300, correct: true, code: "" }, input("a", "a", 400), input("b", "y", 500)];
    const accuracy = buildReport({ events, elapsed: 15 }, [trace(events)]).sections.find((section) => section.title === "Accuracy");
    expect(accuracy?.rows.find((row) => row.label === "errors corrected")?.value).toBe("1/2");
    expect(accuracy?.rows.find((row) => row.label === "KSPC")?.value).toBe("2.000");
  });
});
