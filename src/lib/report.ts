import type { KeyEvent, TestResult } from "./types";

// Deterministic statistics for the results readout. Every finding is a hypothesis test that has to
// clear minimum sample sizes and p < 0.05 after Holm correction across all tests run.

const PAUSE_CAP_MS = 3000;
const MIN_FLOW = 30;
const MIN_CHARACTER_ATTEMPTS = 20;
const MIN_BIGRAM = 8;
const MIN_GROUP = 8;
const MIN_TESTS_FOR_TREND = 5;
const ALPHA = 0.05;

export function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.min(lower + 1, sorted.length - 1);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}
export const median = (values: number[]) => quantile([...values].sort((a, b) => a - b), 0.5);
const mad = (values: number[], center: number) => median(values.map((value) => Math.abs(value - center)));

/** Wilson score interval for a binomial proportion. */
export function wilson(successes: number, trials: number, z = 1.96): [number, number] {
  if (!trials) return [0, 1];
  const p = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const center = (p + (z * z) / (2 * trials)) / denominator;
  const margin = (z / denominator) * Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials));
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

function normalCdf(z: number) {
  // Abramowitz & Stegun 7.1.26, |error| < 1.5e-7.
  const t = 1 / (1 + (0.3275911 * Math.abs(z)) / Math.SQRT2);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

function logGamma(x: number) {
  // Lanczos approximation (Numerical Recipes gammln).
  const coefficients = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let series = 1.000000000190015;
  for (const coefficient of coefficients) series += coefficient / ++y;
  return -tmp + Math.log((2.5066282746310005 * series) / x);
}

/** Exact one-sided binomial test: P(X ≥ k) for X ~ Binomial(n, p). */
export function binomialTail(k: number, n: number, p: number) {
  if (k <= 0) return 1;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let total = 0;
  for (let i = k; i <= n; i += 1) {
    total += Math.exp(logGamma(n + 1) - logGamma(i + 1) - logGamma(n - i + 1) + i * Math.log(p) + (n - i) * Math.log(1 - p));
  }
  return Math.min(1, total);
}

/** One-sided Mann–Whitney U test that `a` tends to be larger than `b` (normal approximation, tie-corrected). */
export function mannWhitney(a: number[], b: number[]) {
  const combined = [...a.map((value) => ({ value, fromA: true })), ...b.map((value) => ({ value, fromA: false }))].sort((x, y) => x.value - y.value);
  let rankSumA = 0;
  let tieTerm = 0;
  for (let start = 0; start < combined.length;) {
    let end = start;
    while (end + 1 < combined.length && combined[end + 1].value === combined[start].value) end += 1;
    const rank = (start + end) / 2 + 1;
    const ties = end - start + 1;
    tieTerm += ties ** 3 - ties;
    for (let index = start; index <= end; index += 1) if (combined[index].fromA) rankSumA += rank;
    start = end + 1;
  }
  const n1 = a.length;
  const n2 = b.length;
  const n = n1 + n2;
  const u = rankSumA - (n1 * (n1 + 1)) / 2;
  const sigma = Math.sqrt(((n1 * n2) / 12) * (n + 1 - tieTerm / (n * (n - 1))));
  const z = sigma ? (u - (n1 * n2) / 2 - 0.5) / sigma : 0;
  // `effect` is the common-language effect size: P(random a > random b).
  return { effect: u / (n1 * n2), p: 1 - normalCdf(z) };
}

/** Holm–Bonferroni adjusted p-values, in input order. */
export function holm(pValues: number[]) {
  const adjusted = new Array<number>(pValues.length).fill(1);
  let running = 0;
  pValues.map((p, index) => ({ p, index })).sort((a, b) => a.p - b.p).forEach(({ p, index }, rank) => {
    running = Math.max(running, Math.min(1, (pValues.length - rank) * p));
    adjusted[index] = running;
  });
  return adjusted;
}

function tCritical95(df: number) {
  // Cornish–Fisher expansion of the two-sided 95% t quantile; within 1% for df ≥ 3.
  const z = 1.959964;
  return z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df ** 2) + (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / (384 * df ** 3);
}

/** Ordinary least squares slope with its 95% confidence interval. */
export function regression(xs: number[], ys: number[]) {
  const n = xs.length;
  const meanX = xs.reduce((sum, x) => sum + x, 0) / n;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  xs.forEach((x, index) => { sxx += (x - meanX) ** 2; sxy += (x - meanX) * (ys[index] - meanY); });
  const slope = sxx ? sxy / sxx : 0;
  const residual = xs.reduce((sum, x, index) => sum + (ys[index] - meanY - slope * (x - meanX)) ** 2, 0);
  const margin = n > 2 && sxx ? tCritical95(n - 2) * Math.sqrt(residual / (n - 2) / sxx) : Infinity;
  return { slope, low: slope - margin, high: slope + margin };
}

type Transition = { event: KeyEvent; previous: KeyEvent; gap: number };

function transitions(events: KeyEvent[]): Transition[] {
  return events.flatMap((event, index) => {
    const previous = events[index - 1];
    return event.kind === "input" && previous ? [{ event, previous, gap: event.time - previous.time }] : [];
  });
}

/** Correct key after a correct key, excluding away-from-keyboard pauses: the cleanest rhythm sample. */
const isFlow = ({ event, previous, gap }: Transition) => previous.kind === "input" && previous.correct && event.correct && gap > 0 && gap <= PAUSE_CAP_MS;

function replay(events: KeyEvent[]) {
  const stack: KeyEvent[] = [];
  const erased = new Set<KeyEvent>();
  for (const event of events) {
    if (event.kind === "backspace") {
      const removed = stack.pop();
      if (removed) erased.add(removed);
    } else stack.push(event);
  }
  return { final: stack, erased };
}

export type Row = { label: string; value: string; detail: string };
export type Section = { title: string; rows: Row[] };
export type Finding = { title: string; evidence: string; advice: string; target?: string };
export type Report = { scope: string; sections: Section[]; findings: Finding[] };
type Candidate = { p: number; rank: number; build: (adjustedP: number) => Finding };

const show = (character: string) => (character === " " ? "␣" : character);
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const ms = (value: number) => `${Math.round(value)} ms`;
const signedMs = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(Math.round(value))} ms`;
const pText = (p: number) => (p < 0.001 ? "p < 0.001" : `p = ${p.toFixed(3)}`);
const notEnough = (label: string, need: string): Row => ({ label, value: "—", detail: `not enough data: ${need}` });

export function buildReport(current: { events: KeyEvent[]; elapsed: number }, traces: { events: KeyEvent[]; result: TestResult }[]): Report {
  const { events, elapsed } = current;
  const seconds = Math.max(elapsed, 1);
  const minutes = seconds / 60;
  const inputs = events.filter((event) => event.kind === "input");
  const backspaces = events.filter((event) => event.kind === "backspace").length;
  const { final, erased } = replay(events);
  const finalInputs = final.filter((event) => event.kind === "input");
  const correctFinal = finalInputs.filter((event) => event.correct).length;
  const uncorrected = finalInputs.length - correctFinal;
  const wrong = inputs.filter((event) => !event.correct);
  const corrected = wrong.filter((event) => erased.has(event)).length;
  const overDeleted = inputs.filter((event) => event.correct && erased.has(event)).length;
  const missed = final.filter((event) => event.kind === "skip").length;

  const all = transitions(events);
  const flow = all.filter(isFlow);
  const flowGaps = flow.map((entry) => entry.gap);
  const sortedFlow = [...flowGaps].sort((a, b) => a - b);
  const flowMedian = quantile(sortedFlow, 0.5);
  const flowMad = mad(flowGaps, flowMedian);
  const candidates: Candidate[] = [];

  // Speed
  const speed: Row[] = [
    { label: "net wpm", value: (correctFinal / 5 / minutes).toFixed(1), detail: `${correctFinal} correct characters over ${seconds.toFixed(1)} s` },
    { label: "raw wpm", value: (inputs.length / 5 / minutes).toFixed(1), detail: `${inputs.length} keystrokes, corrected or not` },
  ];
  if (flow.length >= MIN_FLOW) {
    const threshold = flowMedian + 3 * 1.4826 * flowMad;
    const hesitations = flowGaps.filter((gap) => gap > threshold);
    const lostSeconds = hesitations.reduce((sum, gap) => sum + gap - flowMedian, 0) / 1000;
    const withoutHesitations = correctFinal / 5 / (Math.max(1, seconds - lostSeconds) / 60);
    speed.push(
      { label: "median-pace wpm", value: (12000 / flowMedian).toFixed(1), detail: `speed if every key took your median ${ms(flowMedian)}` },
      { label: "burst wpm (p10)", value: (12000 / quantile(sortedFlow, 0.1)).toFixed(1), detail: `your fastest 10% of intervals (≤ ${ms(quantile(sortedFlow, 0.1))})` },
      { label: "hesitation cost", value: `${lostSeconds.toFixed(1)} s`, detail: `${hesitations.length} pauses over ${ms(threshold)} (median + 3·MAD) · ≈ ${withoutHesitations.toFixed(1)} wpm without them` },
    );
    const drift = regression(flow.map((entry) => entry.event.time / 1000), flowGaps);
    const verdict = drift.low > 0 ? "slowing down" : drift.high < 0 ? "speeding up" : "steady (CI spans 0)";
    speed.push({ label: "pace drift", value: `${signedMs(drift.slope * 10)}/key per 10 s`, detail: `95% CI ${signedMs(drift.low * 10)} to ${signedMs(drift.high * 10)} · ${verdict}` });
  } else speed.push(notEnough("pace analysis", `${MIN_FLOW} clean intervals, have ${flow.length}`));

  // Accuracy (Soukoreff & MacKenzie 2003 text-entry error metrics)
  const [errorLow, errorHigh] = wilson(wrong.length, inputs.length);
  const errorBase = correctFinal + uncorrected + corrected;
  const detection = wrong.flatMap((event) => {
    const next = events[events.indexOf(event) + 1];
    return next?.kind === "backspace" ? [next.time - event.time] : [];
  });
  const accuracy: Row[] = [
    { label: "keystroke error rate", value: inputs.length ? percent(wrong.length / inputs.length) : "—", detail: `95% Wilson CI ${percent(errorLow)}–${percent(errorHigh)} · n = ${inputs.length}` },
    { label: "total error rate", value: errorBase ? percent((uncorrected + corrected) / errorBase) : "—", detail: errorBase ? `corrected ${percent(corrected / errorBase)} + left in ${percent(uncorrected / errorBase)}` : "no typed characters" },
    { label: "KSPC", value: finalInputs.length ? ((inputs.length + backspaces) / finalInputs.length).toFixed(3) : "—", detail: "keystrokes per final character · 1.000 means no wasted keys" },
    { label: "errors corrected", value: `${corrected}/${wrong.length}`, detail: `${detection.length ? `median ${ms(median(detection))} to notice` : "no immediate corrections"} · ${overDeleted} correct characters deleted along the way` },
    { label: "missed letters", value: String(missed), detail: "letters skipped with space and never typed" },
  ];

  // Rhythm
  const rhythm: Row[] = [];
  if (flow.length >= MIN_FLOW) {
    rhythm.push(
      { label: "inter-key interval", value: ms(flowMedian), detail: `IQR ${ms(quantile(sortedFlow, 0.25))}–${ms(quantile(sortedFlow, 0.75))} · p90 ${ms(quantile(sortedFlow, 0.9))} · n = ${flow.length}` },
      { label: "rhythm variability", value: percent((1.4826 * flowMad) / flowMedian), detail: "robust CV (1.4826·MAD ÷ median) · lower is steadier" },
    );
  } else rhythm.push(notEnough("rhythm", `${MIN_FLOW} clean intervals, have ${flow.length}`));

  const boundary = flow.filter((entry) => entry.previous.expected === " ").map((entry) => entry.gap);
  const inWord = flow.filter((entry) => entry.previous.expected !== " " && entry.event.expected !== " ").map((entry) => entry.gap);
  if (boundary.length >= MIN_GROUP && inWord.length >= MIN_GROUP) {
    const test = mannWhitney(boundary, inWord);
    const difference = median(boundary) - median(inWord);
    rhythm.push({ label: "word-start cost", value: signedMs(difference), detail: `first letter ${ms(median(boundary))} vs in-word ${ms(median(inWord))} · ${pText(test.p)}` });
    candidates.push({ p: test.p, rank: test.effect, build: (adjustedP) => ({
      title: "You hesitate at the start of each word",
      evidence: `First-letter interval ${ms(median(boundary))} vs ${ms(median(inWord))} inside words (n = ${boundary.length}/${inWord.length}) · P(slower) = ${test.effect.toFixed(2)} · Mann–Whitney ${pText(adjustedP)} (Holm)`,
      advice: "Read one word ahead so the next word is loaded before you finish the current one.",
    }) });
  } else rhythm.push(notEnough("word-start cost", `${MIN_GROUP} word starts and in-word intervals`));

  const afterError = all.filter(({ previous, gap }) => previous.kind === "input" && !previous.correct && gap > 0 && gap <= PAUSE_CAP_MS).map((entry) => entry.gap);
  if (afterError.length >= MIN_GROUP && flow.length >= MIN_FLOW) {
    const test = mannWhitney(afterError, flowGaps);
    rhythm.push({ label: "post-error slowing", value: signedMs(median(afterError) - flowMedian), detail: `next key after an uncorrected error ${ms(median(afterError))} (n = ${afterError.length}) · ${pText(test.p)}` });
    candidates.push({ p: test.p, rank: test.effect, build: (adjustedP) => ({
      title: "Errors break your rhythm",
      evidence: `Key after an error ${ms(median(afterError))} vs ${ms(flowMedian)} baseline (n = ${afterError.length}) · P(slower) = ${test.effect.toFixed(2)} · Mann–Whitney ${pText(adjustedP)} (Holm)`,
      advice: "Decide in advance: either fix errors immediately or keep going. Hesitating between the two costs the most.",
    }) });
  } else rhythm.push(notEnough("post-error slowing", `${MIN_GROUP} keys typed right after an error, have ${afterError.length}`));

  // Pooled history: per-key error rates and per-transition latency, normalized per test.
  // Older runs keep only their summary; they count toward the speed trend but not the pooled keystroke tests.
  const pooledTraces = traces.filter((trace) => trace.events.length);
  const pooledInputs = pooledTraces.flatMap((trace) => trace.events.filter((event) => event.kind === "input"));
  const relativeFlow = pooledTraces.flatMap((trace) => {
    const traceFlow = transitions(trace.events).filter(isFlow);
    const traceMedian = median(traceFlow.map((entry) => entry.gap));
    return traceMedian ? traceFlow.map((entry) => ({ bigram: entry.previous.expected + entry.event.expected, relative: entry.gap / traceMedian })) : [];
  });

  const byCharacter = new Map<string, KeyEvent[]>();
  for (const event of pooledInputs) byCharacter.set(event.expected, [...(byCharacter.get(event.expected) ?? []), event]);
  const totalWrong = pooledInputs.filter((event) => !event.correct).length;
  let worstCharacter: { character: string; rate: number; n: number } | undefined;
  for (const [character, attempts] of byCharacter) {
    if (attempts.length < MIN_CHARACTER_ATTEMPTS) continue;
    const errors = attempts.filter((event) => !event.correct);
    const otherAttempts = pooledInputs.length - attempts.length;
    if (!otherAttempts) continue;
    const baseline = (totalWrong - errors.length) / otherAttempts;
    const rate = errors.length / attempts.length;
    if (!worstCharacter || rate > worstCharacter.rate) worstCharacter = { character, rate, n: attempts.length };
    if (rate <= baseline) continue;
    const p = binomialTail(errors.length, attempts.length, Math.max(baseline, 1e-4));
    const [low, high] = wilson(errors.length, attempts.length);
    const confusions = new Map<string, number>();
    for (const error of errors) confusions.set(error.actual, (confusions.get(error.actual) ?? 0) + 1);
    const [topActual, topCount] = [...confusions.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
    candidates.push({ p, rank: rate / Math.max(baseline, 1e-4), build: (adjustedP) => ({
      title: `“${show(character)}” fails ${(rate / Math.max(baseline, 1e-4)).toFixed(1)}× more often than other keys`,
      evidence: `${errors.length}/${attempts.length} wrong (${percent(rate)}, 95% CI ${percent(low)}–${percent(high)}) vs ${percent(baseline)} elsewhere · exact binomial ${pText(adjustedP)} (Holm)${topCount ? ` · most often typed as “${show(topActual)}” (${topCount}/${errors.length})` : ""}`,
      advice: character === " " ? "You often type a letter where the space belongs: finish each word fully before moving on." : `Practice words containing “${character}” at a slower, accurate pace before speeding up.`,
      target: character === " " ? undefined : character,
    }) });
  }

  const byBigram = new Map<string, number[]>();
  for (const { bigram, relative } of relativeFlow) byBigram.set(bigram, [...(byBigram.get(bigram) ?? []), relative]);
  const relativeAll = relativeFlow.map((entry) => entry.relative);
  let slowestBigram: { bigram: string; ratio: number; n: number } | undefined;
  for (const [bigram, values] of byBigram) {
    if (values.length < MIN_BIGRAM) continue;
    const ratio = median(values);
    if (!slowestBigram || ratio > slowestBigram.ratio) slowestBigram = { bigram, ratio, n: values.length };
    // Ignore effects too small to practice, even when a large sample makes them significant.
    if (ratio < 1.15) continue;
    const test = mannWhitney(values, relativeAll);
    candidates.push({ p: test.p, rank: ratio, build: (adjustedP) => ({
      title: `Slow transition “${show(bigram[0])}${show(bigram[1])}”`,
      evidence: `${ratio.toFixed(2)}× your median interval for that test (n = ${values.length}) · P(slower) = ${test.effect.toFixed(2)} · Mann–Whitney ${pText(adjustedP)} (Holm)`,
      advice: `Drill words containing “${bigram}” until the two keys come out as one motion.`,
      target: bigram.includes(" ") ? undefined : bigram,
    }) });
  }

  const history: Row[] = [{ label: "pooled sample", value: `${pooledTraces.length} test${pooledTraces.length === 1 ? "" : "s"}`, detail: `${pooledInputs.length} keystrokes from this device's saved traces` }];
  history.push(worstCharacter
    ? { label: "most error-prone key", value: `“${show(worstCharacter.character)}” ${percent(worstCharacter.rate)}`, detail: `n = ${worstCharacter.n} attempts · overall ${percent(totalWrong / Math.max(1, pooledInputs.length))}` }
    : notEnough("most error-prone key", `${MIN_CHARACTER_ATTEMPTS} attempts on one key`));
  history.push(slowestBigram
    ? { label: "slowest transition", value: `“${show(slowestBigram.bigram[0])}${show(slowestBigram.bigram[1])}” ${slowestBigram.ratio.toFixed(2)}×`, detail: `median relative to each test's typical interval · n = ${slowestBigram.n}` }
    : notEnough("slowest transition", `${MIN_BIGRAM} clean samples of one letter pair`));
  const chronological = traces.map((trace) => trace.result).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (chronological.length >= MIN_TESTS_FOR_TREND) {
    const trend = regression(chronological.map((_, index) => index), chronological.map((result) => result.netWpm));
    const verdict = trend.low > 0 ? "improving" : trend.high < 0 ? "declining" : "no clear trend (CI spans 0)";
    history.push({ label: "speed trend", value: `${trend.slope >= 0 ? "+" : "−"}${Math.abs(trend.slope).toFixed(2)} wpm/test`, detail: `95% CI ${trend.low.toFixed(2)} to ${trend.high.toFixed(2)} over ${chronological.length} tests · ${verdict}` });
  } else history.push(notEnough("speed trend", `${MIN_TESTS_FOR_TREND} saved tests, have ${chronological.length}`));

  const adjusted = holm(candidates.map((candidate) => candidate.p));
  const findings = candidates
    .map((candidate, index) => ({ candidate, adjustedP: adjusted[index] }))
    .filter(({ adjustedP }) => adjustedP < ALPHA)
    .sort((a, b) => a.adjustedP - b.adjustedP || b.candidate.rank - a.candidate.rank)
    .slice(0, 6)
    .map(({ candidate, adjustedP }) => candidate.build(adjustedP));

  return {
    scope: `${candidates.length} tests run · α = ${ALPHA} (Holm)`,
    sections: [
      { title: "Speed", rows: speed },
      { title: "Accuracy", rows: accuracy },
      { title: "Rhythm", rows: rhythm },
      { title: "History", rows: history },
    ],
    findings,
  };
}
