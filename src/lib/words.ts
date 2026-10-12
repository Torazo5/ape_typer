export const WORDS = [
  "about", "above", "across", "after", "again", "air", "all", "almost", "also", "always", "among", "another", "answer", "any", "around", "ask", "away", "back", "because", "become", "before", "begin", "being", "below", "between", "book", "both", "bring", "build", "business", "call", "came", "care", "carry", "change", "children", "city", "close", "come", "common", "community", "company", "consider", "continue", "country", "course", "create", "day", "decide", "development", "different", "does", "during", "early", "earth", "each", "end", "enough", "even", "every", "example", "eye", "fact", "family", "far", "feel", "find", "first", "follow", "food", "form", "found", "four", "friend", "from", "full", "general", "get", "give", "good", "government", "great", "group", "grow", "had", "hand", "hard", "has", "have", "head", "help", "here", "high", "home", "house", "how", "idea", "important", "into", "its", "just", "keep", "kind", "know", "land", "large", "last", "late", "learn", "leave", "left", "letter", "life", "light", "like", "line", "little", "live", "long", "look", "made", "make", "man", "many", "may", "mean", "might", "more", "most", "move", "much", "must", "name", "need", "never", "new", "next", "night", "number", "often", "old", "once", "one", "only", "open", "order", "other", "our", "out", "over", "own", "page", "part", "people", "place", "plan", "plant", "play", "point", "possible", "power", "present", "problem", "program", "public", "put", "question", "quick", "quite", "read", "real", "really", "right", "river", "room", "run", "said", "same", "school", "science", "sea", "second", "see", "seem", "sentence", "set", "should", "show", "side", "since", "small", "social", "some", "something", "sound", "special", "state", "still", "story", "study", "such", "system", "take", "talk", "tell", "than", "that", "their", "them", "then", "there", "these", "thing", "think", "this", "those", "through", "time", "together", "too", "took", "tree", "try", "turn", "under", "until", "use", "very", "want", "water", "way", "well", "went", "were", "what", "when", "where", "which", "while", "will", "with", "word", "work", "world", "would", "write", "year", "you", "young"
];

function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createPrompt(seed: number, drillTarget?: string, wordCount = 180) {
  const random = rng(seed);
  const general = [...WORDS];
  const matching = drillTarget ? WORDS.filter((word) => word.includes(drillTarget)) : [];
  const output: string[] = [];
  let previous = "";

  while (output.length < wordCount) {
    const useTarget = matching.length > 0 && random() < 0.6;
    const pool = useTarget ? matching : general;
    const word = pool[Math.floor(random() * pool.length)];
    if (word !== previous) {
      output.push(word);
      previous = word;
    }
  }
  return output.join(" ");
}

/** What Space does at `index`: type the space, skip the rest of a started word, or nothing at a word start. */
export function spaceAction(prompt: string, index: number): "space" | "skip" | "ignore" {
  if (prompt[index] === " ") return "space";
  return index === 0 || prompt[index - 1] === " " ? "ignore" : "skip";
}
