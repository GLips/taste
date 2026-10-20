import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Effect } from "effect";
import type { CorruptRecordFile } from "./errors.ts";
import { parseRecordFile } from "./frontmatter.ts";
import type { RecordType, TasteRecord } from "./records.ts";
import { normaliseTokens } from "./similarity.ts";
import { indexDirOf, listRecordFiles, shortIdFromPath, type StoreFileStat } from "./store-files.ts";

export const indexDatabasePath = (root: string) => join(indexDirOf(root), "taste.sqlite");

export interface IndexedRecord {
  readonly record: TasteRecord;
  /** Relative to the store root. */
  readonly path: string;
  readonly shortId: string;
}

const createTables = (db: Database) => {
  db.run("create table if not exists files (path text primary key, mtime real not null, id text not null)");
  // Status and reverse links are computed in TypeScript from every row, so records need no lookup columns.
  db.run(
    "create table if not exists records (id text primary key, type text not null, path text not null, short_id text not null, json text not null)",
  );
  db.run(
    "create virtual table if not exists search using fts5 (id unindexed, type unindexed, text, tokenize = 'porter unicode61')",
  );
};

/**
 * Opens (creating if needed) `.index/taste.sqlite`. WAL plus a busy timeout because the CLI,
 * the review server and listeners all refresh the same index concurrently.
 */
export const openIndexDatabase = (root: string): Database => {
  mkdirSync(indexDirOf(root), { recursive: true });
  const db = new Database(indexDatabasePath(root), { create: true });
  db.run("pragma busy_timeout = 5000");
  db.run("pragma journal_mode = wal");
  createTables(db);
  return db;
};

/** Deletes the database files outright; `openIndexDatabase` recreates them. Leaves listener cursors alone. */
export const deleteIndexDatabase = (root: string) => {
  for (const suffix of ["", "-wal", "-shm"]) {
    const path = `${indexDatabasePath(root)}${suffix}`;
    if (existsSync(path)) rmSync(path);
  }
};

const searchTextOf = (record: TasteRecord): string | undefined => {
  if (record.type === "Belief") return `${record.statement}\n${record.reasoning}`;
  if (record.type === "Memory") return record.quote;
  return undefined;
};

const parseFiles = (root: string, files: ReadonlyArray<StoreFileStat>) =>
  Effect.forEach(files, (file) =>
    parseRecordFile(file.path, readFileSync(join(root, file.path), "utf8")).pipe(
      Effect.map((record) => ({ file, record })),
    ),
  );

const insertRecords = (db: Database, parsed: ReadonlyArray<{ file: StoreFileStat; record: TasteRecord }>) => {
  const insertFile = db.prepare("insert or replace into files (path, mtime, id) values (?, ?, ?)");
  const insertRecord = db.prepare(
    "insert or replace into records (id, type, path, short_id, json) values (?, ?, ?, ?, ?)",
  );
  const clearSearch = db.prepare("delete from search where id = ?");
  const insertSearch = db.prepare("insert into search (id, type, text) values (?, ?, ?)");
  for (const { file, record } of parsed) {
    insertFile.run(file.path, file.mtimeMs, record.id);
    insertRecord.run(record.id, record.type, file.path, shortIdFromPath(file.path), JSON.stringify(record));
    const text = searchTextOf(record);
    if (text !== undefined) {
      clearSearch.run(record.id);
      insertSearch.run(record.id, record.type, text);
    }
  }
};

export interface IndexRefreshResult {
  readonly mode: "fresh" | "incremental" | "full";
  readonly recordCount: number;
}

/**
 * Brings the index in line with the files. Stale means any file's mtime or the file count differs
 * from what was recorded. Files are append-only, so new files are added incrementally; anything
 * else (a removed or touched file) triggers a full rebuild.
 */
export const refreshIndex = (db: Database, root: string): Effect.Effect<IndexRefreshResult, CorruptRecordFile> =>
  Effect.gen(function* () {
    const current = listRecordFiles(root);
    const indexed = new Map(
      db
        .query<{ path: string; mtime: number }, []>("select path, mtime from files")
        .all()
        .map((row) => [row.path, row.mtime]),
    );
    const currentPaths = new Set(current.map((file) => file.path));
    const needsFull =
      [...indexed.keys()].some((path) => !currentPaths.has(path)) ||
      current.some((file) => indexed.has(file.path) && indexed.get(file.path) !== file.mtimeMs);

    if (needsFull) {
      const parsed = yield* parseFiles(root, current);
      db.transaction(() => {
        for (const table of ["files", "records", "search"]) db.run(`delete from ${table}`);
        insertRecords(db, parsed);
      }).immediate();
      return { mode: "full", recordCount: parsed.length } as const;
    }

    const added = current.filter((file) => !indexed.has(file.path));
    if (added.length === 0) return { mode: "fresh", recordCount: current.length } as const;
    const parsed = yield* parseFiles(root, added);
    db.transaction(() => insertRecords(db, parsed)).immediate();
    return { mode: "incremental", recordCount: current.length } as const;
  });

export const loadIndexedShortIds = (db: Database): Set<string> =>
  new Set(db.query<{ short_id: string }, []>("select short_id from records").all().map((row) => row.short_id));

export const loadIndexedRecords = (db: Database): Array<IndexedRecord> =>
  db
    .query<{ json: string; path: string; short_id: string }, []>("select json, path, short_id from records order by id")
    .all()
    .map((row) => ({ record: JSON.parse(row.json) as TasteRecord, path: row.path, shortId: row.short_id }));

export interface SearchHit {
  readonly id: string;
  readonly type: RecordType;
  /** bm25: lower is a better match. */
  readonly rank: number;
}

/** Full-text match on any normalised token (prefix match), best first. Empty when the query has no tokens. */
export const searchIndex = (
  db: Database,
  query: string,
  types: ReadonlyArray<"Belief" | "Memory">,
): Array<SearchHit> => {
  const tokens = [...new Set(normaliseTokens(query))];
  if (tokens.length === 0 || types.length === 0) return [];
  const match = tokens.map((token) => `"${token.replaceAll('"', '""')}"*`).join(" OR ");
  return db
    .query<SearchHit, Array<string>>(
      `select id, type, bm25(search) as rank from search where search match ? and type in (${types.map(() => "?").join(", ")}) order by rank, id`,
    )
    .all(match, ...types);
};
