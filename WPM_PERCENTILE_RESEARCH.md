# WPM percentile research

## Short answer

There is a credible, very large distribution of typing speeds, but there is **not** a defensible distribution for “people in the world.” Do not label a result “top *x*% in the world.” The strongest available reference is a 2018 peer-reviewed CHI study of **168,960 self-selected online volunteers**, not a probability sample of the global population.

The appropriate product claim, if we add this feature, is: **“about the 72nd percentile of this reference sample”** (only after calculating it from the source data). It needs a visible qualifier and a methodology note—not a universal/world claim.

## Best available reference

Dhakal, Feit, Kristensson, and Oulasvirta, “[Observations on Typing from 136 Million Keystrokes](https://doi.org/10.1145/3173574.3174220),” *CHI 2018*, is the most useful primary source found.

- It measured 136,857,600 keystrokes from 168,960 participants and released the [paper, data, and collection code](https://userinterfaces.aalto.fi/136Mkeystrokes/) for research use. The downloadable raw data are [linked by the authors](https://userinterfaces.aalto.fi/136Mkeystrokes/data/Keystrokes.zip); the site says their licence is research/non-commercial with attribution.
- Its WPM definition is compatible in form with Ape Typer’s: five characters count as a word; the score is characters/5 divided by elapsed minutes. The study scored each transcribed sentence from the first to last keypress. See [methods, pp. 3–4](https://userinterfaces.aalto.fi/136Mkeystrokes/resources/chi-18-analysis.pdf#page=4).
- The sample mean is **51.56 WPM** and SD is **20.2 WPM**. The paper’s distribution provides useful coarse anchors: the slowest decile is about **under 26 WPM** and the fastest decile about **over 78 WPM**. Speeds are *not normally distributed*: the authors report positive skewness (0.513), so a normal-CDF percentile made from only the mean and SD would be a model approximation, not the study’s empirical percentile. See [results, p. 4](https://userinterfaces.aalto.fi/136Mkeystrokes/resources/chi-18-analysis.pdf#page=5).
- The data really do contain a distribution, not just a mean: the paper publishes a WPM histogram/density figure, and the raw keystroke data plus metadata permit calculating an empirical CDF after applying the documented preprocessing. See [Figure 2 and results](https://userinterfaces.aalto.fi/136Mkeystrokes/resources/chi-18-analysis.pdf#page=5).

## Why it cannot support a “world percentile”

The paper directly cautions against generalising its results. Participants were self-selected from an online typing-test/training site; 68% were from the US, most were young and interested in typing, and more than 70% had taken a typing course. The task was 15 English sentence transcriptions, whereas Ape Typer uses short, time-limited English prompts (15/30/45 seconds) and net WPM. Keyboard/device, language, task length, correction rules, and recruitment all affect the comparison. See the authors’ [sampling/procedure description](https://userinterfaces.aalto.fi/136Mkeystrokes/resources/chi-18-analysis.pdf#page=3) and [limitations](https://userinterfaces.aalto.fi/136Mkeystrokes/resources/chi-18-analysis.pdf#page=10).

A second peer-reviewed study supports treating speed as a continuous distribution rather than as natural “slow/average/fast” groups, but it is not a world benchmark either: it studied students and reports a smaller high-performing group at 80 WPM (IQR 20) and a lower-performing group at 54 WPM (IQR 18). [Pinet et al., 2022](https://doi.org/10.1186/s41235-022-00424-3) explicitly notes that its WPM can be affected by task design and discusses the Dhakal sample as the more diverse source.

There is a newer, substantially more representative **U.S.** reference, but it cannot be used directly for Ape Typer’s standard WPM. Hernandez et al.’s [2026 Scientific Reports study](https://doi.org/10.1038/s41598-026-36500-7) used 10,613 adults from the Understanding America Study, a nationally representative U.S. probability panel. For computer users, the reported adjusted-WPM quartiles were 24.1 / 37.8 / 55.8. However, it uses only the “quick brown fox” sentence and *adjusted WPM* (speed × accuracy), not ordinary net WPM. The companion first-party [data description](https://www.nature.com/articles/s41597-026-07050-4.pdf#page=6) confirms the U.S. probability sampling and the task/metric. It is useful corroboration that a national benchmark is possible, not a calibration dataset for this app.

## Product recommendation

### Recommended now: no percentile

Show a non-percentile contextual line if desired:

> **Reference point:** the average in a 168,960-person online English typing study was 51.6 WPM.
>
> *That study’s volunteers were not a representative world sample; scores vary by test and device.*

This is honest but should be presented as context, not a ranking. Avoid inferring a percentile from `mean = 51.56` and `SD = 20.2`; the source says the distribution is non-normal.

### If a percentile is worth building

1. Make a **versioned reference distribution** from the published raw data, using the study’s per-participant WPM definition and documented exclusions. Store only a compact, reviewed empirical CDF/quantile table in the app—not the 16 GB raw dataset.
2. Confirm that the source-data licence permits the intended deployment. The author page describes the download as research/non-commercial, so using it to power a public product needs permission or a different openly licensed benchmark.
3. Match the comparison as closely as possible: English, physical keyboard, a completed test, and preferably a longer transcription-style session. Do not calculate a percentile for a partial/interrupted run or mix it with raw WPM.
4. State the comparison population and version in the UI and methodology, for example:

   > **Estimated 72nd percentile in a 2018 online English typing reference sample (n=168,960).**
   > *Not a worldwide ranking. Your short test and device may differ from the study’s task.*

5. Add a “How is this estimated?” card with source, WPM definition, data date/version, empirical-CDF method, and the above limitations. If a score lies outside the reference range, say “faster than the highest measured reference score” rather than inventing a percentile.

## Bottom line

The dataset supports a carefully labelled **reference-sample percentile**, provided we can legally use a derived distribution and accept the task mismatch. It does **not** support “x percentile in the world.” A first-party Ape Typer benchmark could eventually be stronger for this specific test, but it would require opt-in aggregate collection, a published sampling policy, and a clear “Ape Typer users” label—consistent with the app’s current privacy-first, device-only design only if that policy is deliberately changed.
