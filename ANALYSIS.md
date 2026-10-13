# How ape typer analyzes typing

Everything below runs in the browser, is deterministic (same input → same output), and never infers fingers or hands. Code: `src/lib/analysis.ts` (scores stored with each result) and `src/lib/report.ts` (the statistical readout on the results page).

## Where the data comes from

| Scope | What it contains | Used for |
| --- | --- | --- |
| **This run** | Every keystroke, backspace, and skip with a millisecond timestamp | Headline scores, chart, Speed / Accuracy / Rhythm tables, word-start and post-error findings |
| **Last 50 saved runs** (including this one) | Full keystroke traces | Mix-up findings, per-key error findings, slow-transition findings, "most error-prone key", "most common mix-up", "slowest transition" |
| **All saved runs** | Result summaries only (WPM, accuracy, chart, …) | Speed trend, Progress list |
| **Last 10 saved runs** | Net WPM | The pace caret's "my average" |

Runs shorter than 7 seconds are treated as restarts and are not saved, but they still get a full readout (pooled with saved history). Runs interrupted by refresh or closing the tab are saved if they reached 7 seconds.

At a glance, **roughly two-thirds of the readout comes from this run alone**: all headline scores, the Speed, Accuracy, and Rhythm tables, and two of the four finding types. **Pooled history drives the History table and the per-key and per-transition findings**, which are usually the most actionable ones, because a single 30-second run (about 150–250 keystrokes) is too small to test individual keys or letter pairs.

## Where it shows up

- **Results page** (after a run): every finding, each tagged *this run* or *your history*, plus all four tables.
- **Statistics page**: *Across your history* shows the history-based findings and the History table once, computed from the pooled traces. Selecting a past run shows that run's chart, its Speed / Accuracy / Rhythm tables, and its run-based findings (word-start, post-error). Runs older than the newest 50 show their summary only.

## Definitions used throughout

- **Gap**: time between an event and the event right before it (any kind, including backspace). Measuring this way means backspacing never inflates a key's timing.
- **Flow interval**: a gap where both the key and the key before it were typed correctly, and the gap is between 0 and 3000 ms (longer gaps are treated as away-from-keyboard). This is the cleanest sample of your rhythm.
- **Active time**: seconds from the first keystroke to the end of the run (capped at the test length, floor of 1 s). Ending early does not dilute WPM.

## Headline scores (this run)

| Score | Formula |
| --- | --- |
| Net WPM | correct characters in the final text ÷ 5 ÷ active minutes |
| Raw WPM | all typed characters (including later-deleted ones) ÷ 5 ÷ active minutes |
| Accuracy | correct keystrokes ÷ typed keystrokes (skips and backspaces excluded) |
| Chart | per second: correct chars × 12 (WPM), all chars × 12 (raw), per-second accuracy |
| Consistency | 100 − coefficient of variation of the per-second WPM |
| Characters | correct / incorrect / extra / missed, all counted from the final text |

## Statistical readout

### Speed (this run, needs ≥ 30 flow intervals)

- **Median-pace WPM** = 12000 ÷ median flow interval: your speed if every key took your typical time.
- **Burst WPM** = 12000 ÷ 10th-percentile flow interval: your fastest stretches.
- **Hesitation cost**: flow intervals above median + 3 × (1.4826 × MAD) count as hesitations; their excess over the median is summed into seconds lost, and WPM is recomputed without them.
- **Pace drift**: least-squares slope of flow interval vs time, with a 95% CI (t-distribution via a Cornish–Fisher approximation). "Slowing down" or "speeding up" only if the CI excludes 0.

### Accuracy (this run)

- **Keystroke error rate** with a 95% Wilson score interval.
- **Total / corrected / uncorrected error rates** (Soukoreff & MacKenzie, 2003): the run is replayed with backspaces popping characters, so every wrong keystroke is classed as fixed or left in.
- **KSPC**: (keystrokes + backspaces) ÷ final characters; 1.000 means no wasted keys.
- **Errors corrected**: fixed ÷ total wrong, median time from a wrong key to the backspace that follows it, and correct characters deleted along the way.
- **Missed letters**: letters skipped with space that are still skipped at the end.

### Rhythm (this run)

- **Inter-key interval**: median, IQR, and p90 of flow intervals (needs ≥ 30).
- **Rhythm variability**: robust coefficient of variation, 1.4826 × MAD ÷ median.
- **Word-start cost**: first letter of a word vs letters inside words (needs ≥ 8 of each).
- **Post-error slowing**: the key typed right after an uncorrected wrong key vs flow intervals (needs ≥ 8).

### History (pooled)

- **Pooled sample**: runs and keystrokes in the last 50 saved traces.
- **Most error-prone key**: highest error rate among keys with ≥ 20 attempts.
- **Most common mix-up**: the most frequent "typed X instead of Y" pair, with how many attempts at Y it came from.
- **Slowest transition**: letter pair with the highest median *relative* interval (≥ 8 samples). Each run's intervals are divided by that run's median flow interval, so fast and slow sessions are comparable.
- **Speed trend**: least-squares slope of net WPM across all saved runs in order, with a 95% CI (needs ≥ 5 runs).

## Findings (hypothesis tests)

A finding is shown only if its test passes **p < 0.05 after Holm–Bonferroni correction across every test run for that result**, and its minimum sample size is met. At most 6 are shown, strongest first.

| Finding | Data | Test | Minimum evidence |
| --- | --- | --- | --- |
| Mix-up: you type X for Y | Last 50 runs | Exact one-sided binomial test of how often attempts at Y came out as X, against how often X shows up as a wrong key anywhere else (add-one smoothed) | 3 occurrences of the pair and 20 attempts at Y |
| A key fails more often than others | Last 50 runs | Exact one-sided binomial test of that key's errors against the error rate on all other keys | 20 attempts on the key, and a rate above baseline |
| Slow transition between two letters | Last 50 runs | One-sided Mann–Whitney U of that pair's relative intervals vs all relative intervals | 8 samples, and median ≥ 1.15× (smaller effects are ignored even if significant) |
| Hesitating at the start of each word | This run | One-sided Mann–Whitney U, word starts vs in-word intervals | 8 of each |
| Errors breaking your rhythm | This run | One-sided Mann–Whitney U, post-error intervals vs flow intervals | 8 post-error keys, 30 flow intervals |

When a mix-up and the general error-rate finding are both significant for the same key, only the mix-up is shown, since it is the more specific explanation.

Each finding reports its counts, effect size (rate with a Wilson CI, or P(slower) as the common-language effect size), and the Holm-adjusted p-value. "Practice weak spot" drills the first finding that names a key or letter pair, falling back to the stored insight below.

## Stored insights (`analyze`, this run)

A lighter rule set saved with every result (used as the drill fallback; not shown on the results page):

- Most frequent mix-up in this run, if it happened ≥ 3 times (the pooled mix-up finding above is what the results page shows).
- Slowest letter pair with ≥ 5 samples and a median ≥ max(180 ms, 1.4 × your median).
- Correction rate, if you pressed backspace ≥ 3 times.
- Post-error slowing, if ≥ 3 cases and the median is ≥ 1.4 × your median.

## Known limits

- One 30-second run rarely has enough keystrokes for per-key tests; those findings appear after a few saved runs.
- Pooling assumes your habits are stable across the last 50 runs; old habits you have fixed still count until they age out.
- Statistical tests use normal approximations where noted (Mann–Whitney); the binomial test is exact.
- History is per browser and per site; clearing site data resets it.
