import type { Database } from "bun:sqlite";
import { statSync } from "node:fs";
import { join } from "node:path";
import { Context, Effect, Layer, Schema } from "effect";
import {
  AmbiguousRecordRef,
  type CorruptRecordFile,
  InvalidRecordInput,
  type StoreNotInitialised,
  type StoreWriteFailed,
  UnknownRecordRef,
} from "./errors.ts";
import { renderRecordFile } from "./frontmatter.ts";
import {
  deleteIndexDatabase,
  indexDatabasePath,
  type IndexedRecord,
  type IndexRefreshResult,
  loadIndexedRecords,
  loadIndexedShortIds,
  openIndexDatabase,
  refreshIndex,
  type SearchHit,
  searchIndex,
} from "./index-db.ts";
import type {
  BeliefRecord,
  DecisionRecord,
  MemoryRecord,
  RecordType,
  TasteRecord,
  ThreadEntryRecord,
} from "./records.ts";
import { TasteRecordSchema } from "./records.ts";
import { type BeliefState, deriveBeliefStates } from "./status.ts";
import { readStoreConfig, recordRelativePath, type StoreConfig, uniqueShortId, writeFileExclusive } from "./store-files.ts";

interface IndexHandle {
  current: Database;
  /** Inode of the file `current` was opened on; a different or missing one means `.index/` was deleted under us. */
  inode: number;
}

const openIndexHandle = (root: string): IndexHandle => {
  const current = openIndexDatabase(root);
  return { current, inode: statSync(indexDatabasePath(root)).ino };
};

export interface StoreSnapshot {
  readonly records: ReadonlyArray<IndexedRecord>;
  readonly byId: ReadonlyMap<string, IndexedRecord>;
  readonly memories: ReadonlyArray<MemoryRecord>;
  readonly beliefs: ReadonlyArray<BeliefRecord>;
  readonly decisions: ReadonlyArray<DecisionRecord>;
  readonly threadEntries: ReadonlyArray<ThreadEntryRecord>;
  readonly beliefStates: ReadonlyMap<string, BeliefState>;
}

const buildStoreSnapshot = (records: ReadonlyArray<IndexedRecord>): StoreSnapshot => {
  const ofType = <T extends TasteRecord>(type: RecordType) =>
    records.filter((entry) => entry.record.type === type).map((entry) => entry.record as T);
  const beliefs = ofType<BeliefRecord>("Belief");
  const decisions = ofType<DecisionRecord>("Decision");
  return {
    records,
    byId: new Map(records.map((entry) => [entry.record.id, entry])),
    memories: ofType<MemoryRecord>("Memory"),
    beliefs,
    decisions,
    threadEntries: ofType<ThreadEntryRecord>("ThreadEntry"),
    beliefStates: deriveBeliefStates(beliefs, decisions),
  };
};

const validateRecord = Schema.decodeUnknownEffect(TasteRecordSchema);

/**
 * One open store. The index connection is private: every method brings it in line with the record
 * files first, so callers never see a stale or deleted index.
 */
export class TasteStore extends Context.Service<
  TasteStore,
  {
    readonly root: string;
    readonly config: StoreConfig;
    /** Every record, with belief statuses derived. Every read path starts here. */
    readonly snapshot: Effect.Effect<StoreSnapshot, CorruptRecordFile>;
    /** Full-text hits over belief statements and reasoning and memory quotes, best first. */
    readonly search: (
      text: string,
      types: ReadonlyArray<"Belief" | "Memory">,
    ) => Effect.Effect<Array<SearchHit>, CorruptRecordFile>;
    /** Validates with Schema, writes the file with exclusive create, then refreshes the index. */
    readonly write: <R extends TasteRecord>(
      record: R,
    ) => Effect.Effect<IndexedRecord & { readonly record: R }, InvalidRecordInput | StoreWriteFailed | CorruptRecordFile>;
    /** `taste reindex`: deletes the sqlite files and rebuilds from the record files. */
    readonly rebuild: Effect.Effect<IndexRefreshResult, CorruptRecordFile>;
  }
>()("taste/TasteStore") {}

