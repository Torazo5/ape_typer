import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { calculateResult } from "./lib/analysis";
import { buildReport, type Report } from "./lib/report";
import { clearTraces, getLocalTraces, saveTrace, type Trace } from "./lib/storage";
import type { KeyEvent, TestDuration, TestResult } from "./lib/types";
import { createPrompt, spaceAction } from "./lib/words";

type Status = "ready" | "running" | "finished";
type Page = "test" | "statistics";
const durations: TestDuration[] = [15, 30, 45];

type Settings = { duration: TestDuration; caretSpeed: "off" | "fast" | "medium" | "slow"; blink: "smooth" | "hard"; pace: "off" | "average" | "custom"; paceWpm: number };
const defaultSettings: Settings = { duration: 30, caretSpeed: "medium", blink: "smooth", pace: "off", paceWpm: 60 };
const caretMs: Record<Settings["caretSpeed"], number> = { off: 0, fast: 85, medium: 100, slow: 150 };
const settingsKey = "ape-typer-settings";
const unfinishedKey = "ape-typer-unfinished";
/** Shorter runs are mostly restarts; they still show results but stay out of history and stats. */
const MIN_SAVED_SECONDS = 7;
type UnfinishedRun = { duration: TestDuration; seed: number; prompt: string; typedText: string; events: KeyEvent[]; elapsed: number };

function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(settingsKey) ?? "{}");
    return { ...defaultSettings, ...saved, duration: durations.includes(saved?.duration) ? saved.duration : defaultSettings.duration };
  }
  catch { return defaultSettings; }
}

function chartIndex(event: { currentTarget: SVGSVGElement; clientX: number }, length: number) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return Math.max(0, Math.min(length - 1, Math.round(((event.clientX - bounds.left) / bounds.width) * (length - 1))));
}

function LineChart({ result }: { result: TestResult }) {
  const [raw, setRaw] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const points = result.timeline;
  const max = Math.max(1, ...points.map((point) => Math.max(point.wpm, raw ? point.rawWpm : 0)));
  const path = (key: "wpm" | "rawWpm" | "accuracy", scale = max) => points.map((point, index) => `${(index / Math.max(1, points.length - 1)) * 100},${100 - (point[key] / scale) * 92}`).join(" ");
  const activePoint = activeIndex === null ? undefined : points[activeIndex];
  const activeX = activeIndex === null ? 0 : (activeIndex / Math.max(1, points.length - 1)) * 100;
  const activeWpm = activePoint ? 100 - ((raw ? activePoint.rawWpm : activePoint.wpm) / max) * 92 : 0;
  const activeAccuracy = activePoint ? 100 - (activePoint.accuracy / 100) * 92 : 0;
  const tooltipShift = activeIndex === 0 ? "0" : activeIndex === points.length - 1 ? "-100%" : "-50%";
  return <section className="result-chart" aria-label="Typing pace chart">
    <div className="chart-topline"><span><i className="legend-line speed" />{raw ? "raw wpm" : "net wpm"}</span><span><i className="legend-line accuracy" />accuracy</span><button className="chart-switch" onClick={() => setRaw(!raw)}>{raw ? "net" : "raw"}</button></div>
    <svg className="chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Line graph of words per minute and accuracy over time" onPointerMove={(event) => setActiveIndex(chartIndex(event, points.length))} onPointerDown={(event) => setActiveIndex(chartIndex(event, points.length))} onPointerLeave={() => setActiveIndex(null)}>
      <line x1="0" y1="20" x2="100" y2="20" /><line x1="0" y1="60" x2="100" y2="60" />
      <polyline points={path(raw ? "rawWpm" : "wpm")} className="speed-path" />
      <polyline points={path("accuracy", 100)} className="accuracy-path" />
      {activePoint && <><line className="chart-marker" x1={activeX} y1="0" x2={activeX} y2="100" /><circle className="speed-dot" cx={activeX} cy={activeWpm} r="1.5" /><circle className="accuracy-dot" cx={activeX} cy={activeAccuracy} r="1.5" /></>}
    </svg>
    {activePoint && <div className="chart-tooltip" role="status" style={{ left: `${activeX}%`, transform: `translateX(${tooltipShift})` }}><strong>{activePoint.second}s</strong><span>{activePoint.wpm} net · {activePoint.rawWpm} raw · {activePoint.accuracy}% acc</span></div>}
    <div className="chart-foot"><span>1s</span><span>{result.timeline.length}s</span></div>
  </section>;
}

