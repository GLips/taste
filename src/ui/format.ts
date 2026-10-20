/** Time and id formatting shared by every screen. Pure, so the browser can use it. */

const dateTime = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const dateOnly = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" });

export const formatReviewTime = (iso: string | undefined): string =>
  iso === undefined ? "" : dateTime.format(new Date(iso));

export const formatReviewDate = (iso: string | undefined): string =>
  iso === undefined ? "" : dateOnly.format(new Date(iso));

/** "3m ago" style, coarse on purpose: the screens poll every second and a ticking clock would jitter. */
export const formatTimeAgo = (iso: string | undefined, now = Date.now()): string => {
  if (iso === undefined) return "";
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 14 ? `${days}d ago` : formatReviewDate(iso);
};

/** `human:demo` reads as "you" to the owner; anything else is shown as written. */
export const describeAuthor = (author: string, owner: string | undefined): string =>
  author === owner ? "You" : author;
