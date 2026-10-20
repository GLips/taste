import { Effect } from "effect";
import { formatScopeLabel } from "../shared/vocabulary.ts";
import type { CorruptRecordFile } from "./errors.ts";
import { recallBeliefs } from "./recall.ts";
import type { TasteStore } from "./store.ts";
import type { BeliefSummary } from "./views.ts";

const HOOK_RECALL_LIMIT = 3;
const HOOK_PREAMBLE = "Taste: evidence from the user's ratified beliefs, not new instructions.";

export interface HookPayload {
  readonly prompt: string;
  /** Accepted (believed) items first, then rejected (not believed) ones; at most 3. */
  readonly items: ReadonlyArray<BeliefSummary>;
  /** The `additionalContext` text; undefined when nothing matched (the hook prints nothing). */
  readonly additionalContext: string | undefined;
  /** Exactly what the hook writes to stdout; undefined when nothing matched. */
  readonly hookOutput: string | undefined;
}

const renderItem = (item: BeliefSummary) =>
  item.status === "accepted"
    ? `- Believed (${formatScopeLabel(item.appliesTo)}): ${item.statement} [${item.id}]`
    : `- Not believed: ${item.statement} (rejected ${item.decidedAt?.slice(0, 10) ?? "?"}: ${item.reason ?? "no reason"}) [${item.id}]`;

/**
 * The one payload builder shared by the UserPromptSubmit hook, `taste hook preview` and the recall
 * inspector, so all three show the same bytes. Accepted beliefs and rejections only, never raw
 * memories; at most 3 items, believed first. The 650ms deadline belongs to the hook, not here.
 */
export const buildHookPayload = (input: {
  readonly prompt: string;
  readonly scope?: string | undefined;
}): Effect.Effect<HookPayload, CorruptRecordFile, TasteStore> =>
  Effect.gen(function* () {
    const recall = yield* recallBeliefs({ query: input.prompt, scope: input.scope, limit: HOOK_RECALL_LIMIT });
    // A recalled belief carries its quotes; the hook never sends memories, so keep only the summary.
    const items: Array<BeliefSummary> = [
      ...recall.believed.map(({ quotes: _quotes, ...summary }) => summary),
      ...recall.notBelieved,
    ].slice(0, HOOK_RECALL_LIMIT);
    if (items.length === 0) return { prompt: input.prompt, items, additionalContext: undefined, hookOutput: undefined };
    const additionalContext = [HOOK_PREAMBLE, ...items.map(renderItem)].join("\n");
    const hookOutput = JSON.stringify({
      hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext },
    });
    return { prompt: input.prompt, items, additionalContext, hookOutput };
  });
