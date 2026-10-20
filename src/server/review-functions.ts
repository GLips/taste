// review-functions.ts: every server function the review UI calls. A plain `.ts` name on purpose: the browser imports
// these references (Start swaps each handler for an RPC stub), while the core they reach stays behind the
// `taste-store.server.ts` door. Decisions are written here and nowhere else.
import { createServerFn } from "@tanstack/react-start";
import { Effect, Schema } from "effect";
import { OptionalTrimmedText } from "../shared/input-text.ts";
import { BeliefStatusSchema, type DecisionOutcome, DecisionOutcomeSchema } from "../shared/vocabulary.ts";
import {
  appendOwnerThreadNote,
  buildHookPayload,
  decideBelief,
  describeTasteFailure,
  getBeliefView,
  listBeliefRows,
  listInboxGroups,
  listListenerHeartbeats,
  recallBeliefs,
  runTasteEffect,
  TasteStore,
  tasteStoreRoot,
} from "./taste-store.server.ts";

/** Header data every screen polls: owner, root, the inbox count, and every scope named anywhere (filter choices). */
export const fetchReviewStoreInfo = createServerFn({ method: "GET" }).handler(() =>
  runTasteEffect(
    Effect.gen(function* () {
      const store = yield* TasteStore;
      const rows = yield* listBeliefRows();
      return {
        root: tasteStoreRoot(),
        owner: store.config.owner,
        pendingCount: rows.filter((row) => row.status === "pending").length,
        scopes: [...new Set(rows.flatMap((row) => row.appliesTo ?? []))].sort(),
      };
    }),
  ),
);

/** Pending proposals, grouped by subject then shared scope, each card with its related beliefs. */
export const fetchInboxGroups = createServerFn({ method: "GET" }).handler(() => runTasteEffect(listInboxGroups));

const BeliefListFilter = Schema.Struct({
  status: Schema.optionalKey(BeliefStatusSchema),
  scope: OptionalTrimmedText,
});

/** Every belief matching the filter, as one row each. */
export const fetchBeliefList = createServerFn({ method: "GET" })
  .validator(Schema.toStandardSchemaV1(BeliefListFilter))
  .handler(({ data }) => runTasteEffect(listBeliefRows({ status: data.status, scope: data.scope })));

/** One belief with everything the detail screen shows, including who is listening on its thread. */
export const fetchBeliefDetail = createServerFn({ method: "GET" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ id: Schema.String })))
  .handler(({ data }) =>
    runTasteEffect(
      Effect.gen(function* () {
        const store = yield* TasteStore;
        return { view: yield* getBeliefView(data.id), listeners: yield* listListenerHeartbeats, owner: store.config.owner };
      }),
    ),
  );

const RecallInspectInput = Schema.Struct({
  query: Schema.String,
  scope: OptionalTrimmedText,
  history: Schema.optionalKey(Schema.Boolean),
});

/** The recall result and the exact hook payload for the same prompt and scope, side by side. */
export const fetchRecallInspection = createServerFn({ method: "GET" })
  .validator(Schema.toStandardSchemaV1(RecallInspectInput))
  .handler(({ data }) =>
    runTasteEffect(
      Effect.gen(function* () {
        const recall = yield* recallBeliefs({ query: data.query, scope: data.scope, history: data.history ?? false });
        const hook = yield* buildHookPayload({ prompt: data.query, scope: data.scope });
        return { recall, hook };
      }),
    ),
  );

/** A note on a belief's thread, always written as the store owner: the browser never names an author. */
export const postOwnerThreadNote = createServerFn({ method: "POST" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ belief: Schema.String, text: Schema.String })))
  .handler(({ data }) => runTasteEffect(appendOwnerThreadNote(data)));

/** A decision either lands or comes back as a sentence to show inline; stale state is expected, not exceptional. */
export type ReviewDecisionResult =
  | { readonly ok: true; readonly target: string }
  | { readonly ok: false; readonly target: string; readonly message: string };

const decideOne = (target: string, outcome: DecisionOutcome, reason: string | undefined) =>
  decideBelief({ target, outcome, reason }).pipe(
    Effect.map((): ReviewDecisionResult => ({ ok: true, target })),
    Effect.catch((error) => Effect.succeed<ReviewDecisionResult>({ ok: false, target, message: describeTasteFailure(error) })),
  );

const DecideInput = Schema.Struct({
  target: Schema.String,
  outcome: DecisionOutcomeSchema,
  reason: OptionalTrimmedText,
});

export const decideReviewBelief = createServerFn({ method: "POST" })
  .validator(Schema.toStandardSchemaV1(DecideInput))
  .handler(({ data }) => runTasteEffect(decideOne(data.target, data.outcome, data.reason)));

/**
 * Accepts a group's cards one by one, in the order shown. A card that fails (say, a second revision of a belief the
 * first just retired) is reported and the rest still go through.
 */
export const acceptReviewGroup = createServerFn({ method: "POST" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ targets: Schema.Array(Schema.String) })))
  .handler(({ data }) =>
    runTasteEffect(Effect.forEach(data.targets, (target) => decideOne(target, "accept", undefined))),
  );
