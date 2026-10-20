/**
 * Taste's closed vocabularies and pure helpers, in one browser-safe module. Core, the CLI, the server
 * functions and the review UI all derive from these; importProtection keeps `src/core` out of the
 * browser, so anything the UI needs at runtime lives here instead.
 */
import { Schema } from "effect";

/** Computed on read, never stored. `superseded` means an accepted belief names it in `supersedes`. */
export const BELIEF_STATUSES = ["pending", "accepted", "rejected", "retracted", "superseded"] as const;
export const BeliefStatusSchema = Schema.Literals(BELIEF_STATUSES);
export type BeliefStatus = (typeof BELIEF_STATUSES)[number];

export const DECISION_OUTCOMES = ["accept", "reject", "retract"] as const;
export const DecisionOutcomeSchema = Schema.Literals(DECISION_OUTCOMES);
export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number];

/** The 8 hex characters after the time prefix: the 48-bit time and the version nibble (always 7) are skipped. */
export const shortIdOf = (id: string, length = 8): string => id.replaceAll("-", "").slice(13, 13 + length);

/** A missing `applies_to` means every project; the UI shows it in a warning colour. */
export const formatScopeLabel = (appliesTo: ReadonlyArray<string> | undefined): string =>
  appliesTo === undefined ? "Everywhere" : appliesTo.join(", ");
