/** The store, write and read commands. Each parses its input, calls core, and prints the result. */
import { userInfo } from "node:os";
import { Effect, Option } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import {
  appendAgentThreadReply,
  buildHookPayload,
  type CaptureMemoryInputFields,
  captureMemory,
  decodeCaptureMemoryInput,
  decodeProposeBeliefInput,
  formatLocalIsoTime,
  initStore,
  InvalidRecordInput,
  listContextBeliefs,
  type ProposeBeliefInputFields,
  proposeBelief,
  rebuildStoreIndex,
  recallBeliefs,
  showRecord,
} from "../core/index.ts";
import {
  formatContextText,
  formatHookPreviewText,
  formatProposeText,
  formatRecallText,
  formatShowText,
} from "./format.ts";
import { emitCliResult, inCliStore, jsonFlag, readCliStdin, resolveCliStoreRoot, storeFlag } from "./runtime.ts";

const optionalString = (name: string, description: string) =>
  Flag.optional(Flag.String(name)).pipe(Flag.withDescription(description));
const repeatableString = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.atLeast(0), Flag.withDescription(description));
const appliesToFlag = repeatableString("applies-to", "A scope, e.g. a project name (repeatable)");
const scopeFlag = optionalString("applies-to", "Only beliefs in scope for this (missing applies_to counts as everywhere)");

const parseStdinJson = Effect.gen(function* () {
  const text = yield* readCliStdin;
  return yield* Effect.try({
    try: () => JSON.parse(text) as unknown,
    catch: (error) => new InvalidRecordInput({ message: `stdin is not JSON: ${String(error)}` }),
  });
});

// ---------------------------------------------------------------------------------------------
// store

export const initCommand = Command.make(
  "init",
  {
    owner: optionalString("owner", "The human who ratifies beliefs, human:<id> (default: human:$USER)"),
    json: jsonFlag,
    store: storeFlag,
  },
  ({ owner, json, store }) =>
    Effect.gen(function* () {
      const root = resolveCliStoreRoot(store);
      const config = yield* initStore(root, Option.getOrElse(owner, () => `human:${userInfo().username}`));
      yield* emitCliResult(json, { root, ...config }, () => `Created a store at ${root} owned by ${config.owner}.`);
    }),
).pipe(Command.withDescription("Create a store"));

export const reindexCommand = Command.make("reindex", { json: jsonFlag, store: storeFlag }, ({ json, store }) =>
  Effect.gen(function* () {
    const result = yield* inCliStore(store, rebuildStoreIndex);
    yield* emitCliResult(json, result, (value) => `Rebuilt the index (${value.recordCount} records).`);
  }),
).pipe(Command.withDescription("Delete and rebuild the SQLite index"));

// ---------------------------------------------------------------------------------------------
// writes

export const captureCommand = Command.make(
  "capture",
  {
    saidBy: optionalString("said-by", "Who said it: a source account, e.g. slack:acme/U123 or human:dana"),
    label: optionalString("label", "Display name of the speaker"),
    saidAt: optionalString("said-at", "When they said it, ISO 8601 with offset (default: now)"),
    precision: Flag.optional(Flag.Literals("precision", ["second", "minute", "day"])),
    quote: optionalString("quote", "The human's exact words"),
    before: optionalString("before", "Excerpt of what came before"),
    after: optionalString("after", "Excerpt of what came after"),
    address: optionalString("address", "URL or permalink of the source"),
    appliesTo: appliesToFlag,
    revises: optionalString("revises", "A memory this one revises (an edited message)"),
    via: optionalString("via", "The capturing agent, e.g. claude-code/2.x"),
    json: jsonFlag.pipe(Flag.withDescription("Read a capture object from stdin (when --quote is absent) and print JSON")),
    store: storeFlag,
  },
  (flags) =>
    Effect.gen(function* () {
      const fromStdin = flags.json && Option.isNone(flags.quote);
      const missing = fromStdin
        ? []
        : (["said-by", "label", "quote", "via"] as const).filter((name) =>
            Option.isNone({ "said-by": flags.saidBy, label: flags.label, quote: flags.quote, via: flags.via }[name]),
          );
      if (missing.length > 0) {
        return yield* new InvalidRecordInput({
          message: `capture needs ${missing.map((name) => `--${name}`).join(", ")} (or --json with a capture object on stdin)`,
        });
      }
      const fields = fromStdin
        ? { ...(Option.isSome(flags.via) && { captured_via: flags.via.value }), ...((yield* parseStdinJson) as object) }
        : ({
            said_by: Option.getOrElse(flags.saidBy, () => ""),
            said_by_label: Option.getOrElse(flags.label, () => ""),
            said_at: Option.getOrElse(flags.saidAt, () => formatLocalIsoTime(new Date())),
            said_at_precision: Option.getOrUndefined(flags.precision),
            quote: Option.getOrElse(flags.quote, () => ""),
            before: Option.getOrUndefined(flags.before),
            after: Option.getOrUndefined(flags.after),
            address: Option.getOrUndefined(flags.address),
            applies_to: flags.appliesTo,
            revises: Option.getOrUndefined(flags.revises),
            captured_via: Option.getOrElse(flags.via, () => ""),
          } satisfies CaptureMemoryInputFields);
      const input = yield* decodeCaptureMemoryInput(fields);
      const { memory, path } = yield* inCliStore(flags.store, captureMemory(input));
      yield* emitCliResult(flags.json, { id: memory.id, path, memory }, () => memory.id);
    }),
).pipe(Command.withDescription("Record a human's words verbatim as a memory; prints its id"));

