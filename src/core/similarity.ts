const STOPWORDS = new Set(
  (
    "a an and are as at be been but by can do does for from has have if in into is it its of on or " +
    "so than that the their then there these this those to was we were what when where which while " +
    "who will with would you your our us i me my should must always never just only also not no " +
    "use uses used using don doesn isn aren won t s ll re ve d m"
  ).split(" "),
);

// "not", "no", "never", "only" and "always" are stopwords on purpose: a repeat check should match
// "Use Tailwind everywhere" against "Never use Tailwind everywhere" so a human sees both.

/** Lowercase, strip punctuation, drop stopwords. Used by the repeat check and FTS queries. */
export const normaliseTokens = (text: string): Array<string> =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));

export const normaliseText = (text: string): string => normaliseTokens(text).join(" ");

export const tokenJaccard = (left: string, right: string): number => {
  const a = new Set(normaliseTokens(left));
  const b = new Set(normaliseTokens(right));
  if (a.size === 0 && b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared);
};

export const NEAR_REPEAT_THRESHOLD = 0.75;
export const RELATED_THRESHOLD = 0.35;
export const RELATED_FTS_TOP = 3;
