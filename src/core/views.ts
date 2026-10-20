import { Effect } from "effect";
import type { AmbiguousRecordRef, CorruptRecordFile, UnknownRecordRef } from "./errors.ts";
import { compareIsoTimes } from "./ids.ts";
import type { BeliefRecord, DecisionRecord, MemoryRecord, TasteRecord, ThreadEntryRecord } from "./records.ts";
import type { BeliefStatus } from "../shared/vocabulary.ts";
import { isBeliefInScope } from "./status.ts";
import {
  loadStoreSnapshot,
  resolveAnyRecordRef,
  resolveRecordRef,
  type StoreSnapshot,
  type TasteStore,
} from "./store.ts";

/**
 * The one projection of a belief plus its status. Every other belief shape (recall items, hook items,
 * repeat matches, full views) extends it, so a new belief-level field is added here once.
 */
export interface BeliefSummary {
  readonly id: string;
  readonly statement: string;
  readonly status: BeliefStatus;
  readonly appliesTo: ReadonlyArray<string> | undefined;
  readonly proposedAt: string;
  /** When the decision behind the current status was made; undefined while pending. */
  readonly decidedAt: string | undefined;
  /** That decision's reason (always present for a rejection). */
  readonly reason: string | undefined;
}

/** A belief compared with a candidate statement by the repeat check. */
export interface RepeatMatch extends BeliefSummary {
  /** Normalised token Jaccard against the candidate statement. */
  readonly similarity: number;
}

/** A recalled belief, with the memories it cites and their attribution. */
export interface RecalledBelief extends BeliefSummary {
  readonly quotes: ReadonlyArray<MemoryRecord>;
}

export interface BeliefView extends BeliefSummary {
  readonly belief: BeliefRecord;
  /** Oldest first, including decisions that had no effect. */
  readonly decisions: ReadonlyArray<DecisionRecord>;
  readonly supports: ReadonlyArray<MemoryRecord>;
  readonly contradicts: ReadonlyArray<MemoryRecord>;
  readonly supersedes: BeliefSummary | undefined;
  /** The whole `supersedes` chain back from this belief, oldest first; ends with `supersedes`. */
  readonly ancestors: ReadonlyArray<BeliefSummary>;
  /** Every belief naming this one in `supersedes`, whatever its status (pending revisions included). */
  readonly revisions: ReadonlyArray<BeliefSummary>;
  readonly despite: BeliefSummary | undefined;
  readonly thread: ReadonlyArray<ThreadEntryRecord>;
}

export const summarizeBelief = (snapshot: StoreSnapshot, belief: BeliefRecord): BeliefSummary => {
  const state = snapshot.beliefStates.get(belief.id);
  return {
    id: belief.id,
    statement: belief.statement,
    status: state?.status ?? "pending",
    appliesTo: belief.applies_to,
    proposedAt: belief.proposed_at,
    decidedAt: state?.decidingDecision?.at,
    reason: state?.decidingDecision?.reason,
  };
};

const beliefById = (snapshot: StoreSnapshot, id: string | undefined): BeliefRecord | undefined => {
  if (id === undefined) return undefined;
  const entry = snapshot.byId.get(id);
  return entry?.record.type === "Belief" ? entry.record : undefined;
};

const memoriesByIds = (snapshot: StoreSnapshot, ids: ReadonlyArray<string> | undefined): Array<MemoryRecord> =>
  (ids ?? []).flatMap((id) => {
    const entry = snapshot.byId.get(id);
    return entry?.record.type === "Memory" ? [entry.record] : [];
  });

const threadOf = (snapshot: StoreSnapshot, beliefId: string): Array<ThreadEntryRecord> =>
  snapshot.threadEntries
    .filter((entry) => entry.thread === beliefId)
    .sort((left, right) => compareIsoTimes(left.at, right.at) || left.id.localeCompare(right.id));

/** Walks `supersedes` back to the oldest ancestor. The seen set stops a hand-edited cycle. */
const ancestorsOf = (snapshot: StoreSnapshot, belief: BeliefRecord): Array<BeliefSummary> => {
  const chain: Array<BeliefSummary> = [];
  const seen = new Set([belief.id]);
  let older = beliefById(snapshot, belief.supersedes);
  while (older !== undefined && !seen.has(older.id)) {
    seen.add(older.id);
    chain.unshift(summarizeBelief(snapshot, older));
    older = beliefById(snapshot, older.supersedes);
  }
  return chain;
};

