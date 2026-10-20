import { compareIsoTimes } from "./ids.ts";
import type { BeliefStatus, DecisionOutcome } from "../shared/vocabulary.ts";
import type { BeliefRecord, DecisionRecord } from "./records.ts";

export interface BeliefState {
  readonly status: BeliefStatus;
  /** Every decision targeting the belief, oldest first, including ones that had no effect. */
  readonly decisions: ReadonlyArray<DecisionRecord>;
  /** The decision that produced the current base status (accept, reject or retract). */
  readonly decidingDecision: DecisionRecord | undefined;
  /** Ids of accepted beliefs whose `supersedes` names this one. */
  readonly supersededBy: ReadonlyArray<string>;
}

const sortDecisions = (decisions: ReadonlyArray<DecisionRecord>): Array<DecisionRecord> =>
  [...decisions].sort((left, right) => compareIsoTimes(left.at, right.at) || left.id.localeCompare(right.id));

type BaseStatus = "pending" | "accepted" | "rejected" | "retracted";

/**
 * Why a decision is or is not valid, given the effective statuses at that moment. Shared by the
 * write-time check (under the lock) and the replay below, so a file that slipped past the lock
 * (hand-written, or a race on another machine) has no effect instead of corrupting status.
 */
export const decisionInvalidReason = (
  outcome: DecisionOutcome,
  belief: BeliefRecord,
  statusOf: (id: string) => BeliefStatus | undefined,
): string | undefined => {
  const status = statusOf(belief.id);
  if (outcome === "retract") return status === "accepted" ? undefined : `can only retract an accepted belief (it is ${status})`;
  if (status !== "pending") return `can only ${outcome} a pending belief (it is ${status})`;
  if (outcome === "accept" && belief.supersedes !== undefined) {
    const replaced = statusOf(belief.supersedes);
    if (replaced !== "accepted") {
      return `it supersedes ${belief.supersedes}, which is ${replaced ?? "missing"}, not accepted`;
    }
  }
  return undefined;
};

/** Replays every decision in time order. Status is computed on read and never stored. */
export const deriveBeliefStates = (
  beliefs: ReadonlyArray<BeliefRecord>,
  decisions: ReadonlyArray<DecisionRecord>,
): Map<string, BeliefState> => {
  const byId = new Map(beliefs.map((belief) => [belief.id, belief]));
  const base = new Map<string, BaseStatus>(beliefs.map((belief) => [belief.id, "pending"]));
  const deciding = new Map<string, DecisionRecord>();
  const history = new Map<string, Array<DecisionRecord>>();

  const supersedersOf = (id: string) =>
    beliefs.filter((belief) => belief.supersedes === id && base.get(belief.id) === "accepted").map((belief) => belief.id);
  const statusOf = (id: string): BeliefStatus | undefined => {
    const status = base.get(id);
    if (status === "accepted" && supersedersOf(id).length > 0) return "superseded";
    return status;
  };

  for (const decision of sortDecisions(decisions)) {
    const belief = byId.get(decision.target);
    if (!belief) continue;
    history.set(belief.id, [...(history.get(belief.id) ?? []), decision]);
    if (decisionInvalidReason(decision.outcome, belief, statusOf) !== undefined) continue;
    base.set(belief.id, decision.outcome === "accept" ? "accepted" : decision.outcome === "reject" ? "rejected" : "retracted");
    deciding.set(belief.id, decision);
  }

  return new Map(
    beliefs.map((belief) => [
      belief.id,
      {
        status: statusOf(belief.id) ?? "pending",
        decisions: history.get(belief.id) ?? [],
        decidingDecision: deciding.get(belief.id),
        supersededBy: supersedersOf(belief.id),
      },
    ]),
  );
};

/** A belief is in scope for `scope` when `applies_to` is missing (everywhere) or contains it. */
export const isBeliefInScope = (appliesTo: ReadonlyArray<string> | undefined, scope: string | undefined): boolean =>
  scope === undefined || appliesTo === undefined || appliesTo.includes(scope);
