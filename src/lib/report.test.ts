import { describe, expect, it } from "vitest";
import { binomialTail, buildReport, holm, mannWhitney, regression, standardDeviation, wilson } from "./report";
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
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.1381, 3);
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
  it("flags an elevated key, explained by its mix-up when there is one", () => {
    const events: KeyEvent[] = [];
    let time = 0;
    for (let i = 0; i < 30; i += 1) events.push(input("e", i < 12 ? "r" : "e", (time += 150)));
    for (let i = 0; i < 200; i += 1) events.push(input("a", i < 4 ? "s" : "a", (time += 150)));
    const report = buildReport({ events, elapsed: 30 }, [trace(events)]);
    const finding = report.findings.find((item) => item.target === "e");
    // The repeated r-for-e substitution is the more specific explanation, so it replaces the general key finding.
    expect(finding?.title).toBe("Mix-up: you type “r” for “e”");
    expect(report.findings.filter((item) => item.target === "e")).toHaveLength(1);
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

describe("history pooling", () => {
  it("uses summary-only runs for the trend but not for keystroke tests", () => {
    const events = [input("a", "a", 100), input("b", "b", 200)];
    const summaries = Array.from({ length: 5 }, (_, i) => ({ events: [], result: { createdAt: `2026-01-0${i + 1}`, netWpm: 40 + i } as TestResult }));
    const history = buildReport({ events, elapsed: 15 }, [trace(events), ...summaries]).sections.find((section) => section.title === "History");
    expect(history?.rows.find((row) => row.label === "pooled sample")?.value).toBe("1 test");
    expect(history?.rows.find((row) => row.label === "speed trend")?.detail).toContain("over 6 tests");
  });
});

describe("mix-ups", () => {
  it("flags a specific substitution only when it repeats across pooled runs", () => {
    let time = 0;
    const run = (rWrong: number) => [
      ...Array.from({ length: 15 }, (_, i) => input("e", i < rWrong ? "r" : "e", (time += 150))),
      ...Array.from({ length: 60 }, () => input("a", "a", (time += 150))),
    ];
    const first = run(2);
    const second = run(2);
    const single = buildReport({ events: first, elapsed: 15 }, [trace(first)]);
    expect(single.findings.some((finding) => finding.title.startsWith("Mix-up"))).toBe(false);
    const pooled = buildReport({ events: second, elapsed: 15 }, [trace(second), trace(first)]);
    const finding = pooled.findings.find((item) => item.title.startsWith("Mix-up"));
    expect(finding?.title).toBe("Mix-up: you type “r” for “e”");
    expect(finding?.sample).toBe("30 attempts at “e”");
  });
});

describe("per-key errors", () => {
  it("reports a key's error rate when its errors are spread across different keys", () => {
    let time = 0;
    const events = [
      ...Array.from({ length: 30 }, (_, i) => input("e", i < 10 ? "qwrtyuiops"[i] : "e", (time += 150))),
      ...Array.from({ length: 200 }, (_, i) => input("a", i < 2 ? "s" : "a", (time += 150))),
    ];
    const report = buildReport({ events, elapsed: 30 }, [trace(events)]);
    expect(report.findings.find((item) => item.target === "e")?.title).toContain("fails");
  });
});

describe("slow-transition details", () => {
  it("reports timing, accuracy, examples, and run coverage in the technical card", () => {
    const events: KeyEvent[] = [];
    let time = 0;
    for (let index = 0; index < 24; index += 1) {
      events.push(input("a", "a", (time += 100)), input("p", "p", (time += 400)), input("e", "e", (time += 100)));
    }
    const finding = buildReport({ events, elapsed: 30 }, [trace(events)]).findings.find((item) => item.title.startsWith("Slow transition “ap”"));
    expect(finding?.details?.map((detail) => detail.label)).toEqual(["time on this pair", "errors on “p”", "examples reaching this key", "run coverage"]);
    expect(finding?.details?.[0].value).toBe("400 ms");
    expect(finding?.details?.[3].detail).toContain("one run");
  });
});
