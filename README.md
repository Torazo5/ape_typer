# ape typer

A minimal, keyboard-first typing test that turns repeat mistakes and timing into evidence-based practice targets. It is inspired by the focused typing-test genre, but has its own implementation, wording, and visual design.

## Run it

```bash
npm install
npm run dev
```

```bash
npm run test
npm run build
```

The app is a Vite + React + TypeScript project. The Firebase Cloud Function is a separate package:

```bash
npm --prefix functions install
npm --prefix functions run build
```

## Product behavior

- Timed random-word tests: 15, 30, or 45 seconds.
- The first typed character starts the timer.
- Once typing begins, focus mode hides all UI except the prompt and timer.
- A caret glides to the active character; it stays solid while typing and blinks when idle. Line changes slide the text up in a fixed 125ms.
- `Space` on a started but incomplete word marks the remaining letters as **missed** and advances to the next word. `Space` before typing any letter of a word does nothing, so a double space never skips a word. Missed letters remain muted gray with a bright underline; wrong typed letters are red.
- `Backspace` and `Delete` move backward through typed and skipped characters.
- Text is read from `beforeinput`, so IME, dead keys, and phone keyboards behave like hardware keys. The hidden input sits at the caret.
- Settings (stored per browser): caret motion speed, smooth or hard blink, and an optional pace caret at your recent average or a custom WPM.
- Results prioritize WPM, accuracy, a pace graph, raw WPM, character counts, and consistency. WPM is measured over the time actually typed, so ending early with `Esc` does not dilute it.
- A statistical readout follows: speed (median-pace and burst WPM, hesitation cost, pace drift with a 95% CI), accuracy (Wilson CI, Soukoreff & MacKenzie corrected/uncorrected error rates, KSPC), rhythm (inter-key interval spread, word-start cost, post-error slowing), and history (pooled per-key and per-transition stats, speed trend).
- Findings are hypothesis tests (exact binomial for per-key error rates, Mann–Whitney U for latencies) shown only when p < 0.05 after Holm correction and each test's minimum sample size is met. Per-key and per-transition tests pool this device's saved traces; transition latency is normalized to each test's median so faster and slower sessions are comparable.
- “Practice weak spot” creates a new test weighted toward the strongest evidence-backed pattern.

## Project map

| Path | Responsibility |
| --- | --- |
| `src/App.tsx` | Test state, keyboard input, focus mode, results UI, and history UI. |
| `src/lib/words.ts` | Seeded no-immediate-repeat word generation, focused-drill prompts, and the `Space` rule. |
| `src/lib/analysis.ts` | Metrics, per-second chart data, and the rule-based insights stored with each result. |
| `src/lib/report.ts` | Statistical readout and significance-tested findings, computed on the results page and never synced. |
| `src/lib/storage.ts` | Device-only IndexedDB retention for the 50 newest detailed traces. |
| `src/lib/firebase.ts` | Optional anonymous/Google auth and cloud result-summary sync. |
| `functions/src/index.ts` | Callable Firebase function that safely merges anonymous history into an existing Google account. |
| `src/lib/analysis.test.ts` | Unit coverage for metrics, evidence thresholds, and skipped-letter scoring. |
| `src/lib/report.test.ts` | Unit coverage for the statistical helpers, evidence thresholds, and error-rate metrics. |
| `src/lib/words.test.ts` | Unit coverage for when `Space` types, skips, or is ignored. |

## Data and Firebase

- Raw keystroke timing stays in IndexedDB on the device; only aggregate result summaries are sent to Firestore. The statistical readout is recomputed locally and is not part of the synced summary.
- Configure Firebase by copying `.env.example` to `.env.local` and filling the `VITE_FIREBASE_*` values.
- Without those variables, the app remains fully playable in local-only mode.
- `firestore.rules` isolates each user's result path by Firebase UID.
- The IndexedDB database is intentionally still named `typetrace` to preserve existing local history after the app was renamed to ape typer.

## Change guidelines

- Keep the active test surface visually quiet: no panels around the prompt and no distracting stats after the run starts.
- Do not copy Monkeytype code, assets, branding, or GPL-licensed word data.
- Keep analysis deterministic and evidence-based; never infer fingers, make AI claims, or show patterns below their minimum evidence threshold.
- Add or update a small test whenever changing scoring, skip/backtrack behavior, or analysis rules.
# ape_typer
