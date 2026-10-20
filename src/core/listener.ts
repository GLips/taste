import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import { type CorruptRecordFile, InvalidRecordInput, StoreWriteFailed } from "./errors.ts";
import { compareIsoTimes, formatLocalIsoTime } from "./ids.ts";
import { loadStoreSnapshot, TasteStore } from "./store.ts";
import { indexDirOf, writeFileAtomicSync } from "./store-files.ts";

export const LISTEN_POLL_MS = 500;
export const LISTEN_HEARTBEAT_MS = 5_000;
/** The UI shows "agent listening" while a heartbeat is younger than this. */
export const LISTENER_ALIVE_MS = 15_000;

const ListenerCursorSchema = Schema.Struct({
  name: Schema.String,
  /** Entries from before the listener first started are history, not news. */
  started_at: Schema.String,
  /** Human entries already printed. Bounded by human thread activity since `started_at`. */
  seen: Schema.Array(Schema.String),
  heartbeat_at: Schema.optionalKey(Schema.String),
});
type ListenerCursor = typeof ListenerCursorSchema.Type;

/** One JSON line of `taste review listen` output. */
export interface ListenEvent {
  readonly belief: string;
  readonly statement: string;
  readonly note: string;
  readonly at: string;
  readonly reply: string;
}

export interface ListenerHeartbeat {
  readonly name: string;
  readonly heartbeatAt: string | undefined;
  readonly listening: boolean;
}

const listenersDirOf = (root: string) => join(indexDirOf(root), "listeners");

const validateListenerName = (name: string) =>
  /^[A-Za-z0-9._-]+$/.test(name)
    ? Effect.succeed(name)
    : Effect.fail(new InvalidRecordInput({ message: `listener name "${name}" may only use letters, digits, . _ -` }));

/** A cursor that is missing or unreadable starts over: `.index/` is disposable by design. */
const readCursor = (path: string): ListenerCursor | undefined => {
  if (!existsSync(path)) return undefined;
  try {
    return Schema.decodeUnknownSync(ListenerCursorSchema)(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return undefined;
  }
};

const cursorPathOf = (root: string, name: string) => join(listenersDirOf(root), `${name}.json`);

/**
 * Read-modify-write with no yield in between: the listen loop's poll and heartbeat fibers share
 * one cursor file, and an interleaving would drop the other's change.
 */
const updateCursor = (path: string, name: string, update: (cursor: ListenerCursor) => ListenerCursor) =>
  Effect.try({
    try: () => {
      const now = formatLocalIsoTime(new Date());
      writeFileAtomicSync(path, JSON.stringify(update(readCursor(path) ?? { name, started_at: now, seen: [] })));
    },
    catch: (error) => new StoreWriteFailed({ path, message: String(error) }),
  });

/**
 * One poll of `taste review listen --as <name>`: returns human thread entries not yet printed by
 * this listener and records them in its cursor, so a restarted listener never repeats one. The
 * first poll ever only creates the cursor.
 */
export const pollListenerEvents = (
  name: string,
): Effect.Effect<Array<ListenEvent>, InvalidRecordInput | CorruptRecordFile | StoreWriteFailed, TasteStore> =>
  Effect.gen(function* () {
    yield* validateListenerName(name);
    const store = yield* TasteStore;
    const path = cursorPathOf(store.root, name);
    const cursor = readCursor(path);
    if (cursor === undefined) {
      yield* updateCursor(path, name, (created) => ({ ...created, heartbeat_at: created.started_at }));
      return [];
    }
    const snapshot = yield* loadStoreSnapshot;
    const seen = new Set(cursor.seen);
    const fresh = snapshot.threadEntries
      .filter((entry) => entry.author.startsWith("human:") && !seen.has(entry.id))
      .filter((entry) => compareIsoTimes(entry.at, cursor.started_at) >= 0)
      .sort((left, right) => compareIsoTimes(left.at, right.at) || left.id.localeCompare(right.id));
    if (fresh.length === 0) return [];
    yield* updateCursor(path, name, (latest) => ({
      ...latest,
      seen: [...new Set([...latest.seen, ...fresh.map((entry) => entry.id)])],
    }));
    return fresh.map((entry) => {
      const belief = snapshot.byId.get(entry.thread)?.record;
      return {
        belief: entry.thread,
        statement: belief?.type === "Belief" ? belief.statement : "",
        note: entry.text,
        at: entry.at,
        reply: `taste thread reply ${entry.thread} --as ${name} "…"`,
      };
    });
  });

/** Called every 5s by the listen loop. Creates the cursor if the listener has not polled yet. */
export const writeListenerHeartbeat = (
  name: string,
): Effect.Effect<void, InvalidRecordInput | StoreWriteFailed, TasteStore> =>
  Effect.gen(function* () {
    yield* validateListenerName(name);
    const store = yield* TasteStore;
    yield* updateCursor(cursorPathOf(store.root, name), name, (cursor) => ({
      ...cursor,
      heartbeat_at: formatLocalIsoTime(new Date()),
    }));
  });

/** Every listener that has ever run against this store, with whether it is alive now. */
export const listListenerHeartbeats: Effect.Effect<Array<ListenerHeartbeat>, never, TasteStore> = Effect.gen(
  function* () {
    const store = yield* TasteStore;
    const directory = listenersDirOf(store.root);
    if (!existsSync(directory)) return [];
    const now = Date.now();
    return readdirSync(directory)
      .filter((file) => file.endsWith(".json"))
      .flatMap((file) => {
        const cursor = readCursor(join(directory, file));
        if (!cursor) return [];
        const heartbeatAt = cursor.heartbeat_at;
        const listening = heartbeatAt !== undefined && now - Date.parse(heartbeatAt) < LISTENER_ALIVE_MS;
        return [{ name: cursor.name, heartbeatAt, listening }];
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  },
);
