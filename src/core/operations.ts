import { closeSync, openSync, rmSync, statSync, writeSync } from "node:fs";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import type { DecisionOutcome } from "../shared/vocabulary.ts";
import {
  type AmbiguousRecordRef,
  type CorruptRecordFile,
  DecisionLockTimeout,
  DecisionNotAllowed,
  InvalidRecordInput,
  NearRepeatRefused,
  type StoreWriteFailed,
  type UnknownRecordRef,
} from "./errors.ts";
import { formatLocalIsoTime, newRecordId } from "./ids.ts";
import {
  type BeliefRecord,
  type CaptureMemoryInput,
  CaptureMemoryInputSchema,
  type DecisionRecord,
  type MemoryRecord,
  type ProposeBeliefInput,
  ProposeBeliefInputSchema,
  SCHEMA_VERSION,
  type ThreadEntryRecord,
} from "./records.ts";
import {
  NEAR_REPEAT_THRESHOLD,
  normaliseText,
  RELATED_FTS_TOP,
  RELATED_THRESHOLD,
  tokenJaccard,
} from "./similarity.ts";
import { decisionInvalidReason } from "./status.ts";
import { resolveRecordRef, type StoreSnapshot, TasteStore } from "./store.ts";
import { indexDirOf } from "./store-files.ts";
import { type BeliefView, buildBeliefView, type RepeatMatch, summarizeBelief } from "./views.ts";

type WriteError = InvalidRecordInput | StoreWriteFailed | CorruptRecordFile;
type RefError = UnknownRecordRef | AmbiguousRecordRef;

const nowIso = Effect.sync(() => formatLocalIsoTime(new Date()));

const decodeInput =
  <S extends Schema.Constraint>(schema: S) =>
  (input: unknown): Effect.Effect<S["Type"], InvalidRecordInput> =>
    Schema.decodeUnknownEffect(schema)(input).pipe(
      Effect.mapError((error) => new InvalidRecordInput({ message: error.message })),
    ) as Effect.Effect<S["Type"], InvalidRecordInput>;

/** Boundary decode for capture input (CLI flags or stdin JSON): trims, drops blank optional fields. */
export const decodeCaptureMemoryInput = decodeInput(CaptureMemoryInputSchema);
/** Boundary decode for propose input: trims, drops blank optional fields. */
export const decodeProposeBeliefInput = decodeInput(ProposeBeliefInputSchema);

// ---------------------------------------------------------------------------------------------
// capture

/** Minute precision when the time has no seconds; agents can say `day` explicitly. */
const inferPrecision = (saidAt: string): MemoryRecord["said_at_precision"] =>
  /T\d{2}:\d{2}(Z|[+-])/.test(saidAt) ? "minute" : "second";

/** `taste capture`. The words are always a human's; the agent is only `captured_via`. */
export const captureMemory = (
  input: CaptureMemoryInput,
): Effect.Effect<{ readonly memory: MemoryRecord; readonly path: string }, WriteError | RefError, TasteStore> =>
  Effect.gen(function* () {
    const store = yield* TasteStore;
    const snapshot = yield* store.snapshot;
    const { revises, said_at_precision, ...fields } = input;
    const revised = revises === undefined ? undefined : yield* resolveRecordRef(snapshot, revises, "Memory");
    const memory: MemoryRecord = {
      id: newRecordId(),
      type: "Memory",
      schema_version: SCHEMA_VERSION,
      ...fields,
      said_at_precision: said_at_precision ?? inferPrecision(input.said_at),
      captured_at: yield* nowIso,
      ...(revised && { revises: revised.id }),
    };
    const written = yield* store.write(memory);
    return { memory, path: written.path };
  });

// ---------------------------------------------------------------------------------------------
// repeat check

interface RepeatCheckResult {
  /** Jaccard >= 0.75 or the same normalised text. Blocks `propose` unless named by `despite`. */
  readonly near: ReadonlyArray<RepeatMatch>;
  /** Jaccard 0.35 to 0.75, or a top-3 FTS hit. Never blocks. */
  readonly related: ReadonlyArray<RepeatMatch>;
}