function HistoryChart({ history }: { history: TestResult[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const runs = [...history].reverse();
  const maxWpm = Math.max(1, ...runs.map((run) => run.netWpm));
  const path = (value: (run: TestResult) => number, scale: number) => runs.map((run, index) => `${(index / Math.max(1, runs.length - 1)) * 100},${100 - (value(run) / scale) * 92}`).join(" ");
  const activeRun = activeIndex === null ? undefined : runs[activeIndex];
  const activeX = activeIndex === null ? 0 : (activeIndex / Math.max(1, runs.length - 1)) * 100;
  const activeWpm = activeRun ? 100 - (activeRun.netWpm / maxWpm) * 92 : 0;
  const activeAccuracy = activeRun ? 100 - (activeRun.accuracy / 100) * 92 : 0;
  const tooltipShift = activeIndex === 0 ? "0" : activeIndex === runs.length - 1 ? "-100%" : "-50%";
  return <section className="history-chart" aria-label="Progress across saved typing tests">
    <div className="chart-topline"><span><i className="legend-line speed" />net wpm</span><span><i className="legend-line accuracy" />accuracy</span></div>
    <svg className="chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Line graph of net words per minute and accuracy across saved tests" onPointerMove={(event) => setActiveIndex(chartIndex(event, runs.length))} onPointerDown={(event) => setActiveIndex(chartIndex(event, runs.length))} onPointerLeave={() => setActiveIndex(null)}>
      <line x1="0" y1="20" x2="100" y2="20" /><line x1="0" y1="60" x2="100" y2="60" />
      <polyline points={path((run) => run.netWpm, maxWpm)} className="speed-path" />
      <polyline points={path((run) => run.accuracy, 100)} className="accuracy-path" />
      {activeRun && <><line className="chart-marker" x1={activeX} y1="0" x2={activeX} y2="100" /><circle className="speed-dot" cx={activeX} cy={activeWpm} r="1.5" /><circle className="accuracy-dot" cx={activeX} cy={activeAccuracy} r="1.5" /></>}
    </svg>
    {activeRun && <div className="chart-tooltip" role="status" style={{ left: `${activeX}%`, transform: `translateX(${tooltipShift})` }}><strong>{new Date(activeRun.createdAt).toLocaleDateString()}</strong><span>{activeRun.netWpm} wpm · {activeRun.accuracy}% acc · {activeRun.timeline.length}s</span></div>}
    <div className="chart-foot"><span>first saved run</span><span>latest</span></div>
  </section>;
}

function ReportTables({ report }: { report: Report }) {
  return <div className="report-grid">{report.sections.map((section) => <section className="report-section" key={section.title}><h3>{section.title}</h3><dl>{section.rows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd><strong>{row.value}</strong><span>{row.detail}</span></dd></div>)}</dl></section>)}</div>;
}

function Statistics({ history, traces, selectedId, onSelect }: { history: TestResult[]; traces: Trace[]; selectedId?: string; onSelect: (id: string) => void }) {
  if (!history.length) return <section className="statistics" aria-label="Typing statistics"><p className="eyebrow">Your data</p><h1>Statistics</h1><p className="muted">Finish a test lasting at least 7 seconds to start building your history.</p></section>;
  const selected = history.find((run) => run.id === selectedId) ?? history[0];
  const selectedTrace = traces.find((trace) => trace.id === selected.id);
  const runReport = selectedTrace?.events.length ? buildReport({ events: selectedTrace.events, elapsed: selected.elapsed ?? selected.timeline.length }, traces) : undefined;
  const averageWpm = history.reduce((sum, run) => sum + run.netWpm, 0) / history.length;
  const averageAccuracy = history.reduce((sum, run) => sum + run.accuracy, 0) / history.length;
  const bestWpm = Math.max(...history.map((run) => run.netWpm));
  return <section className="statistics" aria-label="Typing statistics">
    <div className="section-heading"><div><p className="eyebrow">Your data</p><h1>Statistics</h1></div><span className="pill">{history.length} saved {history.length === 1 ? "run" : "runs"}</span></div>
    <div className="stat-summary">
      <div><span>average</span><strong>{averageWpm.toFixed(1)}<small> wpm</small></strong></div>
      <div><span>best</span><strong>{bestWpm}<small> wpm</small></strong></div>
      <div><span>accuracy</span><strong>{averageAccuracy.toFixed(1)}<small>%</small></strong></div>
    </div>
    {history.length > 1 && <HistoryChart history={history} />}
    <div className="statistics-detail">
      <section className="run-list" aria-label="Past typing runs"><h2>Past runs</h2>{history.map((run) => <button className={run.id === selected.id ? "selected" : ""} type="button" key={run.id} onClick={() => onSelect(run.id)} aria-pressed={run.id === selected.id}><strong>{run.netWpm} <small>wpm</small></strong><span>{run.accuracy}% acc · {run.timeline.length}s</span><time>{new Date(run.createdAt).toLocaleString()}</time></button>)}</section>
      <section className="run-detail" aria-label="Selected typing run"><div className="section-heading"><div><p className="eyebrow">Selected run</p><h2>{new Date(selected.createdAt).toLocaleString()}</h2></div></div><LineChart result={selected} />
        <dl className="run-metrics">
          <div><dt>raw speed</dt><dd>{selected.rawWpm} wpm</dd></div><div><dt>consistency</dt><dd>{selected.consistency}%</dd></div><div><dt>correct</dt><dd>{selected.characters.correct}</dd></div><div><dt>incorrect</dt><dd>{selected.characters.incorrect}</dd></div><div><dt>missed</dt><dd>{selected.characters.missed}</dd></div><div><dt>corrections</dt><dd>{selected.corrections}</dd></div>
        </dl>
        {selected.insights.length > 0 && <div className="run-insights"><h3>Run signals</h3>{selected.insights.map((insight) => <p key={insight.title}><strong>{insight.title}</strong>{insight.detail}</p>)}</div>}
        <section className="historical-analysis"><div className="section-heading"><div><p className="eyebrow">Keystroke analysis</p><h3>Speed, accuracy, and rhythm</h3></div>{runReport && <span className="pill">{runReport.scope}</span>}</div>{runReport ? <ReportTables report={runReport} /> : <p className="muted">This older run retains its summary, but detailed keystrokes are kept only for the newest 50 saved runs.</p>}</section>
      </section>
    </div>
  </section>;
}

const Word = memo(function Word({ text, start, typed, caretAt, activeCharacterRef }: { text: string; start: number; typed: string; caretAt: number; activeCharacterRef: RefObject<HTMLSpanElement | null> }) {
  return <span className="word">{text.split("").map((character, offset) => {
    const actual = typed[offset];
    const state = actual === undefined ? "future" : actual === "\0" ? "missed" : actual === character ? "correct" : "incorrect";
    return <span ref={offset === caretAt ? activeCharacterRef : undefined} className={state} data-i={start + offset} key={offset}>{character}</span>;
  })}</span>;
});

function offsetWithin(linesElement: HTMLElement, characterElement: HTMLElement) {
  // Both rects share the lines transform, so the difference stays correct mid-slide.
  const linesRect = linesElement.getBoundingClientRect();
  const characterRect = characterElement.getBoundingClientRect();
  return { left: characterRect.left - linesRect.left, top: characterRect.top - linesRect.top, height: characterRect.height };
}

const Prompt = memo(function Prompt({ prompt, typed, inputRef, paceStart, paceWpm }: { prompt: string; typed: string; inputRef: RefObject<HTMLTextAreaElement | null>; paceStart: number | null; paceWpm: number }) {
  const promptRef = useRef<HTMLDivElement>(null);
  const linesRef = useRef<HTMLDivElement>(null);
  const activeCharacterRef = useRef<HTMLSpanElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  const paceCaretRef = useRef<HTMLSpanElement>(null);
  const previousLineTopRef = useRef<number | null>(null);
  const typingTimerRef = useRef<number>(undefined);
  const frameRef = useRef(0);
  const words = useMemo(() => {
    let start = 0;
    return prompt.split(" ").map((word) => {
      const entry = { start, text: prompt.slice(start, start + word.length + 1) };
      start += word.length + 1;
      return entry;
    });
  }, [prompt]);
  const layout = useCallback((force = false) => {
    const promptElement = promptRef.current;
    const linesElement = linesRef.current;
    const characterElement = activeCharacterRef.current;
    const caretElement = caretRef.current;
    if (!promptElement || !linesElement || !characterElement || !caretElement) return;
    const { left, top, height } = offsetWithin(linesElement, characterElement);
    const translate = `translate3d(${left}px, ${top}px, 0)`;
    caretElement.style.transform = translate;
    caretElement.style.height = `${height}px`;
    // Keeps IME popups and mobile keyboards anchored at the caret.
    if (inputRef.current) inputRef.current.style.transform = translate;
    if (force || previousLineTopRef.current !== top) {
      linesElement.style.transform = `translateY(${-Math.max(0, top - (promptElement.clientHeight - height) / 2)}px)`;
    }
    previousLineTopRef.current = top;
  }, [inputRef]);
  useLayoutEffect(() => {
    // One layout read per frame, however many keys land in it.
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => layout());
    caretRef.current?.classList.add("typing");
    window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => caretRef.current?.classList.remove("typing"), 600);
  }, [layout, typed.length]);
  useEffect(() => {
    const onResize = () => layout(true);
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); window.clearTimeout(typingTimerRef.current); cancelAnimationFrame(frameRef.current); };
  }, [layout]);
  useEffect(() => {
    const paceElement = paceCaretRef.current;
    const linesElement = linesRef.current;
    if (!paceElement || !linesElement) return;
    paceElement.hidden = true;
    if (paceStart === null || paceWpm <= 0) return;
    const characterMs = 60000 / (paceWpm * 5);
    paceElement.style.transitionDuration = `${characterMs}ms`;
    let frame = 0;
    let lastIndex = -1;
    let lastTop: number | null = null;
    const tick = () => {
      const index = Math.floor((performance.now() - paceStart) / characterMs);
      const characterElement = index === lastIndex ? null : linesElement.querySelector<HTMLElement>(`[data-i="${index}"]`);
      if (characterElement) {
        lastIndex = index;
        const { left, top, height } = offsetWithin(linesElement, characterElement);
        // Glide along a line, jump between lines.
        paceElement.style.transitionProperty = lastTop === null || lastTop === top ? "transform" : "none";
        paceElement.style.transform = `translate3d(${left}px, ${top}px, 0)`;
        paceElement.style.height = `${height}px`;
        paceElement.hidden = false;
        lastTop = top;
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [paceStart, paceWpm]);
  const renderLimit = Math.max(typed.length + 190, 420);
  return <div ref={promptRef} className="prompt" aria-label="Typing prompt">
    <div ref={linesRef} className="prompt-lines">
      <span ref={paceCaretRef} className="pace-caret" aria-hidden="true" hidden />
      <span ref={caretRef} className="caret" aria-hidden="true" />
      <textarea ref={inputRef} className="input-capture" autoFocus aria-label="Type the displayed words" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} />
      {words.filter((word) => word.start < renderLimit).map(({ start, text }) => {
        const caretAt = typed.length - start;
        return <Word key={start} text={text} start={start} typed={typed.slice(start, start + text.length)} caretAt={caretAt >= 0 && caretAt < text.length ? caretAt : -1} activeCharacterRef={activeCharacterRef} />;
      })}
    </div>
  </div>;
});

