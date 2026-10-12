# ape typer

Fast, quiet typing practice that turns your mistakes and timing into useful next steps.

ape typer keeps the test surface out of your way, then gives you a clear read on speed, accuracy, rhythm, and the patterns worth practicing. It is inspired by focused typing tests, with its own wording, visual design, and implementation.

## Start here

```bash
npm install
npm run dev
```

Open the local URL Vite prints. There are no accounts and no server: everything runs in the browser.

## What it does

- Choose a 15, 30, or 45 second test. Your choice is remembered in this browser.
- Start the timer with your first character. Focus mode leaves only the prompt and timer on screen.
- Every run of 7 seconds or more is saved: finishing, pressing `Esc`, refreshing, or closing the tab mid-run all keep it. An interrupted run is parked in `localStorage` and saved to history on the next load. Shorter runs are treated as restarts: they still show results but are not saved.
- Follow a caret that glides between characters while the text shifts smoothly at line changes.
- Use `Space` to skip the unfinished part of a started word, and `Backspace` or `Delete` to move back.
- Review WPM, accuracy, raw speed, consistency, pace, and evidence-backed practice suggestions.
- Start a focused drill from a recurring mistake or slow transition.

Typing input uses `beforeinput`, so hardware keyboards, IME input, dead keys, and phone keyboards share the same behavior.

## Privacy first

Results, keystroke traces, and settings stay in this browser (IndexedDB and `localStorage`); nothing is sent anywhere. Every result summary is kept; the newest 50 runs also keep their full keystroke trace for the statistical readout. History is per browser and per domain, so a deployed copy starts empty and clearing site data erases it.

The IndexedDB database remains named `typetrace` so existing local history survives the app rename.

## Deploy

It is a static Vite build: on Vercel, import the repo and keep the detected Vite preset (`npm run build`, output `dist`). No environment variables are needed.

## Development

```bash
npm run test
npm run build
```

| Path | Purpose |
| --- | --- |
| `src/App.tsx` | Test flow, keyboard input, focus mode, results, history, and settings. |
| `src/lib/words.ts` | Prompt generation, practice drills, and space behavior. |
| `src/lib/analysis.ts` | Metrics, pace data, and deterministic insights. |
| `src/lib/report.ts` | Local statistical readout and significance-tested findings. |
| `ANALYSIS.md` | How every score, statistic, and finding is computed, and which data each one uses. |
| `src/lib/storage.ts` | Device-only result and trace storage. |

## Contribution notes

- Keep the active typing surface visually quiet.
- Keep analysis deterministic and evidence-based; do not infer fingers or make AI claims.
- Do not copy Monkeytype code, assets, branding, or GPL-licensed word data.
- Add or update a focused test when changing scoring, skipping, backtracking, or analysis rules.
