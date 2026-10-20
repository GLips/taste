/**
 * UUIDv7 with a random `rand_a`. Not `Bun.randomUUIDv7()`: that fills `rand_a` with a sub-ms counter
 * (`7000…`), which would leave short ids almost no randomness.
 */
export const newRecordId = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let ms = Date.now();
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  bytes[6] = 0x70 | (bytes[6]! & 0x0f);
  bytes[8] = 0x80 | (bytes[8]! & 0x3f);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const pad = (value: number, width = 2) => String(value).padStart(width, "0");

/** Local time, ISO 8601 with milliseconds and an explicit offset (never a bare `Z`). */
export const formatLocalIsoTime = (date: Date): string => {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}` +
    `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
  );
};

/** Orders ISO times across offsets; string comparison would not. */
export const compareIsoTimes = (left: string, right: string): number => Date.parse(left) - Date.parse(right);

export const slugify = (text: string, maxWords = 6): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, maxWords)
    .join("-")
    .slice(0, 48)
    .replace(/-+$/, "");
