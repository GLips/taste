/**
 * What every command shares: the `--json` and `--store` flags, opening the store, printing a result
 * in either mode, and turning a failure into the spec's exit code (0 ok, 2 invalid input, 3 refused).
 */
import { Effect, FileSystem, Layer, Option, Path, Stdio, Terminal } from "effect";
import { CliError, Flag } from "effect/cli";
import { ChildProcessSpawner } from "effect/process";
import { provideTasteStore, resolveStoreRoot, type TasteError, type TasteStore } from "../core/index.ts";
import { formatTasteErrorText } from "./format.ts";

export const jsonFlag = Flag.Boolean("json").pipe(
  Flag.withDescription("Machine-readable JSON on stdout"),
  Flag.withDefault(false),
);
export const storeFlag = Flag.optional(Flag.String("store")).pipe(
  Flag.withDescription("Store root (default: $TASTE_STORE, then ./.taste)"),
);

export const resolveCliStoreRoot = (store: Option.Option<string>): string =>
  resolveStoreRoot({ flag: Option.getOrUndefined(store), env: process.env.TASTE_STORE, cwd: process.cwd() });

/** Runs `effect` against the store named by `--store` / `TASTE_STORE` / `./.taste`. */
export const inCliStore = <A, E>(store: Option.Option<string>, effect: Effect.Effect<A, E, TasteStore>) =>
  provideTasteStore(resolveCliStoreRoot(store))(effect);

export const printLine = (text: string) => Effect.sync(() => process.stdout.write(`${text}\n`));
export const printErrorLine = (text: string) => Effect.sync(() => process.stderr.write(`${text}\n`));

/** One result, as pretty JSON under `--json` and as `renderText` otherwise. */
export const emitCliResult = <A>(json: boolean, value: A, renderText: (value: A) => string) =>
  printLine(json ? JSON.stringify(value, null, 2) : renderText(value));

/** Reads all of stdin. Agents' shells give a closed or `/dev/null` stdin; an open pipe that never closes would block. */
export const readCliStdin = Effect.promise(() => Bun.stdin.text());

/**
 * effect/cli needs these services, but taste never uses its file, path-completion, prompt or
 * child-process features. `@effect/platform-bun` is not a dependency, so this is the minimum by hand.
 */
export const cliPlatformLayer = Layer.mergeAll(
  FileSystem.layerNoop({}),
  Path.layer,
  Stdio.layerTest({ args: Effect.sync(() => process.argv.slice(2)) }),
  Layer.succeed(
    Terminal.Terminal,
    Terminal.make({
      columns: Effect.sync(() => process.stdout.columns ?? 100),
      rows: Effect.sync(() => process.stdout.rows ?? 24),
      readInput: Effect.die("taste has no interactive prompts"),
      readLine: Effect.die("taste has no interactive prompts"),
      display: (text) => Effect.sync(() => void process.stdout.write(text)),
    }),
  ),
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() => Effect.die("taste spawns processes with Bun.spawn")),
  ),
);

/** The spec defines 2 (invalid input) and 3 (near repeat refused); 1 is anything unexpected. */
const EXIT_CODE_BY_TASTE_ERROR: Record<TasteError["_tag"], number> = {
  InvalidRecordInput: 2,
  UnknownRecordRef: 2,
  AmbiguousRecordRef: 2,
  StoreNotInitialised: 2,
  StoreAlreadyExists: 2,
  StoreNotEmpty: 2,
  NearRepeatRefused: 3,
  CorruptRecordFile: 1,
  DecisionNotAllowed: 1,
  DecisionLockTimeout: 1,
  StoreWriteFailed: 1,
};

/**
 * Reports a failed command and returns its exit code. effect/cli has already printed help and parse
 * errors (exit 2, or 0 for a bare help request). A defect prints its stack and exits 1.
 */
export const reportCliFailure = (
  failure: { readonly _tag: "Fail"; readonly error: TasteError | CliError.CliError } | { readonly _tag: "Die"; readonly defect: unknown },
  json: boolean,
): number => {
  if (failure._tag === "Die") {
    const { defect } = failure;
    process.stderr.write(`${defect instanceof Error ? (defect.stack ?? defect.message) : String(defect)}\n`);
    return 1;
  }
  const { error } = failure;
  if (CliError.isCliError(error)) return error._tag === "ShowHelp" && error.errors.length === 0 ? 0 : 2;
  if (json) process.stdout.write(`${JSON.stringify({ error }, null, 2)}\n`);
  else process.stderr.write(`${formatTasteErrorText(error)}\n`);
  return EXIT_CODE_BY_TASTE_ERROR[error._tag];
};
