import { Effect } from "effect";
import type { CorruptRecordFile } from "./errors.ts";
import { compareIsoTimes } from "./ids.ts";
import type { MemoryRecord } from "./records.ts";
import { isBeliefInScope } from "./status.ts";
import { type StoreSnapshot, TasteStore } from "./store.ts";
import { type BeliefSummary, type RecalledBelief, recallBelief, summarizeBelief } from "./views.ts";

const DEFAULT_RECALL_LIMIT = 5;

export interface RecallInput {
  readonly query: string;
  /** In scope: `applies_to` missing or containing this. Omit for every scope. */
  readonly scope?: string | undefined;
  /** Also return superseded and retracted beliefs, in `history`. */
  readonly history?: boolean | undefined;
  /** Per section. */
  readonly limit?: number | undefined;
}

export interface RecallResult {
  readonly query: string;
  readonly scope: string | undefined;
  /** Accepted beliefs in scope, best match first. */
  readonly believed: ReadonlyArray<RecalledBelief>;
  /** Rejected beliefs that match, with `decidedAt` (the rejection) and `reason`. Never turned into an opposite belief. */
  readonly notBelieved: ReadonlyArray<BeliefSummary>;
  readonly memories: ReadonlyArray<MemoryRecord>;
  /** Superseded and retracted matches; empty unless `history` was asked for. */
  readonly history: ReadonlyArray<RecalledBelief>;
}

/** Pure: assembles the three sections from FTS hits (best first) over a snapshot. */
const assembleRecall = (
  snapshot: StoreSnapshot,
  input: RecallInput,
  hits: ReadonlyArray<{ readonly id: string }>,
): RecallResult => {
  const limit = input.limit ?? DEFAULT_RECALL_LIMIT;
  const believed: Array<RecalledBelief> = [];
  const notBelieved: Array<BeliefSummary> = [];
  const memories: Array<MemoryRecord> = [];
  const history: Array<RecalledBelief> = [];
  for (const hit of hits) {
    const record = snapshot.byId.get(hit.id)?.record;
    if (record?.type === "Memory") {
      if (memories.length < limit && isBeliefInScope(record.applies_to, input.scope)) memories.push(record);
      continue;
    }
    if (record?.type !== "Belief" || !isBeliefInScope(record.applies_to, input.scope)) continue;
    const status = snapshot.beliefStates.get(record.id)?.status;
    if (status === "accepted" && believed.length < limit) believed.push(recallBelief(snapshot, record));
    else if (status === "rejected" && notBelieved.length < limit) notBelieved.push(summarizeBelief(snapshot, record));
    else if (input.history === true && (status === "superseded" || status === "retracted") && history.length < limit) {
      history.push(recallBelief(snapshot, record));
    }
  }
  return { query: input.query, scope: input.scope, believed, notBelieved, memories, history };
};

/** `taste recall`: FTS over belief statements, reasoning and memory quotes; status decides the section. */
export const recallBeliefs = (input: RecallInput): Effect.Effect<RecallResult, CorruptRecordFile, TasteStore> =>
  Effect.gen(function* () {
    const store = yield* TasteStore;
    const snapshot = yield* store.snapshot;
    return assembleRecall(snapshot, input, yield* store.search(input.query, ["Belief", "Memory"]));
  });

/** `taste context`: every accepted belief in scope, oldest first, no query. */
export const listContextBeliefs = (input: {
  readonly scope?: string | undefined;
}): Effect.Effect<Array<RecalledBelief>, CorruptRecordFile, TasteStore> =>
  TasteStore.use((store) =>
    Effect.map(store.snapshot, (snapshot) =>
      snapshot.beliefs
        .filter((belief) => isBeliefInScope(belief.applies_to, input.scope))
        .filter((belief) => snapshot.beliefStates.get(belief.id)?.status === "accepted")
        .sort((left, right) => compareIsoTimes(left.proposed_at, right.proposed_at) || left.id.localeCompare(right.id))
        .map((belief) => recallBelief(snapshot, belief)),
    ),
  );