/** Opens the store at `root` (already resolved, see `resolveStoreRoot`). Closes the index when the scope ends. */
export const makeTasteStoreLayer = (root: string): Layer.Layer<TasteStore, StoreNotInitialised | InvalidRecordInput> =>
  Layer.effect(
    TasteStore,
    Effect.gen(function* () {
      const config = yield* readStoreConfig(root);
      const index = yield* Effect.acquireRelease(
        Effect.sync(() => openIndexHandle(root)),
        (handle) => Effect.sync(() => handle.current.close()),
      );

      // A long-lived process (`taste review listen`) keeps one connection. If someone deletes `.index/`,
      // that connection points at an unlinked file and SQLite fails with "disk I/O error", so reopen first.
      const reopenIfReplaced = () => {
        const inode = statSync(indexDatabasePath(root), { throwIfNoEntry: false })?.ino;
        if (inode === index.inode) return;
        index.current.close();
        Object.assign(index, openIndexHandle(root));
      };
      const freshIndex = Effect.suspend(() => {
        reopenIfReplaced();
        return refreshIndex(index.current, root).pipe(Effect.as(index.current));
      });

      return {
        root,
        config,
        snapshot: Effect.map(freshIndex, (db) => buildStoreSnapshot(loadIndexedRecords(db))),
        search: (text, types) => Effect.map(freshIndex, (db) => searchIndex(db, text, types)),
        write: (record) =>
          Effect.gen(function* () {
            yield* validateRecord(record).pipe(Effect.mapError((error) => new InvalidRecordInput({ message: error.message })));
            const shortId = uniqueShortId(record.id, loadIndexedShortIds(yield* freshIndex));
            const path = recordRelativePath(record, shortId);
            yield* writeFileExclusive(join(root, path), renderRecordFile(record));
            yield* freshIndex;
            return { record, path, shortId };
          }),
        rebuild: Effect.suspend(() => {
          index.current.close();
          deleteIndexDatabase(root);
          Object.assign(index, openIndexHandle(root));
          return refreshIndex(index.current, root);
        }),
      };
    }),
  );

/** Shorthand for `store.snapshot`. */
export const loadStoreSnapshot: Effect.Effect<StoreSnapshot, CorruptRecordFile, TasteStore> = TasteStore.use(
  (store) => store.snapshot,
);

const candidatesForRef = (snapshot: StoreSnapshot, ref: string): Array<IndexedRecord> => {
  const trimmed = ref.trim();
  const exact = snapshot.byId.get(trimmed);
  if (exact) return [exact];
  if (trimmed.length < 4) return [];
  return snapshot.records.filter((entry) => entry.shortId === trimmed || entry.record.id.startsWith(trimmed));
};

const pickOne = (
  ref: string,
  expected: string,
  candidates: ReadonlyArray<IndexedRecord>,
): Effect.Effect<IndexedRecord, UnknownRecordRef | AmbiguousRecordRef> => {
  const [first, ...rest] = candidates;
  if (!first) return Effect.fail(new UnknownRecordRef({ ref, expected }));
  if (rest.length > 0) {
    return Effect.fail(new AmbiguousRecordRef({ ref, candidates: candidates.map((entry) => entry.record.id) }));
  }
  return Effect.succeed(first);
};

/**
 * Accepts a full id, the short id from a file name, or a unique id prefix. `expected` narrows
 * the kind, so `taste thread reply <memory-id>` fails as an unknown belief.
 */
export const resolveRecordRef = <T extends RecordType>(
  snapshot: StoreSnapshot,
  ref: string,
  expected: T,
): Effect.Effect<Extract<TasteRecord, { type: T }>, UnknownRecordRef | AmbiguousRecordRef> =>
  pickOne(
    ref,
    expected,
    candidatesForRef(snapshot, ref).filter((entry) => entry.record.type === expected),
  ).pipe(Effect.map((entry) => entry.record as Extract<TasteRecord, { type: T }>));

export const resolveAnyRecordRef = (
  snapshot: StoreSnapshot,
  ref: string,
): Effect.Effect<IndexedRecord, UnknownRecordRef | AmbiguousRecordRef> =>
  pickOne(ref, "record", candidatesForRef(snapshot, ref));

/** `taste reindex`. */
export const rebuildStoreIndex: Effect.Effect<IndexRefreshResult, CorruptRecordFile, TasteStore> = TasteStore.use(
  (store) => store.rebuild,
);
