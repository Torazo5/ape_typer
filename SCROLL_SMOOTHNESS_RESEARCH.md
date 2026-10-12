# Typing-surface smoothness research

## Finding

Monkeytype's perceived motion comes from two independent animations, not motion blur:

- A separate, absolutely positioned caret is eased to each active character's measured position. At upstream commit `5810901`, Monkeytype uses a 100 ms medium animation (with 85 ms fast and 150 ms slow options), scheduled through `requestAnimationFrame`.
- Its optional `smoothLineScroll` animates a line crossing for 125 ms and moves the words and caret together. It is off by default.

Sources: [caret positioning and timing](https://github.com/monkeytypegame/monkeytype/blob/581090186fcc1494d6d6cea2b41dccf6e6707255/frontend/src/ts/elements/caret.ts#L243-L277), [rAF scheduling](https://github.com/monkeytypegame/monkeytype/blob/581090186fcc1494d6d6cea2b41dccf6e6707255/frontend/src/ts/elements/caret.ts#L291-L391), [line transition](https://github.com/monkeytypegame/monkeytype/blob/581090186fcc1494d6d6cea2b41dccf6e6707255/frontend/src/ts/test/test-ui.ts#L1203-L1231), and [the default setting](https://github.com/monkeytypegame/monkeytype/blob/581090186fcc1494d6d6cea2b41dccf6e6707255/frontend/src/ts/constants/default-config.ts#L56-L65).

## Current app difference

`src/App.tsx` renders the caret as the left border of the active character span and calls `scrollIntoView({ block: "center", behavior: "smooth" })` after every typed-length change. `src/styles.css` also sets `scroll-behavior: smooth` on the prompt. That means a new browser-controlled scrolling operation is requested per key, rather than moving one persistent typing surface only when a line is crossed. MDN notes that a later programmatic scroll can interrupt an active one, and its precise smooth timing/easing is user-agent defined: [scrollIntoView](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView) and [scroll-behavior](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/scroll-behavior#values).

## Smallest future direction

Keep typing and scoring as-is. Replace only the presentation mechanism with an original overlay caret eased for roughly 100 ms, and move the prompt once per line boundary with caret and words synchronized. Preserve `prefers-reduced-motion` behavior. This is an implementation proposal, not a request to copy Monkeytype code or visual design.
