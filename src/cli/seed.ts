/**
 * `taste seed`: a fictional demo store. Every quote is attributed to `human:demo` ("Dana (demo)"),
 * never to whoever runs it, and the store's owner is `human:demo` so the seed's decisions (written
 * `via: process:seed`) are hers. Everything goes through core, so the repeat check and status rules apply.
 */
import { Effect } from "effect";
import { Command } from "effect/cli";
import {
  appendAgentThreadReply,
  appendOwnerThreadNote,
  type CaptureMemoryInput,
  captureMemory,
  decideBelief,
  initStore,
  InvalidRecordInput,
  listRecordFiles,
  type ProposeBeliefInput,
  proposeBelief,
  provideTasteStore,
  StoreNotEmpty,
  TasteStore,
} from "../core/index.ts";
import { emitCliResult, jsonFlag, resolveCliStoreRoot, storeFlag } from "./runtime.ts";

const SEED_OWNER = "human:demo";
const SEED_ACTOR = "process:seed";

const dana = (quote: string, saidAt: string, extra: Partial<CaptureMemoryInput> = {}): CaptureMemoryInput => ({
  said_by: SEED_OWNER,
  said_by_label: "Dana (demo)",
  said_at: saidAt,
  said_at_precision: "minute",
  quote,
  captured_via: SEED_ACTOR,
  ...extra,
});

const propose = (input: Omit<ProposeBeliefInput, "proposed_by">) =>
  proposeBelief({ ...input, proposed_by: SEED_ACTOR }).pipe(Effect.map((result) => result.belief.belief.id));

const capture = (input: CaptureMemoryInput) => captureMemory(input).pipe(Effect.map((result) => result.memory.id));

const writeSeedRecords = Effect.gen(function* () {
  const effectErrors = yield* capture(
    dana(
      "In acme-web, errors go through Effect. No more try/catch soup: if it can fail, the type says so.",
      "2026-09-02T10:14:00-07:00",
      {
        applies_to: ["acme-web"],
        address: "https://example.com/acme/pull/412#discussion_r1",
        before: "Agent: I wrapped the fetch in try/catch and logged the error.",
      },
    ),
  );
  const namedExports = yield* capture(
    dana("No default exports, ever. Named exports only, so grep finds the thing by its name.", "2026-09-05T15:40:00-07:00", {
      address: "https://example.com/acme/pull/430#discussion_r7",
    }),
  );
  const integrationTests = yield* capture(
    dana(
      "For billing-api I'd rather have a few integration tests against a real Postgres than a pile of mocks that pass while prod breaks.",
      "2026-09-11T09:02:00-07:00",
      { applies_to: ["billing-api"] },
    ),
  );
  const tailwindFirst = yield* capture(dana("Use Tailwind for the styling.", "2026-09-15T11:20:00-07:00"));
  const tailwindRevised = yield* capture(
    dana("Only use Tailwind in acme-web, not billing-api. billing-api has no UI worth a CSS framework.", "2026-09-15T11:26:00-07:00", {
      revises: tailwindFirst,
      after: "Agent: Got it, leaving billing-api's admin pages on plain CSS.",
    }),
  );
  const taggedErrors = yield* capture(
    dana(
      "And make them Data.TaggedError classes, one per failure. I want to catchTag on them, not string-match messages.",
      "2026-10-01T14:05:00-07:00",
      { applies_to: ["acme-web"] },
    ),
  );

  const effectBelief = yield* propose({
    statement: "Model failures in acme-web with Effect instead of try/catch",
    supports: [effectErrors],
    applies_to: ["acme-web"],
    reasoning: "Dana rejected a try/catch around a fetch and asked for failures to show up in the type.",
  });
  const namedExportsBelief = yield* propose({
    statement: "Use named exports, never default exports",
    supports: [namedExports],
    reasoning: "Stated as a rule with no project qualifier, with a reason (grep) that holds everywhere.",
  });
  const tailwindEverywhere = yield* propose({
    statement: "Use Tailwind everywhere",
    supports: [tailwindFirst],
    reasoning: "Dana asked for Tailwind without naming a project.",
  });
  yield* decideBelief({ target: effectBelief, outcome: "accept", via: SEED_ACTOR });
  yield* decideBelief({ target: namedExportsBelief, outcome: "accept", via: SEED_ACTOR });
  yield* decideBelief({ target: tailwindEverywhere, outcome: "reject", reason: "only acme-web", via: SEED_ACTOR });

  yield* propose({
    statement: "In acme-web, model each failure as its own Effect Data.TaggedError class and handle it with catchTag",
    supports: [effectErrors, taggedErrors],
    applies_to: ["acme-web"],
    supersedes: effectBelief,
    reasoning: "Sharpens the accepted Effect belief with Dana's follow-up about one tagged error per failure.",
  });
  yield* propose({
    statement: "Prefer a few integration tests against a real Postgres over mocks in billing-api",
    supports: [integrationTests],
    applies_to: ["billing-api"],
    reasoning: "Dana's stated preference, with the failure mode she wants to avoid.",
  });
  yield* propose({
    statement: "Use Tailwind for acme-web's marketing pages and billing-api's admin dashboard",
    supports: [tailwindFirst, tailwindRevised],
    applies_to: ["acme-web", "billing-api"],
    despite: tailwindEverywhere,
    despite_case: "The rejection said only acme-web, but billing-api has since grown an admin dashboard that reuses acme-web components, which already depend on Tailwind.",
    reasoning: "Reusing acme-web's components in the billing-api dashboard would mean duplicating their styles without Tailwind.",
  });

  yield* appendOwnerThreadNote({
    belief: namedExportsBelief,
    text: "Does this cover `export { default } from './x'` re-exports in index files?",
  });
  yield* appendAgentThreadReply({
    belief: namedExportsBelief,
    agent: SEED_ACTOR,
    text: "I'd treat a re-exported default as a default export too, so: rename it to a named export at the source. Want me to propose that as a separate belief?",
  });
});

export const seedCommand = Command.make("seed", { json: jsonFlag, store: storeFlag }, ({ json, store }) =>
  Effect.gen(function* () {
    const root = resolveCliStoreRoot(store);
    yield* initStore(root, SEED_OWNER).pipe(Effect.catchTag("StoreAlreadyExists", () => Effect.void));
    yield* provideTasteStore(root)(
      Effect.gen(function* () {
        const { config } = yield* TasteStore;
        const existing = listRecordFiles(root).length;
        if (existing > 0) return yield* new StoreNotEmpty({ root, recordCount: existing });
        if (config.owner !== SEED_OWNER) {
          return yield* new InvalidRecordInput({
            message: `seed data belongs to ${SEED_OWNER}, but this store's owner is ${config.owner}; seed a fresh directory`,
          });
        }
        yield* writeSeedRecords;
      }),
    );
    const recordCount = listRecordFiles(root).length;
    yield* emitCliResult(
      json,
      { root, owner: SEED_OWNER, recordCount },
      () => `Seeded a demo store at ${root} (${recordCount} records, owner ${SEED_OWNER} "Dana (demo)").`,
    );
  }),
).pipe(Command.withDescription("Create a fictional demo store (refuses a non-empty store)"));
