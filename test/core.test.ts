import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import {
  appendAgentThreadReply,
  appendOwnerThreadNote,
  captureMemory,
  decideBelief,
  initStore,
  pollListenerEvents,
  proposeBelief,
  provideTasteStore,
  rebuildStoreIndex,
  recallBeliefs,
  type TasteStore,
} from "../src/core/index.ts";

const roots: Array<string> = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const newStore = async () => {
  const root = mkdtempSync(join(tmpdir(), "taste-test-"));
  roots.push(root);
  await Effect.runPromise(initStore(root, "human:tester"));
  return root;
};

const inStore = <A, E>(root: string, effect: Effect.Effect<A, E, TasteStore>) =>
  Effect.runPromise(provideTasteStore(root)(effect));

const failureTag = <A, E extends { readonly _tag: string }>(root: string, effect: Effect.Effect<A, E, TasteStore>) =>
  inStore(root, Effect.flip(effect)).then((error) => error._tag);

const capture = (quote: string, appliesTo?: Array<string>) =>
  captureMemory({
    said_by: "human:tester",
    said_by_label: "Tess",
    said_at: "2026-10-19T10:30:00-07:00",
    quote,
    captured_via: "claude-code/2.x",
    ...(appliesTo && { applies_to: appliesTo }),
  });

describe("taste core", () => {
  test("capture, propose, accept, then recall returns the belief with its quote", async () => {
    const root = await newStore();
    const { memory } = await inStore(root, capture("No default exports, ever. Named exports only.", ["acme-web"]));
    const { belief } = await inStore(
      root,
      proposeBelief({
        statement: "Use named exports instead of default exports",
        supports: [memory.id],
        applies_to: ["acme-web"],
        proposed_by: "claude-code/2.x",
        reasoning: "Tess corrected a default export.",
      }),
    );
    await inStore(root, decideBelief({ target: belief.belief.id, outcome: "accept" }));

    const recall = await inStore(root, recallBeliefs({ query: "default exports", scope: "acme-web" }));
    expect(recall.believed.map((item) => item.id)).toEqual([belief.belief.id]);
    expect(recall.believed[0]?.quotes[0]?.quote).toBe("No default exports, ever. Named exports only.");
    expect(recall.believed[0]?.quotes[0]?.said_by_label).toBe("Tess");
    // Out of scope: billing-api does not see an acme-web belief.
    const elsewhere = await inStore(root, recallBeliefs({ query: "default exports", scope: "billing-api" }));
    expect(elsewhere.believed).toEqual([]);
  });

  test("a near repeat of a rejected belief is refused with its reason; --despite lets it through", async () => {
    const root = await newStore();
    const { memory } = await inStore(root, capture("Only use Tailwind in acme-web, not billing-api."));
    const proposal = {
      statement: "Use Tailwind for styling everywhere",
      supports: [memory.id],
      proposed_by: "claude-code/2.x",
    };
    const { belief } = await inStore(root, proposeBelief(proposal));
    await inStore(root, decideBelief({ target: belief.belief.id, outcome: "reject", reason: "only acme-web" }));

    const refusal = await inStore(root, Effect.flip(proposeBelief({ ...proposal, statement: "Use Tailwind everywhere for styling." })));
    expect(refusal._tag).toBe("NearRepeatRefused");
    if (refusal._tag !== "NearRepeatRefused") throw refusal;
    expect(refusal.matches[0]).toMatchObject({
      id: belief.belief.id,
      statement: "Use Tailwind for styling everywhere",
      status: "rejected",
      reason: "only acme-web",
    });
    expect(refusal.matches[0]?.decidedAt).toBeString();

    const { belief: despite } = await inStore(
      root,
      proposeBelief({
        ...proposal,
        statement: "Use Tailwind everywhere for styling.",
        despite: belief.belief.id,
        despite_case: "billing-api now has a frontend too.",
      }),
    );
    expect(despite.despite).toMatchObject({ id: belief.belief.id, status: "rejected", reason: "only acme-web" });
    expect(despite.belief.despite_case).toBe("billing-api now has a frontend too.");
  });

  test("two pending revisions superseding the same belief: the second accept fails", async () => {
    const root = await newStore();
    const { memory } = await inStore(root, capture("Prefer integration tests over mocks."));
    const base = { supports: [memory.id], proposed_by: "claude-code/2.x" };
    const { belief: original } = await inStore(root, proposeBelief({ ...base, statement: "Prefer integration tests" }));
    await inStore(root, decideBelief({ target: original.belief.id, outcome: "accept" }));
    const revise = (statement: string) =>
      inStore(root, proposeBelief({ ...base, statement, supersedes: original.belief.id }));
    const { belief: first } = await revise("Prefer integration tests with real temp dirs");
    const { belief: second } = await revise("Prefer integration tests and mock only the network");

    await inStore(root, decideBelief({ target: first.belief.id, outcome: "accept" }));
    expect(await failureTag(root, decideBelief({ target: second.belief.id, outcome: "accept" }))).toBe(
      "DecisionNotAllowed",
    );
  });

  test("deleting .index/ and reindexing gives identical recall output", async () => {
    const root = await newStore();
    const { memory } = await inStore(root, capture("Use Effect for errors in acme-web.", ["acme-web"]));
    const { belief } = await inStore(
      root,
      proposeBelief({ statement: "Use Effect for error handling", supports: [memory.id], applies_to: ["acme-web"], proposed_by: "claude-code/2.x" }),
    );
    await inStore(root, decideBelief({ target: belief.belief.id, outcome: "accept" }));
    const query = recallBeliefs({ query: "effect errors", history: true });
    const before = await inStore(root, query);

    rmSync(join(root, ".index"), { recursive: true, force: true });
    await inStore(root, rebuildStoreIndex);
    expect(await inStore(root, query)).toEqual(before);
    expect(before.believed).toHaveLength(1);
    expect(before.memories).toHaveLength(1);

    // A long-lived process (a running listener) must survive `.index/` being deleted under it.
    const survivedDeletion = await inStore(
      root,
      Effect.gen(function* () {
        yield* query;
        rmSync(join(root, ".index"), { recursive: true, force: true });
        return yield* query;
      }),
    );
    expect(survivedDeletion).toEqual(before);
  });

  test("listen: a new human thread entry produces exactly one line; a restarted listener does not repeat it", async () => {
    const root = await newStore();
    const { memory } = await inStore(root, capture("Keep PRs small."));
    const { belief } = await inStore(
      root,
      proposeBelief({ statement: "Keep pull requests small", supports: [memory.id], proposed_by: "claude-code/2.x" }),
    );
    expect(await inStore(root, pollListenerEvents("agent-1"))).toEqual([]);

    await inStore(root, appendOwnerThreadNote({ belief: belief.belief.id, text: "How small?" }));
    await inStore(root, appendAgentThreadReply({ belief: belief.belief.id, agent: "agent-1", text: "Under 400 lines." }));
    // An agent can never post as the owner, however it pads the name; otherwise it would wake listeners.
    expect(
      await failureTag(root, appendAgentThreadReply({ belief: belief.belief.id, agent: " human:tester", text: "Me again." })),
    ).toBe("InvalidRecordInput");
    const events = await inStore(root, pollListenerEvents("agent-1"));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ belief: belief.belief.id, note: "How small?", statement: "Keep pull requests small" });
    expect(events[0]?.reply).toBe(`taste thread reply ${belief.belief.id} --as agent-1 "…"`);

    // A restart is a fresh process reading the same cursor file.
    expect(await inStore(root, pollListenerEvents("agent-1"))).toEqual([]);
  });
});