export const recallBelief = (snapshot: StoreSnapshot, belief: BeliefRecord): RecalledBelief => ({
  ...summarizeBelief(snapshot, belief),
  quotes: memoriesByIds(snapshot, belief.supports),
});

export const buildBeliefView = (snapshot: StoreSnapshot, belief: BeliefRecord): BeliefView => {
  const supersedes = beliefById(snapshot, belief.supersedes);
  const despite = beliefById(snapshot, belief.despite);
  return {
    ...summarizeBelief(snapshot, belief),
    belief,
    decisions: snapshot.beliefStates.get(belief.id)?.decisions ?? [],
    supports: memoriesByIds(snapshot, belief.supports),
    contradicts: memoriesByIds(snapshot, belief.contradicts),
    supersedes: supersedes && summarizeBelief(snapshot, supersedes),
    ancestors: ancestorsOf(snapshot, belief),
    revisions: snapshot.beliefs
      .filter((other) => other.supersedes === belief.id)
      .map((other) => summarizeBelief(snapshot, other)),
    despite: despite && summarizeBelief(snapshot, despite),
    thread: threadOf(snapshot, belief.id),
  };
};

export const getBeliefView = (
  ref: string,
): Effect.Effect<BeliefView, CorruptRecordFile | UnknownRecordRef | AmbiguousRecordRef, TasteStore> =>
  Effect.gen(function* () {
    const snapshot = yield* loadStoreSnapshot;
    const belief = yield* resolveRecordRef(snapshot, ref, "Belief");
    return buildBeliefView(snapshot, belief);
  });

export interface ListBeliefsFilter {
  readonly status?: BeliefStatus | undefined;
  /** In scope for this value: `applies_to` missing or containing it. */
  readonly scope?: string | undefined;
}

/** One line of the beliefs list: the summary, what replaced it (superseded only), and its thread length. */
export interface BeliefListRow extends BeliefSummary {
  /** The accepted revision that retired a superseded belief. */
  readonly replacedBy: BeliefSummary | undefined;
  readonly threadCount: number;
}

/** Newest proposal first. */
export const listBeliefRows = (
  filter: ListBeliefsFilter = {},
): Effect.Effect<Array<BeliefListRow>, CorruptRecordFile, TasteStore> =>
  Effect.map(loadStoreSnapshot, (snapshot) =>
    snapshot.beliefs
      .map((belief): BeliefListRow => {
        const summary = summarizeBelief(snapshot, belief);
        const replacedBy = snapshot.beliefStates.get(belief.id)?.supersededBy[0];
        const replacement = replacedBy === undefined ? undefined : beliefById(snapshot, replacedBy);
        return {
          ...summary,
          replacedBy: replacement && summarizeBelief(snapshot, replacement),
          threadCount: threadOf(snapshot, belief.id).length,
        };
      })
      .filter((row) => filter.status === undefined || row.status === filter.status)
      .filter((row) => isBeliefInScope(row.appliesTo, filter.scope))
      .sort((left, right) => compareIsoTimes(right.proposedAt, left.proposedAt)),
  );

export interface ShowResult {
  readonly record: TasteRecord;
  readonly path: string;
  /** Present when the record is a belief. */
  readonly belief: BeliefView | undefined;
  /** Beliefs citing this record in `supports` or `contradicts` (memories). */
  readonly citedBy: ReadonlyArray<BeliefSummary>;
  /** Memories whose `revises` names this one. */
  readonly revisedBy: ReadonlyArray<MemoryRecord>;
  /** Beliefs re-proposed `despite` this one. */
  readonly despitedBy: ReadonlyArray<BeliefSummary>;
}

/** `taste show`: one record, its status (beliefs), and every reverse link. */
export const showRecord = (
  ref: string,
): Effect.Effect<ShowResult, CorruptRecordFile | UnknownRecordRef | AmbiguousRecordRef, TasteStore> =>
  Effect.gen(function* () {
    const snapshot = yield* loadStoreSnapshot;
    const { record, path } = yield* resolveAnyRecordRef(snapshot, ref);
    const id = record.id;
    return {
      record,
      path,
      belief: record.type === "Belief" ? buildBeliefView(snapshot, record) : undefined,
      citedBy: snapshot.beliefs
        .filter((belief) => belief.supports.includes(id) || (belief.contradicts ?? []).includes(id))
        .map((belief) => summarizeBelief(snapshot, belief)),
      revisedBy: snapshot.memories.filter((memory) => memory.revises === id),
      despitedBy: snapshot.beliefs
        .filter((belief) => belief.despite === id)
        .map((belief) => summarizeBelief(snapshot, belief)),
    };
  });