/** Pure over a snapshot plus the FTS hits for the statement (best first). */
const classifyRepeatMatches = (
  snapshot: StoreSnapshot,
  statement: string,
  ftsBeliefIds: ReadonlyArray<string>,
  excludeIds: ReadonlySet<string>,
): RepeatCheckResult => {
  const normalised = normaliseText(statement);
  const topFts = new Set(ftsBeliefIds.filter((id) => !excludeIds.has(id)).slice(0, RELATED_FTS_TOP));
  const near: Array<RepeatMatch> = [];
  const related: Array<RepeatMatch> = [];
  for (const belief of snapshot.beliefs) {
    if (excludeIds.has(belief.id)) continue;
    const similarity = tokenJaccard(statement, belief.statement);
    const match = { ...summarizeBelief(snapshot, belief), similarity };
    const sameText = normalised !== "" && normaliseText(belief.statement) === normalised;
    if (similarity >= NEAR_REPEAT_THRESHOLD || sameText) near.push(match);
    else if (similarity >= RELATED_THRESHOLD || topFts.has(belief.id)) related.push(match);
  }
  const bySimilarity = (left: RepeatMatch, right: RepeatMatch) =>
    right.similarity - left.similarity || left.id.localeCompare(right.id);
  return { near: near.sort(bySimilarity), related: related.sort(bySimilarity) };
};

/**
 * Compares a candidate statement with every belief, whatever its status. The candidate never matches
 * itself (`id`, for the inbox's related list), and a revision never matches the belief it `supersedes`.
 */
const findRepeatMatches = (
  snapshot: StoreSnapshot,
  candidate: { readonly statement: string; readonly id?: string | undefined; readonly supersedes?: string | undefined },
): Effect.Effect<RepeatCheckResult, CorruptRecordFile, TasteStore> =>
  TasteStore.use((store) =>
    Effect.map(store.search(candidate.statement, ["Belief"]), (hits) => {
      const exclude = new Set([candidate.id, candidate.supersedes].filter((id) => id !== undefined));
      return classifyRepeatMatches(
        snapshot,
        candidate.statement,
        hits.map((hit) => hit.id),
        exclude,
      );
    }),
  );

// ---------------------------------------------------------------------------------------------
// propose

export interface ProposeResult {
  readonly belief: BeliefView;
  readonly path: string;
  readonly related: ReadonlyArray<RepeatMatch>;
}

/**
 * `taste propose`. Refuses a near repeat (NearRepeatRefused) unless `despite` names one of the near
 * matches and `despite_case` makes the case. The belief it `supersedes` is never a "repeat".
 */
export const proposeBelief = (
  input: ProposeBeliefInput,
): Effect.Effect<ProposeResult, WriteError | RefError | NearRepeatRefused, TasteStore> =>
  Effect.gen(function* () {
    const store = yield* TasteStore;
    const snapshot = yield* store.snapshot;
    const { supports: supportRefs, contradicts: contradictRefs, supersedes: supersedesRef, despite: despiteRef, ...fields } =
      input;
    const supports = yield* Effect.forEach(supportRefs, (ref) => resolveRecordRef(snapshot, ref, "Memory"));
    const contradicts = yield* Effect.forEach(contradictRefs ?? [], (ref) => resolveRecordRef(snapshot, ref, "Memory"));
    const supersedes = supersedesRef === undefined ? undefined : yield* resolveRecordRef(snapshot, supersedesRef, "Belief");
    const despite = despiteRef === undefined ? undefined : yield* resolveRecordRef(snapshot, despiteRef, "Belief");
    if (despite !== undefined && input.despite_case === undefined) {
      return yield* new InvalidRecordInput({ message: "--despite needs --why with the case for re-proposing" });
    }
    if (despite === undefined && input.despite_case !== undefined) {
      return yield* new InvalidRecordInput({ message: "--why only applies together with --despite" });
    }

    const repeat = yield* findRepeatMatches(snapshot, { statement: input.statement, supersedes: supersedes?.id });
    const blocking = repeat.near.filter((match) => match.id !== despite?.id);
    // Naming any near match with --despite lets the proposal through; the others still show as related.
    if (blocking.length > 0 && !repeat.near.some((match) => match.id === despite?.id)) {
      return yield* new NearRepeatRefused({ matches: blocking });
    }

    const belief: BeliefRecord = {
      id: newRecordId(),
      type: "Belief",
      schema_version: SCHEMA_VERSION,
      ...fields,
      subject: input.subject ?? "owner",
      supports: supports.map((memory) => memory.id),
      ...(contradicts.length > 0 && { contradicts: contradicts.map((memory) => memory.id) }),
      ...(supersedes && { supersedes: supersedes.id }),
      ...(despite && { despite: despite.id }),
      proposed_at: yield* nowIso,
      reasoning: input.reasoning ?? "",
    };
    const written = yield* store.write(belief);
    return {
      belief: buildBeliefView(yield* store.snapshot, belief),
      path: written.path,
      related: [...blocking, ...repeat.related],
    };
  });