export const proposeCommand = Command.make(
  "propose",
  {
    statement: Flag.String("statement").pipe(Flag.withDescription("The belief, one line")),
    supports: repeatableString("supports", "A memory id the belief rests on (repeatable, at least one)"),
    contradicts: repeatableString("contradicts", "A memory id that cuts against it (repeatable)"),
    appliesTo: appliesToFlag,
    subject: optionalString("subject", "owner (default) or the said_by account the belief is about"),
    supersedes: optionalString("supersedes", "An accepted belief this one revises"),
    despite: optionalString("despite", "The earlier belief this re-proposes despite (needs --why)"),
    why: optionalString("why", "With --despite: what is different now (stored as the belief's `## Despite` case)"),
    by: Flag.String("by").pipe(Flag.withDescription("The proposing agent, e.g. claude-code/2.x")),
    reason: optionalString("reason", "The reasoning (default: read from stdin)"),
    json: jsonFlag,
    store: storeFlag,
  },
  (flags) =>
    Effect.gen(function* () {
      const input = yield* decodeProposeBeliefInput({
        statement: flags.statement,
        supports: flags.supports,
        applies_to: flags.appliesTo,
        subject: Option.getOrUndefined(flags.subject),
        contradicts: flags.contradicts,
        supersedes: Option.getOrUndefined(flags.supersedes),
        despite: Option.getOrUndefined(flags.despite),
        despite_case: Option.getOrUndefined(flags.why),
        reasoning: Option.isSome(flags.reason) ? flags.reason.value : yield* readCliStdin,
        proposed_by: flags.by,
      } satisfies ProposeBeliefInputFields);
      const result = yield* inCliStore(flags.store, proposeBelief(input));
      yield* emitCliResult(flags.json, { id: result.belief.belief.id, ...result }, formatProposeText);
    }),
).pipe(Command.withDescription("Propose a belief citing memories; refused (exit 3) if it repeats an earlier one"));

const replyCommand = Command.make(
  "reply",
  {
    belief: Argument.String("belief").pipe(Argument.withDescription("The belief whose thread to reply on")),
    as: Flag.String("as").pipe(Flag.withDescription("The replying agent's name")),
    text: Argument.String("text"),
    json: jsonFlag,
    store: storeFlag,
  },
  ({ belief, as, text, json, store }) =>
    Effect.gen(function* () {
      // Core refuses any `human:` name (padded or not): only the review UI writes as the owner.
      const entry = yield* inCliStore(store, appendAgentThreadReply({ belief, agent: as, text }));
      yield* emitCliResult(json, entry, (value) => `Replied on ${value.thread} as ${value.author} [${value.id}]`);
    }),
).pipe(Command.withDescription("Append an agent reply to a belief's thread"));

export const threadCommand = Command.make("thread").pipe(
  Command.withDescription("Belief discussion threads"),
  Command.withSubcommands([replyCommand]),
);

// ---------------------------------------------------------------------------------------------
// reads

export const recallCommand = Command.make(
  "recall",
  {
    query: Argument.String("query"),
    scope: scopeFlag,
    history: Flag.Boolean("history").pipe(
      Flag.withDescription("Also show superseded and retracted beliefs"),
      Flag.withDefault(false),
    ),
    limit: Flag.optional(Flag.Int("limit")).pipe(Flag.withDescription("Per section (default 5)")),
    json: jsonFlag,
    store: storeFlag,
  },
  ({ query, scope, history, limit, json, store }) =>
    Effect.gen(function* () {
      const result = yield* inCliStore(
        store,
        recallBeliefs({
          query,
          scope: Option.getOrUndefined(scope),
          history,
          limit: Option.getOrUndefined(limit),
        }),
      );
      yield* emitCliResult(json, result, (value) => formatRecallText(value, history));
    }),
).pipe(Command.withDescription("Accepted beliefs with their quotes, then rejections, then memories"));

export const contextCommand = Command.make(
  "context",
  { scope: scopeFlag, json: jsonFlag, store: storeFlag },
  ({ scope, json, store }) =>
    Effect.gen(function* () {
      const beliefs = yield* inCliStore(store, listContextBeliefs({ scope: Option.getOrUndefined(scope) }));
      yield* emitCliResult(json, beliefs, formatContextText);
    }),
).pipe(Command.withDescription("Every accepted belief in scope, one line each"));

export const showCommand = Command.make(
  "show",
  { ref: Argument.String("id"), json: jsonFlag, store: storeFlag },
  ({ ref, json, store }) =>
    Effect.gen(function* () {
      const result = yield* inCliStore(store, showRecord(ref));
      yield* emitCliResult(json, result, formatShowText);
    }),
).pipe(Command.withDescription("One record with its status and reverse links"));

const previewCommand = Command.make(
  "preview",
  {
    prompt: Argument.String("prompt"),
    scope: optionalString("applies-to", "Scope to recall in (default: $TASTE_SCOPE, as the hook does)"),
    json: jsonFlag,
    store: storeFlag,
  },
  ({ prompt, scope, json, store }) =>
    Effect.gen(function* () {
      const payload = yield* inCliStore(
        store,
        buildHookPayload({ prompt, scope: Option.getOrUndefined(scope) ?? (process.env.TASTE_SCOPE || undefined) }),
      );
      yield* emitCliResult(json, payload, formatHookPreviewText);
    }),
).pipe(Command.withDescription("Print exactly what the UserPromptSubmit hook would inject for a prompt"));

export const hookCommand = Command.make("hook").pipe(
  Command.withDescription("The opt-in Claude Code prompt hook"),
  Command.withSubcommands([previewCommand]),
);
