/**
 * Lightweight, language-agnostic-ish chat signals. Deliberately simple and transparent:
 * a small DE/EN word list plus emoji. Good enough for trends, not for single messages.
 */
const POSITIVE = new Set([
  "geil", "gut", "stark", "nice", "top", "mega", "beste", "bester", "love", "liebe", "haha", "lol", "lmao",
  "respekt", "krass", "goat", "w", "based", "sympathisch", "recht", "richtig", "ehrenmann", "ehrenfrau", "danke",
]);
const NEGATIVE = new Set([
  "cringe", "schlecht", "fake", "peinlich", "scam", "hate", "müll", "trash", "lügner", "lüge", "langweilig",
  "dislike", "unfair", "falsch", "lächerlich", "l", "ratio", "toxic", "toxisch", "betrug", "clown",
]);
const POS_EMOJI = ["❤", "🔥", "😂", "👏", "💯", "😍", "🥰", "🙌", "👍"];
const NEG_EMOJI = ["👎", "🤡", "💩", "🤮", "😡", "🙄"];

export type Sentiment = 1 | 0 | -1;

export function sentiment(text: string): Sentiment {
  const words = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  let pos = POS_EMOJI.some((e) => text.includes(e)) ? 1 : 0;
  let neg = NEG_EMOJI.some((e) => text.includes(e)) ? 1 : 0;
  for (const w of words) {
    if (POSITIVE.has(w)) pos++;
    if (NEGATIVE.has(w)) neg++;
  }
  return pos > neg ? 1 : neg > pos ? -1 : 0;
}

/** Lower-cased @handles mentioned in a text. */
export function mentions(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/@([\w.]{2,24})/g)) out.add(m[1].replace(/\.+$/, "").toLowerCase());
  return [...out];
}

export const minuteOf = (d: Date) => new Date(Math.floor(d.getTime() / 60_000) * 60_000);