// ---------------------------------------------------------------------------------------------
// decide (review UI server functions and the seed only; the CLI has no decide command)

const LOCK_WAIT_MS = 5_000;
/** A lock older than this is from a crashed process; decisions take milliseconds. */
const LOCK_STALE_MS = 30_000;

const tryCreateLock = (path: string): boolean => {
  try {
    const fd = openSync(path, "wx");
    writeSync(fd, `${process.pid} ${new Date().toISOString()}\n`);
    closeSync(fd);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (Date.now() - statSync(path, { throwIfNoEntry: false })!.mtimeMs > LOCK_STALE_MS) rmSync(path, { force: true });
    return false;
  }
};

/** Runs `use` holding `.index/decide.lock`, so the state recheck and the write are atomic across processes. */
const withDecisionLock = <A, E, R>(
  use: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | DecisionLockTimeout, R | TasteStore> =>
  Effect.gen(function* () {
    const store = yield* TasteStore;
    const lockPath = join(indexDirOf(store.root), "decide.lock");
    const acquire = Effect.gen(function* () {
      const deadline = Date.now() + LOCK_WAIT_MS;
      while (!tryCreateLock(lockPath)) {
        if (Date.now() > deadline) return yield* new DecisionLockTimeout({ lockPath });
        yield* Effect.sleep("20 millis");
      }
    });
    return yield* Effect.acquireUseRelease(
      acquire,
      () => use,
      () => Effect.sync(() => rmSync(lockPath, { force: true })),
    );
  });

export interface DecideBeliefInput {
  readonly target: string;
  readonly outcome: DecisionOutcome;
  /** Required for reject. Callers pass it trimmed (the server decodes it with `OptionalTrimmedText`). */
  readonly reason?: string | undefined;
  /** The process writing on the human's behalf, e.g. `process:seed`. */
  readonly via?: string | undefined;
}

/** Records a human decision after rechecking validity under the lock. Stale decisions fail with DecisionNotAllowed. */
export const decideBelief = (
  input: DecideBeliefInput,
): Effect.Effect<
  { readonly decision: DecisionRecord; readonly belief: BeliefView },
  WriteError | RefError | DecisionNotAllowed | DecisionLockTimeout,
  TasteStore
> =>
  Effect.gen(function* () {
    const store = yield* TasteStore;
    const { reason, via } = input;
    if (input.outcome === "reject" && reason === undefined) {
      return yield* new InvalidRecordInput({ message: "a rejection needs a reason" });
    }
    return yield* withDecisionLock(
      Effect.gen(function* () {
        const snapshot = yield* store.snapshot;
        const belief = yield* resolveRecordRef(snapshot, input.target, "Belief");
        const invalid = decisionInvalidReason(input.outcome, belief, (id) => snapshot.beliefStates.get(id)?.status);
        if (invalid !== undefined) {
          return yield* new DecisionNotAllowed({
            target: belief.id,
            outcome: input.outcome,
            status: snapshot.beliefStates.get(belief.id)?.status ?? "pending",
            message: `Cannot ${input.outcome}: ${invalid}.`,
          });
        }
        const decision: DecisionRecord = {
          id: newRecordId(),
          type: "Decision",
          schema_version: SCHEMA_VERSION,
          target: belief.id,
          outcome: input.outcome,
          by: store.config.owner,
          at: yield* nowIso,
          ...(reason !== undefined && { reason }),
          ...(via !== undefined && { via }),
        };
        yield* store.write(decision);
        return { decision, belief: buildBeliefView(yield* store.snapshot, belief) };
      }),
    );
  });

// ---------------------------------------------------------------------------------------------
// threads

const appendThreadEntry = (input: { readonly belief: string; readonly author: string; readonly text: string }) =>
  Effect.gen(function* () {
    const store = yield* TasteStore;
    const belief = yield* resolveRecordRef(yield* store.snapshot, input.belief, "Belief");
    const entry: ThreadEntryRecord = {
      id: newRecordId(),
      type: "ThreadEntry",
      schema_version: SCHEMA_VERSION,
      thread: belief.id,
      author: input.author,
      at: yield* nowIso,
      text: input.text.trim(),
    };
    yield* store.write(entry);
    return entry;
  });

/**
 * `taste thread reply --as <agent>`. Any `human:` name is refused after trimming, so an agent can
 * never post as the owner: listeners wake on human entries and the UI shows them as the owner's own.
 */
export const appendAgentThreadReply = (input: {
  readonly belief: string;
  readonly agent: string;
  readonly text: string;
}): Effect.Effect<ThreadEntryRecord, WriteError | RefError, TasteStore> => {
  const agent = input.agent.trim();
  if (agent.startsWith("human:")) {
    return Effect.fail(
      new InvalidRecordInput({ message: "agents reply as themselves; only the review UI writes as a human" }),
    );
  }
  return appendThreadEntry({ belief: input.belief, author: agent, text: input.text });
};

/** A note from the store owner. Only the review UI's server function (and the seed, as its owner) call this. */
export const appendOwnerThreadNote = (input: {
  readonly belief: string;
  readonly text: string;
}): Effect.Effect<ThreadEntryRecord, WriteError | RefError, TasteStore> =>
  TasteStore.use((store) => appendThreadEntry({ ...input, author: store.config.owner }));

// ---------------------------------------------------------------------------------------------
// inbox

export interface InboxCard {
  readonly view: BeliefView;
  /** Other beliefs near or related to this statement (any status), for the reviewer's context. */
  readonly related: ReadonlyArray<RepeatMatch>;
}

export interface InboxGroup {
  readonly subject: string;
  /** Undefined means everywhere; the UI shows that in a warning colour. */
  readonly appliesTo: ReadonlyArray<string> | undefined;
  readonly cards: ReadonlyArray<InboxCard>;
}

/** Pending proposals grouped by `subject`, then by identical `applies_to`; oldest proposal first. */
export const listInboxGroups: Effect.Effect<Array<InboxGroup>, CorruptRecordFile, TasteStore> = Effect.gen(
  function* () {
    const store = yield* TasteStore;
    const snapshot = yield* store.snapshot;
    const groups = new Map<string, { subject: string; appliesTo: ReadonlyArray<string> | undefined; cards: Array<InboxCard> }>();
    const pending = snapshot.beliefs
      .filter((belief) => snapshot.beliefStates.get(belief.id)?.status === "pending")
      .sort((left, right) => left.proposed_at.localeCompare(right.proposed_at) || left.id.localeCompare(right.id));
    for (const belief of pending) {
      const scope = belief.applies_to ? [...belief.applies_to].sort() : undefined;
      const key = JSON.stringify([belief.subject, scope ?? null]);
      const repeat = yield* findRepeatMatches(snapshot, belief);
      const group = groups.get(key) ?? { subject: belief.subject, appliesTo: scope, cards: [] };
      group.cards.push({ view: buildBeliefView(snapshot, belief), related: [...repeat.near, ...repeat.related] });
      groups.set(key, group);
    }
    return [...groups.values()];
  },
);
