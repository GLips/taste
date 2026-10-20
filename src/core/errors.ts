import { Data } from "effect";
import type { BeliefStatus, DecisionOutcome } from "../shared/vocabulary.ts";
import type { RepeatMatch } from "./views.ts";

/** No `taste.yaml` at the resolved root. */
export class StoreNotInitialised extends Data.TaggedError("StoreNotInitialised")<{
  readonly root: string;
}> {}

/** `taste init` (or seed) on a root that already holds a store. */
export class StoreAlreadyExists extends Data.TaggedError("StoreAlreadyExists")<{
  readonly root: string;
}> {}

/** Seed and similar commands need an empty store. */
export class StoreNotEmpty extends Data.TaggedError("StoreNotEmpty")<{
  readonly root: string;
  readonly recordCount: number;
}> {}

/** Caller-supplied data failed validation. */
export class InvalidRecordInput extends Data.TaggedError("InvalidRecordInput")<{
  readonly message: string;
}> {}

/** A file in the store does not parse as a record. Hand edits are the usual cause. */
export class CorruptRecordFile extends Data.TaggedError("CorruptRecordFile")<{
  readonly path: string;
  readonly message: string;
}> {}

/** An id, short id or id prefix that names no record (or the wrong kind). */
export class UnknownRecordRef extends Data.TaggedError("UnknownRecordRef")<{
  readonly ref: string;
  readonly expected: string;
}> {}

/** A short id or prefix that matches more than one record. */
export class AmbiguousRecordRef extends Data.TaggedError("AmbiguousRecordRef")<{
  readonly ref: string;
  readonly candidates: ReadonlyArray<string>;
}> {}

/** `propose` hit a near repeat without `--despite`. Each match carries its status, decision date and reason. */
export class NearRepeatRefused extends Data.TaggedError("NearRepeatRefused")<{
  readonly matches: ReadonlyArray<RepeatMatch>;
}> {}

/** The decision is not valid for the belief's current state (usually someone decided first). */
export class DecisionNotAllowed extends Data.TaggedError("DecisionNotAllowed")<{
  readonly target: string;
  readonly outcome: DecisionOutcome;
  readonly status: BeliefStatus;
  readonly message: string;
}> {}

/** Another process held `.index/decide.lock` for too long. */
export class DecisionLockTimeout extends Data.TaggedError("DecisionLockTimeout")<{
  readonly lockPath: string;
}> {}

/** A filesystem write failed, including an exclusive create hitting an existing path. */
export class StoreWriteFailed extends Data.TaggedError("StoreWriteFailed")<{
  readonly path: string;
  readonly message: string;
}> {}

/**
 * Every failure core can raise. The CLI's exit codes and messages and the server's messages are
 * exhaustive over `TasteError["_tag"]`, so a new error here fails to compile until both decide.
 */
export type TasteError =
  | StoreNotInitialised
  | StoreAlreadyExists
  | StoreNotEmpty
  | InvalidRecordInput
  | CorruptRecordFile
  | UnknownRecordRef
  | AmbiguousRecordRef
  | NearRepeatRefused
  | DecisionNotAllowed
  | DecisionLockTimeout
  | StoreWriteFailed;
