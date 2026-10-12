# ape typer

Fast, quiet typing practice that turns your mistakes and timing into useful next steps.

ape typer keeps the test surface out of your way, then gives you a clear read on speed, accuracy, rhythm, and the patterns worth practicing. It is inspired by focused typing tests, with its own wording, visual design, and implementation.

## Start here

```bash
npm install
npm run dev
```

Open the local URL Vite prints. The app works without any account or cloud configuration.

## What it does

- Choose a 15, 30, or 45 second test. Your choice is remembered in this browser.
- Start the timer with your first character. Focus mode leaves only the prompt and timer on screen.
- Follow a caret that glides between characters while the text shifts smoothly at line changes.
- Use `Space` to skip the unfinished part of a started word, and `Backspace` or `Delete` to move back.
- Review WPM, accuracy, raw speed, consistency, pace, and evidence-backed practice suggestions.
- Start a focused drill from a recurring mistake or slow transition.

Typing input uses `beforeinput`, so hardware keyboards, IME input, dead keys, and phone keyboards share the same behavior.

## Privacy first

Detailed keystroke traces stay in IndexedDB on the device. If Firebase is configured, only aggregate result summaries sync to Firestore; raw timings and the local statistical readout do not.

The IndexedDB database remains named `typetrace` so existing local history survives the app rename.

## Optional Firebase setup

Copy `.env.example` to `.env.local`, then fill in the `VITE_FIREBASE_*` values. Without them, ape typer stays fully playable in local-only mode.

The Firebase Function is a separate package:

```bash
npm --prefix functions install
npm --prefix functions run build
```

`firestore.rules` restricts result paths to their owner.

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
| `src/lib/storage.ts` | Device-only detailed-trace storage. |
| `src/lib/firebase.ts` | Optional auth and result-summary sync. |
| `functions/src/index.ts` | Anonymous-history merge function. |

## Contribution notes

- Keep the active typing surface visually quiet.
- Keep analysis deterministic and evidence-based; do not infer fingers or make AI claims.
- Do not copy Monkeytype code, assets, branding, or GPL-licensed word data.
- Add or update a focused test when changing scoring, skipping, backtracking, or analysis rules.
