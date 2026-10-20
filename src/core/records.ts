import { Schema } from "effect";
import {
  OptionalTrimmedText,
  OptionalTrimmedTextList,
  optionalInputChoice,
  TrimmedText,
  TrimmedTextList,
} from "../shared/input-text.ts";
import { DecisionOutcomeSchema } from "../shared/vocabulary.ts";

export const SCHEMA_VERSION = "1";

/** ISO 8601 with an explicit offset; seconds and fractions optional (minute precision has none). */
export const ISO_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

const SAID_AT_PRECISIONS = ["second", "minute", "day"] as const;

const NonEmpty = Schema.String.check(Schema.isMinLength(1));
const IsoTime = Schema.String.check(Schema.isPattern(ISO_TIME_PATTERN, { message: "expected ISO 8601 with an offset" }));
/** `kind:rest`, e.g. `slack:acme/U123`, `human:demo`, `claude-code/2.x` is NOT an account. */
const Account = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9-]*:\S+$/, { message: "expected <kind>:<id>" }));
const HumanAccount = Schema.String.check(Schema.isPattern(/^human:\S+$/, { message: "expected human:<id>" }));
/** Agents and processes, e.g. `claude-code/2.x`, `process:seed`. Never `human:`. */
const Actor = Schema.String.check(
  Schema.isPattern(/^(?!human:)\S+$/, { message: "expected an agent or process actor, never human:<id>" }),
);
const Scopes = Schema.Array(NonEmpty);
const Ids = Schema.Array(NonEmpty);

const recordBase = {
  id: NonEmpty,
  schema_version: Schema.Literal(SCHEMA_VERSION),
};

export const MemoryRecordSchema = Schema.Struct({
  ...recordBase,
  type: Schema.Literal("Memory"),
  said_by: Account,
  said_by_label: NonEmpty,
  said_at: IsoTime,
  said_at_precision: Schema.Literals(SAID_AT_PRECISIONS),
  captured_at: IsoTime,
  captured_via: Actor,
  address: Schema.optionalKey(NonEmpty),
  applies_to: Schema.optionalKey(Scopes),
  revises: Schema.optionalKey(NonEmpty),
  // Body: `## Quote`, then optional `## Before` / `## After`.
  quote: NonEmpty,
  before: Schema.optionalKey(NonEmpty),
  after: Schema.optionalKey(NonEmpty),
});
export type MemoryRecord = typeof MemoryRecordSchema.Type;

export const BeliefRecordSchema = Schema.Struct({
  ...recordBase,
  type: Schema.Literal("Belief"),
  statement: NonEmpty.check(Schema.isPattern(/^[^\n]+$/, { message: "statement must be one line" })),
  applies_to: Schema.optionalKey(Scopes),
  subject: Schema.String.check(
    Schema.isPattern(/^(owner|[a-z][a-z0-9-]*:\S+)$/, { message: "expected owner or a said_by account" }),
  ),
  supports: Ids.check(Schema.isMinLength(1)),
  contradicts: Schema.optionalKey(Ids),
  supersedes: Schema.optionalKey(NonEmpty),
  despite: Schema.optionalKey(NonEmpty),
  proposed_by: Actor,
  proposed_at: IsoTime,
  // Body: the reasoning, then `## Despite` holding the agent's case when `despite` is set.
  reasoning: Schema.String,
  despite_case: Schema.optionalKey(NonEmpty),
});
export type BeliefRecord = typeof BeliefRecordSchema.Type;

export const DecisionRecordSchema = Schema.Struct({
  ...recordBase,
  type: Schema.Literal("Decision"),
  target: NonEmpty,
  outcome: DecisionOutcomeSchema,
  by: HumanAccount,
  at: IsoTime,
  reason: Schema.optionalKey(NonEmpty),
  // Not in the spec's field list: records the process that wrote on a human's behalf (the seed).
  via: Schema.optionalKey(Actor),
});
export type DecisionRecord = typeof DecisionRecordSchema.Type;

export const ThreadEntryRecordSchema = Schema.Struct({
  ...recordBase,
  type: Schema.Literal("ThreadEntry"),
  thread: NonEmpty,
  author: Schema.String.check(Schema.isPattern(/^\S+$/, { message: "expected an actor" })),
  at: IsoTime,
  text: NonEmpty,
});
export type ThreadEntryRecord = typeof ThreadEntryRecordSchema.Type;

export const TasteRecordSchema = Schema.Union([
  MemoryRecordSchema,
  BeliefRecordSchema,
  DecisionRecordSchema,
  ThreadEntryRecordSchema,
]);
export type TasteRecord = typeof TasteRecordSchema.Type;
export type RecordType = TasteRecord["type"];

export const RECORD_FOLDERS: Record<RecordType, string> = {
  Memory: "memories",
  Belief: "beliefs",
  Decision: "decisions",
  ThreadEntry: "threads",
};

/** The time a record's file is laid out (and sorted) by. */
export const recordCreatedAt = (record: TasteRecord): string => {
  switch (record.type) {
    case "Memory":
      return record.captured_at;
    case "Belief":
      return record.proposed_at;
    case "Decision":
    case "ThreadEntry":
      return record.at;
  }
};

/**
 * `taste capture` input (flags or `--json` stdin). Decoding trims every value and drops blank optional
 * ones; the record schema then checks what is left.
 */
export const CaptureMemoryInputSchema = Schema.Struct({
  said_by: TrimmedText,
  said_by_label: TrimmedText,
  said_at: TrimmedText,
  said_at_precision: optionalInputChoice(SAID_AT_PRECISIONS),
  quote: TrimmedText,
  before: OptionalTrimmedText,
  after: OptionalTrimmedText,
  address: OptionalTrimmedText,
  applies_to: OptionalTrimmedTextList,
  /** A memory ref: full id, short id or unique prefix. */
  revises: OptionalTrimmedText,
  captured_via: TrimmedText,
});
export type CaptureMemoryInput = typeof CaptureMemoryInputSchema.Type;
export type CaptureMemoryInputFields = typeof CaptureMemoryInputSchema.Encoded;

/** `taste propose` input. Ref fields (`supports`, `contradicts`, `supersedes`, `despite`) accept any record ref. */
export const ProposeBeliefInputSchema = Schema.Struct({
  statement: TrimmedText,
  supports: TrimmedTextList,
  applies_to: OptionalTrimmedTextList,
  subject: OptionalTrimmedText,
  contradicts: OptionalTrimmedTextList,
  supersedes: OptionalTrimmedText,
  despite: OptionalTrimmedText,
  /** The agent's case for re-proposing `despite` a match (`--why`); stored as the body's `## Despite`. */
  despite_case: OptionalTrimmedText,
  reasoning: OptionalTrimmedText,
  proposed_by: TrimmedText,
});
export type ProposeBeliefInput = typeof ProposeBeliefInputSchema.Type;
export type ProposeBeliefInputFields = typeof ProposeBeliefInputSchema.Encoded;
