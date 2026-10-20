// taste-store.server.ts: the review UI's one door into core. Server functions run core through `runTasteEffect`;
// importProtection keeps this file (and core) out of the browser bundle.
import { Effect, Match } from "effect";
import { provideTasteStore, resolveStoreRoot, type TasteError, type TasteStore } from "../core/index.ts";

export * from "../core/index.ts";

/** Read per call, so `TASTE_STORE` set by `taste review` is honoured without restarting anything. */
export const tasteStoreRoot = (): string => resolveStoreRoot({ env: process.env.TASTE_STORE, cwd: process.cwd() });

/** Core's failures as sentences a reviewer can act on. Exhaustive: a new `TasteError` must get one here. */
export const describeTasteFailure = (error: TasteError): string =>
  Match.valueTags(error, {
    StoreNotInitialised: (missing) => `No Taste store at ${missing.root}. Run \`taste init\` or \`taste seed\`, or set TASTE_STORE.`,
    StoreAlreadyExists: (existing) => `A store already exists at ${existing.root}.`,
    StoreNotEmpty: (full) => `The store at ${full.root} already holds ${full.recordCount} records.`,
    InvalidRecordInput: (invalid) => invalid.message,
    CorruptRecordFile: (corrupt) => `${corrupt.path} does not parse: ${corrupt.message}`,
    UnknownRecordRef: (unknown) => `No ${unknown.expected} matches "${unknown.ref}".`,
    AmbiguousRecordRef: (ambiguous) => `"${ambiguous.ref}" matches more than one record.`,
    NearRepeatRefused: (refused) => `This repeats an earlier belief: "${refused.matches[0]?.statement ?? ""}".`,
    DecisionNotAllowed: (refused) => `${refused.message} Someone may have decided it first; the page has been refreshed.`,
    DecisionLockTimeout: () => "Another decision is being written right now. Try again in a moment.",
    StoreWriteFailed: (failed) => `Could not write ${failed.path}: ${failed.message}`,
  });

/** Opens the store for one request, runs `effect`, closes the index; failures cross to the browser as an Error's message. */
export const runTasteEffect = <A, E extends TasteError>(effect: Effect.Effect<A, E, TasteStore>): Promise<A> =>
  Effect.runPromise(
    effect.pipe(
      provideTasteStore(tasteStoreRoot()),
      Effect.mapError((error) => new Error(describeTasteFailure(error))),
    ),
  );
