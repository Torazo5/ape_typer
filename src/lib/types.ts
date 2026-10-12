export type TestDuration = 15 | 30 | 45;

export type KeyEvent = {
  kind: "input" | "backspace" | "skip";
  time: number;
  expected: string;
  actual: string;
  index: number;
  correct: boolean;
  code: string;
  gap?: number;
};

export type Point = { second: number; wpm: number; rawWpm: number; accuracy: number };

export type Insight = {
  kind: "mistake" | "timing" | "correction" | "pace";
  title: string;
  detail: string;
  target?: string;
  evidence: number;
};

export type TestResult = {
  id: string;
  createdAt: string;
  duration: TestDuration;
  seed: number;
  prompt: string;
  netWpm: number;
  rawWpm: number;
  accuracy: number;
  consistency: number;
  characters: { correct: number; incorrect: number; extra: number; missed: number };
  corrections: number;
  timeline: Point[];
  insights: Insight[];
  drillTarget?: string;
};
