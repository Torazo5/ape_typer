import type { Insight, KeyEvent, Point, TestResult } from "./types";

const round = (value: number) => Math.round(value * 10) / 10;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export type RunComparison = { averageDelta: number; bestDelta?: number; duration: TestResult["duration"]; isPersonalBest: boolean };

const completedRun = (result: TestResult) => (result.elapsed ?? result.timeline.length) >= result.duration - 0.1;

/** Compares only full tests of the same selected duration. */
export function compareRun(result: TestResult, history: TestResult[]): RunComparison | undefined {
  if (!completedRun(result)) return undefined;
  const comparable = history.filter((run) => run.duration === result.duration && completedRun(run));
  if (!comparable.length) return undefined;
  const average = comparable.reduce((sum, run) => sum + run.netWpm, 0) / comparable.length;
  const best = Math.max(...comparable.map((run) => run.netWpm));
  return { averageDelta: average ? ((result.netWpm - average) / average) * 100 : 0, bestDelta: result.netWpm - best, duration: result.duration, isPersonalBest: result.netWpm > best };
}

// A normal approximation of the 2018 Aalto/Cambridge online typing reference (mean 51.56, SD 20.2).
// The source distribution is skewed, so this is deliberately presented as an estimate, never a world rank.
export function referencePercentile(wpm: number) {
  const z = (wpm - 51.56) / 20.2;
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return Math.max(1, Math.min(99, Math.round(100 * (z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2))));
}

export function timeline(events: KeyEvent[], duration: number): Point[] {
  return Array.from({ length: duration }, (_, second) => {
    const attempts = events.filter((event) => event.kind === "input" && event.time >= second * 1000 && event.time < (second + 1) * 1000);
    const correct = attempts.filter((event) => event.correct).length;
    return {
      second: second + 1,
      wpm: correct * 12,
      rawWpm: attempts.length * 12,
      accuracy: attempts.length ? round((correct / attempts.length) * 100) : 100,
    };
  });
}

export function analyze(events: KeyEvent[]): Insight[] {
  const typed = events.filter((event) => event.kind === "input");
  const wrong = typed.filter((event) => !event.correct);
  const insights: Insight[] = [];
  const substitutions = new Map<string, KeyEvent[]>();

  const show = (character: string) => (character === " " ? "␣" : character);
  for (const event of wrong) {
    const label = `${show(event.actual)} → ${show(event.expected)}`;
    substitutions.set(label, [...(substitutions.get(label) ?? []), event]);
  }

  const topSubstitution = [...substitutions.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (topSubstitution && topSubstitution[1].length >= 3) {
    const [label, mistakes] = topSubstitution;
    const rate = Math.round((mistakes.length / Math.max(1, typed.filter((event) => event.expected === mistakes[0].expected).length)) * 100);
    insights.push({
      kind: "mistake",
      title: `Recurring mix-up: ${label}`,
      detail: `${mistakes.length} slips (${rate}% of chances). This is your clearest repeatable error in this test.`,
      target: mistakes[0].expected,
      evidence: mistakes.length,
    });
  }

  // Gaps are measured from the previous event of any kind, so backspaces never inflate a key's timing.
  const steps = events.flatMap((event, index) => {
    const previous = events[index - 1];
    return event.kind === "input" && previous ? [{ event, previous, gap: event.time - previous.time }] : [];
  });
  const flow = steps.filter(({ event, previous, gap }) => previous.kind === "input" && previous.correct && event.correct && gap > 0);
  const baseline = median(flow.map((step) => step.gap));
  const bigrams = new Map<string, number[]>();
  for (const { event, previous, gap } of flow) {
    const bigram = `${previous.expected}${event.expected}`;
    bigrams.set(bigram, [...(bigrams.get(bigram) ?? []), gap]);
  }
  const slow = [...bigrams.entries()]
    .map(([bigram, delays]) => ({ bigram, delays, typical: median(delays) }))
    .filter((entry) => entry.delays.length >= 5 && entry.typical >= Math.max(180, baseline * 1.4))
    .sort((a, b) => b.typical - a.typical)[0];
  if (slow) {
    insights.push({
      kind: "timing",
      title: `Slow transition: “${slow.bigram}”`,
      detail: `Median transition time was ${Math.round(slow.typical)}ms, versus ${Math.round(baseline)}ms across this test (${slow.delays.length} occurrences).`,
      target: slow.bigram,
      evidence: slow.delays.length,
    });
  }

  const corrections = events.filter((event) => event.kind === "backspace").length;
  if (corrections >= 3 && typed.length) {
    const rate = Math.round((corrections / typed.length) * 100);
    insights.push({
      kind: "correction",
      title: `${rate}% correction rate`,
      detail: `You used backspace ${corrections} times. Slowing slightly before uncertain transitions may improve net speed.`,
      evidence: corrections,
    });
  }

  const postError = steps.filter(({ previous, gap }) => previous.kind === "input" && !previous.correct && gap > 0).map((step) => step.gap);
  if (postError.length >= 3 && baseline && median(postError) >= baseline * 1.4) {
    insights.push({
      kind: "pace",
      title: "Errors interrupt your rhythm",
      detail: `The next key after an error took ${Math.round(median(postError))}ms versus your ${Math.round(baseline)}ms baseline.`,
      evidence: postError.length,
    });
  }

  return insights.slice(0, 3);
}

export function calculateResult(input: {
  duration: 15 | 30 | 45;
  seed: number;
  prompt: string;
  typedText: string;
  events: KeyEvent[];
  /** Seconds actually typed; shorter than `duration` when the test is ended early. */
  elapsed?: number;
}): TestResult {
  const attempts = input.events.filter((event) => event.kind === "input");
  const correctAttempts = attempts.filter((event) => event.correct).length;
  const finalCorrect = input.typedText.split("").filter((character, index) => character === input.prompt[index]).length;
  const missed = input.typedText.split("").filter((character) => character === "\0").length;
  const finalIncorrect = input.typedText.split("").filter((character, index) => character !== "\0" && character !== input.prompt[index]).length;
  const insights = analyze(input.events);
  const seconds = Math.min(input.duration, Math.max(1, input.elapsed ?? input.duration));
  const durationMinutes = seconds / 60;
  const points = timeline(input.events, Math.ceil(seconds));
  const netWpm = finalCorrect / 5 / durationMinutes;
  const rawWpm = attempts.length / 5 / durationMinutes;
  const accuracy = attempts.length ? (correctAttempts / attempts.length) * 100 : 0;
  const values = points.map((point) => point.wpm);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;

  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    duration: input.duration,
    elapsed: seconds,
    seed: input.seed,
    prompt: input.prompt,
    netWpm: round(netWpm),
    rawWpm: round(rawWpm),
    accuracy: round(accuracy),
    consistency: round(Math.max(0, 100 - (Math.sqrt(variance) / Math.max(1, average)) * 100)),
    characters: { correct: finalCorrect, incorrect: finalIncorrect, extra: Math.max(0, input.typedText.length - input.prompt.length), missed },
    corrections: input.events.filter((event) => event.kind === "backspace").length,
    timeline: points,
    insights,
    drillTarget: insights.find((insight) => insight.target)?.target,
  };
}
