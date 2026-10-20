import { closeSync, existsSync, linkSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { Effect, Schema } from "effect";
import YAML from "yaml";
import { InvalidRecordInput, StoreAlreadyExists, StoreNotInitialised, StoreWriteFailed } from "./errors.ts";
import { shortIdOf } from "../shared/vocabulary.ts";
import { slugify } from "./ids.ts";
import { RECORD_FOLDERS, recordCreatedAt, SCHEMA_VERSION, type TasteRecord } from "./records.ts";

export const STORE_CONFIG_FILE = "taste.yaml";
export const INDEX_DIR = ".index";

export const indexDirOf = (root: string) => join(root, INDEX_DIR);

/** `--store`, then `TASTE_STORE`, then `./.taste`. Empty strings count as unset. */
export const resolveStoreRoot = (options: {
  readonly flag?: string | undefined;
  readonly env?: string | undefined;
  readonly cwd: string;
}): string => resolve(options.cwd, options.flag || options.env || ".taste");

const StoreConfigSchema = Schema.Struct({
  owner: Schema.String.check(Schema.isPattern(/^human:\S+$/, { message: "owner must be human:<id>" })),
  schema_version: Schema.Literal(SCHEMA_VERSION),
});
export type StoreConfig = typeof StoreConfigSchema.Type;

export const readStoreConfig = (root: string): Effect.Effect<StoreConfig, StoreNotInitialised | InvalidRecordInput> => {
  const path = join(root, STORE_CONFIG_FILE);
  if (!existsSync(path)) return Effect.fail(new StoreNotInitialised({ root }));
  return Schema.decodeUnknownEffect(StoreConfigSchema)(YAML.parse(readFileSync(path, "utf8"), { schema: "failsafe" })).pipe(
    Effect.mapError((error) => new InvalidRecordInput({ message: `${path}: ${error.message}` })),
  );
};

/** Creates `taste.yaml` and a `.gitignore` for the disposable index. The kind folders appear on first write. */
export const initStore = (
  root: string,
  owner: string,
): Effect.Effect<StoreConfig, StoreAlreadyExists | InvalidRecordInput | StoreWriteFailed> =>
  Effect.gen(function* () {
    if (existsSync(join(root, STORE_CONFIG_FILE))) return yield* new StoreAlreadyExists({ root });
    const config = yield* Schema.decodeUnknownEffect(StoreConfigSchema)({ owner, schema_version: SCHEMA_VERSION }).pipe(
      Effect.mapError((error) => new InvalidRecordInput({ message: error.message })),
    );
    yield* writeFileExclusive(join(root, STORE_CONFIG_FILE), YAML.stringify(config));
    if (!existsSync(join(root, ".gitignore"))) yield* writeFileExclusive(join(root, ".gitignore"), `${INDEX_DIR}/\n`);
    return config;
  });

/**
 * Exclusive create: a store file is written once and never edited, so an existing path is an error.
 * Written to a temp file and hard-linked into place, because a polling reader (the listener, the UI)
 * would otherwise see an empty file between `open` and `write` and report it corrupt.
 */
export const writeFileExclusive = (path: string, content: string): Effect.Effect<void, StoreWriteFailed> =>
  Effect.try({
    try: () => {
      mkdirSync(dirname(path), { recursive: true });
      const temporary = `${path}.${process.pid}.tmp`;
      const fd = openSync(temporary, "wx");
      try {
        writeSync(fd, content);
      } finally {
        closeSync(fd);
      }
      try {
        linkSync(temporary, path);
      } finally {
        unlinkSync(temporary);
      }
    },
    catch: (error) => new StoreWriteFailed({ path, message: String(error) }),
  });

/** For mutable sidecar files under `.index/` only (listener cursors). Rename keeps readers from seeing half a file. */
export const writeFileAtomicSync = (path: string, content: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  const fd = openSync(temporary, "w");
  try {
    writeSync(fd, content);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, path);
};

/** `<kind>/YYYY/MM/<date>[-<slug>].<short-id>.md`, relative to the store root. */
export const recordRelativePath = (record: TasteRecord, shortId: string): string => {
  const created = recordCreatedAt(record);
  const [year, month] = [created.slice(0, 4), created.slice(5, 7)];
  const slug = recordSlug(record);
  return join(RECORD_FOLDERS[record.type], year, month, `${created.slice(0, 10)}${slug ? `-${slug}` : ""}.${shortId}.md`);
};

const recordSlug = (record: TasteRecord): string => {
  switch (record.type) {
    case "Memory":
      return slugify(record.quote, 5);
    case "Belief":
      return slugify(record.statement);
    case "Decision":
      return record.outcome;
    case "ThreadEntry":
      return "";
  }
};

/** Picks the 8-char short id, widening it if another file already uses it. */
export const uniqueShortId = (id: string, takenShortIds: ReadonlySet<string>): string => {
  for (let length = 8; length < 20; length += 2) {
    const candidate = shortIdOf(id, length);
    if (!takenShortIds.has(candidate)) return candidate;
  }
  return shortIdOf(id, 20);
};

/** The short id a record file carries in its name: the segment before `.md`. */
export const shortIdFromPath = (path: string): string => {
  const parts = path.split("/").pop()?.split(".") ?? [];
  return parts[parts.length - 2] ?? "";
};

export interface StoreFileStat {
  readonly path: string;
  readonly mtimeMs: number;
}

/** Every record file, relative to the root. Only the four kind folders are walked; `.index/` never is. */
export const listRecordFiles = (root: string): Array<StoreFileStat> => {
  const files: Array<StoreFileStat> = [];
  const walk = (directory: string) => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push({ path: relative(root, full), mtimeMs: statSync(full).mtimeMs });
      }
    }
  };
  for (const folder of Object.values(RECORD_FOLDERS)) walk(join(root, folder));
  return files.sort((left, right) => left.path.localeCompare(right.path));
};