export default function App() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const startRef = useRef<number | null>(null);
  const typedRef = useRef("");
  const eventsRef = useRef<KeyEvent[]>([]);
  const lastInputRef = useRef<number | null>(null);
  const finalizedRef = useRef(false);
  const lastCodeRef = useRef("");
  const inputHandlersRef = useRef<{ keydown: (event: KeyboardEvent) => void; beforeinput: (event: InputEvent) => void; text: (text: string) => void; blur: (event: FocusEvent) => void }>(null!);
  const [settings, setSettings] = useState(loadSettings);
  const duration = settings.duration;
  const [seed, setSeed] = useState(() => Date.now());
  const [drillTarget, setDrillTarget] = useState<string>();
  const [typed, setTyped] = useState("");
  const [status, setStatus] = useState<Status>("ready");
  const [remaining, setRemaining] = useState<number>(duration);
  const [result, setResult] = useState<TestResult>();
  const [report, setReport] = useState<Report>();
  const [history, setHistory] = useState<TestResult[]>([]);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [page, setPage] = useState<Page>("test");
  const [selectedHistoryId, setSelectedHistoryId] = useState<string>();
  const [notice, setNotice] = useState("");
  const prompt = useMemo(() => createPrompt(seed, drillTarget), [seed, drillTarget]);

  const newTest = useCallback((target?: string, nextDuration = duration) => {
    startRef.current = null;
    typedRef.current = "";
    eventsRef.current = [];
    lastInputRef.current = null;
    finalizedRef.current = false;
    setSeed(Date.now());
    setDrillTarget(target);
    setTyped("");
    setResult(undefined);
    setReport(undefined);
    setStatus("ready");
    setRemaining(nextDuration);
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }, [duration]);

  const finish = useCallback(() => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    try { localStorage.removeItem(unfinishedKey); } catch { /* nothing parked */ }
    const events = eventsRef.current;
    const elapsed = Math.min(duration, (performance.now() - (startRef.current ?? performance.now())) / 1000);
    const completed = calculateResult({ duration, seed, prompt, typedText: typedRef.current, events, elapsed });
    const currentTrace = { id: completed.id, result: completed, events };
    setResult(completed);
    setReport(buildReport({ events, elapsed }, [currentTrace]));
    setStatus("finished");
    setRemaining(0);
    const keep = elapsed >= MIN_SAVED_SECONDS;
    if (!keep) setNotice(`Runs shorter than ${MIN_SAVED_SECONDS} s aren't saved.`);
    (keep ? saveTrace(completed, events) : Promise.resolve()).then(async () => {
      const traces = await getLocalTraces();
      setTraces(traces);
      setHistory(traces.map((trace) => trace.result));
      // Pool with saved history for per-key and per-transition tests.
      setReport(buildReport({ events, elapsed }, traces.some((trace) => trace.id === completed.id) ? traces : [currentTrace, ...traces]));
    }).catch(() => setNotice("Couldn't save this result in this browser."));
  }, [duration, prompt, seed]);

  useEffect(() => {
    if (status !== "running") return;
    const interval = window.setInterval(() => {
      const elapsed = performance.now() - (startRef.current ?? performance.now());
      const next = Math.max(0, duration - elapsed / 1000);
      setRemaining(next);
      if (next <= 0) finish();
    }, 50);
    return () => window.clearInterval(interval);
  }, [duration, finish, status]);

  useEffect(() => {
    const loadHistory = () => getLocalTraces().then((savedTraces) => { setTraces(savedTraces); setHistory(savedTraces.map((trace) => trace.result)); }).catch(() => setNotice("This browser is blocking local storage, so results won't be saved."));
    let parked: UnfinishedRun | undefined;
    try {
      parked = JSON.parse(localStorage.getItem(unfinishedKey) ?? "null") ?? undefined;
      localStorage.removeItem(unfinishedKey);
    } catch { /* storage blocked or corrupt */ }
    if (!parked || !Array.isArray(parked.events) || !parked.events.some((event) => event.kind === "input") || !(parked.elapsed >= MIN_SAVED_SECONDS)) { void loadHistory(); return; }
    const recovered = calculateResult(parked);
    saveTrace(recovered, parked.events)
      .then(() => setNotice(`Saved your unfinished run: ${recovered.netWpm} wpm over ${Math.round(recovered.timeline.length)}s.`))
      .catch(() => setNotice("Couldn't save your unfinished run in this browser."))
      .finally(loadHistory);
  }, []);

  useEffect(() => {
    // Refresh or close kills the page before an IndexedDB write can finish, so park the run synchronously
    // in localStorage; the next load scores and saves it.
    const park = () => {
      if (startRef.current === null || finalizedRef.current) return;
      const elapsed = Math.min(duration, (performance.now() - startRef.current) / 1000);
      if (elapsed < MIN_SAVED_SECONDS) return;
      try { localStorage.setItem(unfinishedKey, JSON.stringify({ duration, seed, prompt, typedText: typedRef.current, events: eventsRef.current, elapsed } satisfies UnfinishedRun)); }
      catch { /* storage blocked: the run is lost */ }
    };
    const onVisibilityChange = () => { if (document.visibilityState === "hidden") park(); };
    window.addEventListener("pagehide", park);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => { window.removeEventListener("pagehide", park); document.removeEventListener("visibilitychange", onVisibilityChange); };
  }, [duration, seed, prompt]);

  const recordInput = (key: string, code: string) => {
    if (status === "finished" || typedRef.current.length >= prompt.length) return;
    const now = performance.now();
    if (!startRef.current) {
      startRef.current = now;
      setStatus("running");
    }
    const index = typedRef.current.length;
    const expected = prompt[index] ?? "";
    const gap = lastInputRef.current === null ? undefined : now - lastInputRef.current;
    eventsRef.current.push({ kind: "input", time: now - (startRef.current ?? now), expected, actual: key, index, correct: key === expected, code, gap });
    typedRef.current += key;
    lastInputRef.current = now;
    setTyped(typedRef.current);
  };

  const skipWord = (code: string) => {
    const index = typedRef.current.length;
    const end = prompt.indexOf(" ", index);
    const wordEnd = end === -1 ? prompt.length : end;
    for (let skippedIndex = index; skippedIndex < wordEnd; skippedIndex += 1) {
      eventsRef.current.push({ kind: "skip", time: performance.now() - (startRef.current ?? performance.now()), expected: prompt[skippedIndex], actual: "", index: skippedIndex, correct: false, code });
      typedRef.current += "\0";
    }
    setTyped(typedRef.current);
    if (wordEnd < prompt.length) recordInput(" ", code);
  };

  const deleteBack = () => {
    if (!typedRef.current.length || status === "finished") return;
    const index = typedRef.current.length - 1;
    eventsRef.current.push({ kind: "backspace", time: performance.now() - (startRef.current ?? performance.now()), expected: prompt[index] ?? "", actual: typedRef.current[index], index, correct: true, code: lastCodeRef.current });
    typedRef.current = typedRef.current.slice(0, -1);
    setTyped(typedRef.current);
  };

  const typeText = (text: string) => {
    for (const character of text) {
      if (character !== " ") { recordInput(character.toLowerCase(), lastCodeRef.current); continue; }
      const action = spaceAction(prompt, typedRef.current.length);
      if (action === "space") recordInput(" ", lastCodeRef.current);
      else if (action === "skip") skipWord(lastCodeRef.current);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    lastCodeRef.current = event.code;
    if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
    if (event.key === "Tab") { event.preventDefault(); return; }
    if (event.key === "Escape" && status === "running") { event.preventDefault(); finish(); return; }
    if (event.key === "Enter" && status !== "running") { event.preventDefault(); newTest(); }
  };

  // Text arrives through beforeinput so IME, dead keys, and phone keyboards work like hardware keys.
  const onBeforeInput = (event: InputEvent) => {
    if (event.inputType === "insertCompositionText") return;
    event.preventDefault();
    if (status === "finished") return;
    if (event.inputType === "insertText") typeText(event.data ?? "");
    else if (event.inputType === "deleteContentBackward" || event.inputType === "deleteContentForward") deleteBack();
  };

  const onBlur = (event: FocusEvent) => {
    if (status === "finished" || event.relatedTarget instanceof HTMLSelectElement || event.relatedTarget instanceof HTMLInputElement) return;
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  };

  inputHandlersRef.current = { keydown: onKeyDown, beforeinput: onBeforeInput, text: typeText, blur: onBlur };
  const testVisible = !result;
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    // A leading space keeps Backspace firing even when nothing has been typed.
    const reset = () => { input.value = " "; input.setSelectionRange(1, 1); };
    const listeners: Record<string, (event: Event) => void> = {
      keydown: (event) => inputHandlersRef.current.keydown(event as KeyboardEvent),
      beforeinput: (event) => inputHandlersRef.current.beforeinput(event as InputEvent),
      compositionend: (event) => { inputHandlersRef.current.text((event as CompositionEvent).data); reset(); },
      input: (event) => { if (!(event as InputEvent).isComposing) reset(); },
      focus: reset,
      blur: (event) => inputHandlersRef.current.blur(event as FocusEvent),
    };
    for (const [type, listener] of Object.entries(listeners)) input.addEventListener(type, listener);
    reset();
    return () => { for (const [type, listener] of Object.entries(listeners)) input.removeEventListener(type, listener); };
  }, [testVisible]);

  const updateSettings = (change: Partial<Settings>) => {
    const next = { ...settings, ...change };
    setSettings(next);
    try { localStorage.setItem(settingsKey, JSON.stringify(next)); } catch { /* settings just won't persist */ }
  };
  const averageWpm = history.length ? Math.round(history.slice(0, 10).reduce((sum, item) => sum + item.netWpm, 0) / Math.min(10, history.length)) : 0;
  const paceWpm = settings.pace === "average" ? averageWpm : settings.pace === "custom" ? Math.min(250, Math.max(10, settings.paceWpm || 10)) : 0;

  const selectDuration = (value: TestDuration) => { updateSettings({ duration: value }); newTest(undefined, value); };
  const eraseLocal = async () => {
    if (!window.confirm("Delete all saved results on this device? This can't be undone.")) return;
    await clearTraces(); setTraces([]); setHistory([]); setSelectedHistoryId(undefined); setNotice("Local history cleared.");
  };

  return <main className={`${status === "running" ? "focus-mode" : ""} blink-${settings.blink}`} style={{ "--caret-ms": `${caretMs[settings.caretSpeed]}ms` } as CSSProperties}>
    <header className="topbar"><a className="brand" href="#top" onClick={(event) => { event.preventDefault(); setPage("test"); newTest(); }}>ape typer</a><nav><button className="nav-link" type="button" onClick={() => setPage("test")} aria-current={page === "test" ? "page" : undefined}>test</button><button className="nav-link" type="button" onClick={() => setPage("statistics")} aria-current={page === "statistics" ? "page" : undefined}>statistics</button></nav></header>
    <div className="shell" id="top">
      {page === "statistics" ? <Statistics history={history} traces={traces} selectedId={selectedHistoryId} onSelect={setSelectedHistoryId} /> : <>
      {!result ? <section className="test-surface" aria-label="Typing test" onClick={() => inputRef.current?.focus({ preventScroll: true })}>
        <div className="test-topline"><div className="modes" aria-label="Test duration">{durations.map((value) => <button className={duration === value ? "selected" : ""} key={value} onClick={() => selectDuration(value)}>{value}s</button>)}</div><div className="live"><span>{status === "running" ? remaining.toFixed(1) : `${duration}.0`}<small> sec</small></span><span>{typed.length ? Math.round((eventsRef.current.filter((entry) => entry.kind === "input" && entry.correct).length / 5) / Math.max(0.001, (duration - remaining) / 60)) : 0}<small> wpm</small></span></div></div>
        {drillTarget && <p className="drill-label">Focused drill · practicing “{drillTarget}” transitions</p>}
        <Prompt prompt={prompt} typed={typed} inputRef={inputRef} paceStart={status === "running" ? startRef.current : null} paceWpm={paceWpm} />
        <div className="test-footer"><span>{status === "ready" ? "Start typing when ready" : "Esc to finish early"}</span><span>{status === "ready" ? "space skips the rest of a word · delete goes back" : ""}</span></div>
      </section> : <section className="results" aria-live="polite">
        <div className="result-layout"><div className="score-stack"><div><span>wpm</span><strong>{result.netWpm}</strong></div><div><span>acc</span><strong>{result.accuracy}<small>%</small></strong></div></div><LineChart result={result} /></div>
        <div className="result-details"><div><span>test type</span><strong>time {result.duration}<small>s</small></strong><em>english</em></div><div><span>raw</span><strong>{result.rawWpm}</strong></div><div><span>characters</span><strong>{result.characters.correct}/{result.characters.incorrect}/{result.characters.extra}/{result.characters.missed}</strong></div><div><span>consistency</span><strong>{result.consistency}<small>%</small></strong></div><div><span>time</span><strong>{result.timeline.length}<small>s</small></strong></div></div>
        <section className="insights"><div className="section-heading"><div><p className="eyebrow">Statistical readout</p><h2>Findings</h2></div>{report && <span className="pill">{report.scope}</span>}</div>
          {report?.findings.length ? <div className="finding-list">{report.findings.map((finding) => <article className="finding" key={finding.title}><h3>{finding.title}</h3><p className="finding-evidence">{finding.evidence}</p><p>{finding.advice}</p></article>)}</div> : <div className="empty-insight"><strong>No statistically significant pattern yet.</strong><span>A finding appears only when its test reaches p &lt; 0.05 after Holm correction and meets its minimum sample size. Saved tests are pooled, so findings get sharper as you keep typing.</span></div>}
          {report && <ReportTables report={report} />}
        </section>
        <div className="result-actions"><button className="text-action" onClick={() => newTest()}>↻ retry</button><button className="text-action" onClick={() => newTest(report?.findings.find((finding) => finding.target)?.target ?? result.drillTarget)}>⌁ practice weak spot</button></div>
      </section>}
      {status !== "running" && <><section className="settings" aria-label="Settings"><div className="section-heading"><div><p className="eyebrow">Preferences</p><h2>Settings</h2></div></div>
        <div className="settings-grid">
          <label><span>caret motion</span><select value={settings.caretSpeed} onChange={(event) => updateSettings({ caretSpeed: event.target.value as Settings["caretSpeed"] })}><option value="off">off</option><option value="fast">fast</option><option value="medium">medium</option><option value="slow">slow</option></select></label>
          <label><span>caret blink</span><select value={settings.blink} onChange={(event) => updateSettings({ blink: event.target.value as Settings["blink"] })}><option value="smooth">smooth</option><option value="hard">hard</option></select></label>
          <label><span>pace caret</span><select value={settings.pace} onChange={(event) => updateSettings({ pace: event.target.value as Settings["pace"] })}><option value="off">off</option><option value="average">my average{averageWpm ? ` (${averageWpm} wpm)` : ""}</option><option value="custom">custom</option></select></label>
          {settings.pace === "custom" && <label><span>pace wpm</span><input type="number" min={10} max={250} value={settings.paceWpm} onChange={(event) => updateSettings({ paceWpm: Number(event.target.value) })} /></label>}
        </div>
      </section>
      <section className="progress" id="progress"><div className="section-heading"><div><p className="eyebrow">Recent local history</p><h2>Progress</h2></div><button className="quiet-button danger" onClick={eraseLocal}>Clear history</button></div>{history.length ? <div className="history-grid">{history.slice(0, 6).map((item) => <article key={item.id}><strong>{item.netWpm}<small> wpm</small></strong><span>{item.accuracy}% acc · {item.timeline.length < item.duration ? `${item.timeline.length}/${item.duration}` : item.duration}s</span><time>{new Date(item.createdAt).toLocaleDateString()}</time></article>)}</div> : <p className="muted">Complete a test to start your private local history.</p>}</section>
      <aside className="privacy"><strong>Privacy by default.</strong> Everything stays in this browser: no account, no server. Clearing site data or switching browsers starts a fresh history.</aside></>}
      </>}
      {notice && <div className="notice" role="status">{notice}</div>}
    </div>
  </main>;
}
