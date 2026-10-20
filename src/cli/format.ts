/** Readable (non-`--json`) renderings of core results. Pure string building, no IO. */
import { Match } from "effect";
import type {
  BeliefSummary,
  BeliefView,
  HookPayload,
  MemoryRecord,
  ProposeResult,
  RecallResult,
  RecalledBelief,
  RepeatMatch,
  ShowResult,
  TasteError,
  ThreadEntryRecord,
} from "../core/index.ts";
import { formatScopeLabel } from "../shared/vocabulary.ts";

const day = (iso: string | undefined) => iso?.slice(0, 10) ?? "?";
const minute = (iso: string) => iso.slice(0, 16).replace("T", " ");
const indent = (text: string, prefix = "    ") =>
  text
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");

const quoted = (text: string) => `"${text.replace(/\s+/g, " ").trim()}"`;

export const formatAttribution = (memory: MemoryRecord) =>
  [`${memory.said_by_label} (${memory.said_by})`, minute(memory.said_at), memory.address].filter(Boolean).join(" · ");

const formatQuoteLine = (memory: MemoryRecord) => `${quoted(memory.quote)}\n  — ${formatAttribution(memory)}  [${memory.id}]`;

const formatSummary = (belief: BeliefSummary) => {
  const decided = belief.decidedAt ? ` ${day(belief.decidedAt)}` : "";
  const reason = belief.reason ? `: ${belief.reason}` : "";
  return `${quoted(belief.statement)} (${belief.status}${decided}${reason})  [${belief.id}]`;
};

const formatRecalledBelief = (belief: RecalledBelief, marker = "") =>
  [
    `- ${belief.statement}  {${formatScopeLabel(belief.appliesTo)}}${marker}  [${belief.id}]`,
    ...belief.quotes.map((memory) => indent(formatQuoteLine(memory))),
  ].join("\n");

const section = (title: string, lines: ReadonlyArray<string>) =>
  `${title}\n${lines.length === 0 ? "  (none)" : lines.join("\n")}`;

export const formatRecallText = (result: RecallResult, history: boolean) =>
  [
    section(
      "Believed",
      result.believed.map((belief) => formatRecalledBelief(belief)),
    ),
    section(
      "Not believed",
      result.notBelieved.map(
        (rejection) =>
          `- ${quoted(rejection.statement)}  {${formatScopeLabel(rejection.appliesTo)}}  [${rejection.id}]\n` +
          `    rejected ${day(rejection.decidedAt)}: ${rejection.reason ?? "(no reason recorded)"}`,
      ),
    ),
    section(
      "Memories",
      result.memories.map((memory) => `- ${formatQuoteLine(memory).replace("\n", "\n  ")}`),
    ),
    ...(history
      ? [section("History", result.history.map((belief) => formatRecalledBelief(belief, ` (${belief.status})`)))]
      : []),
  ].join("\n\n");

export const formatContextText = (beliefs: ReadonlyArray<RecalledBelief>) =>
  beliefs.length === 0
    ? "(no accepted beliefs in scope)"
    : beliefs.map((belief) => `- ${belief.statement}  {${formatScopeLabel(belief.appliesTo)}}  [${belief.id}]`).join("\n");

const formatMatches = (title: string, matches: ReadonlyArray<RepeatMatch>) =>
  matches.length === 0
    ? []
    : [
        title,
        ...matches.map(
          (match) =>
            `  - ${quoted(match.statement)}  [${match.id}]\n` +
            `      ${match.status}, similarity ${match.similarity.toFixed(2)}, proposed ${day(match.proposedAt)}` +
            (match.decidedAt ? `, decided ${day(match.decidedAt)}` : "") +
            (match.reason ? `\n      reason: ${match.reason}` : ""),
        ),
      ];

export const formatProposeText = (result: ProposeResult) =>
  [
    `Proposed ${result.belief.belief.id}`,
    `  ${result.belief.belief.statement}  {${formatScopeLabel(result.belief.belief.applies_to)}}`,
    "  Pending until a human decides in `taste review`.",
    ...formatMatches("Related:", result.related),
  ].join("\n");

const formatRefusalText = (matches: ReadonlyArray<RepeatMatch>) =>
  [
    "Refused: this is a near repeat of an existing belief.",
    ...formatMatches("Matches:", matches).slice(1),
    `If you have a genuinely new case, re-propose with --despite ${matches[0]?.id ?? "<id>"} --why "<what is different now>".`,
  ].join("\n");

const formatThread = (thread: ReadonlyArray<ThreadEntryRecord>) =>
  thread.map((entry) => `  ${entry.author} · ${minute(entry.at)}\n${indent(entry.text)}`);

const formatBeliefView = (view: BeliefView) => {
  const { belief } = view;
  return [
    `Belief ${belief.id}`,
    `  ${belief.statement}`,
    `  status: ${view.status}${view.decidedAt ? ` (${day(view.decidedAt)})` : ""}${view.reason ? `, reason: ${view.reason}` : ""}`,
    `  applies to: ${formatScopeLabel(belief.applies_to)}`,
    `  subject: ${belief.subject}`,
    `  proposed by ${belief.proposed_by} at ${minute(belief.proposed_at)}`,
    ...(belief.reasoning ? ["", "Reasoning", indent(belief.reasoning, "  ")] : []),
    ...(belief.despite_case ? ["", "Despite", indent(belief.despite_case, "  ")] : []),
    "",
    "Cites",
    ...view.supports.map((memory) => indent(formatQuoteLine(memory), "  ")),
    ...(view.contradicts.length > 0
      ? ["Contradicts", ...view.contradicts.map((memory) => indent(formatQuoteLine(memory), "  "))]
      : []),
    ...(view.supersedes ? ["", `Supersedes ${formatSummary(view.supersedes)}`] : []),
    ...(view.revisions.length > 0 ? ["", "Revised by", ...view.revisions.map((other) => `  ${formatSummary(other)}`)] : []),
    ...(view.despite ? ["", `Proposed despite ${formatSummary(view.despite)}`] : []),
    ...(view.decisions.length > 0
      ? [
          "",
          "Decisions",
          ...view.decisions.map(
            (decision) =>
              `  ${decision.outcome} by ${decision.by}${decision.via ? ` via ${decision.via}` : ""} at ${minute(decision.at)}` +
              (decision.reason ? `: ${decision.reason}` : ""),
          ),
        ]
      : []),
    ...(view.thread.length > 0 ? ["", "Thread", ...formatThread(view.thread)] : []),
  ].join("\n");
};

export const formatShowText = (result: ShowResult) => {
  const { record } = result;
  const reverse = [
    ...(result.citedBy.length > 0 ? ["", "Cited by", ...result.citedBy.map((belief) => `  ${formatSummary(belief)}`)] : []),
    ...(result.revisedBy.length > 0
      ? ["", "Revised by", ...result.revisedBy.map((memory) => `  ${quoted(memory.quote)}  [${memory.id}]`)]
      : []),
    ...(result.despitedBy.length > 0
      ? ["", "Re-proposed despite this", ...result.despitedBy.map((belief) => `  ${formatSummary(belief)}`)]
      : []),
    "",
    `file: ${result.path}`,
  ];
  switch (record.type) {
    case "Belief":
      return [formatBeliefView(result.belief!), ...reverse].join("\n");
    case "Memory":
      return [
        `Memory ${record.id}`,
        indent(record.quote, "  > "),
        `  — ${formatAttribution(record)} (precision: ${record.said_at_precision})`,
        `  captured ${minute(record.captured_at)} via ${record.captured_via}`,
        `  applies to: ${record.applies_to ? record.applies_to.join(", ") : "(no hint)"}`,
        ...(record.revises ? [`  revises ${record.revises}`] : []),
        ...(record.before ? ["", "Before", indent(record.before, "  ")] : []),
        ...(record.after ? ["", "After", indent(record.after, "  ")] : []),
        ...reverse,
      ].join("\n");
    case "Decision":
      return [
        `Decision ${record.id}: ${record.outcome} ${record.target}`,
        `  by ${record.by}${record.via ? ` via ${record.via}` : ""} at ${minute(record.at)}`,
        ...(record.reason ? [`  reason: ${record.reason}`] : []),
        ...reverse,
      ].join("\n");
    case "ThreadEntry":
      return [
        `Thread entry ${record.id} on belief ${record.thread}`,
        `  ${record.author} · ${minute(record.at)}`,
        indent(record.text),
        ...reverse,
      ].join("\n");
  }
};

export const formatHookPreviewText = (payload: HookPayload) =>
  payload.additionalContext ?? "(the hook would inject nothing: no accepted or rejected belief matches this prompt)";

/** Every core failure as a sentence. Exhaustive: a new `TasteError` fails to compile until it has one. */
export const formatTasteErrorText = (error: TasteError): string =>
  Match.valueTags(error, {
    NearRepeatRefused: (refused) => formatRefusalText(refused.matches),
    StoreNotInitialised: (missing) =>
      `taste: No store at ${missing.root}. Run \`taste init\` or \`taste seed\`, or pass --store / set TASTE_STORE.`,
    StoreAlreadyExists: (existing) => `taste: A store already exists at ${existing.root}.`,
    StoreNotEmpty: (full) => `taste: The store at ${full.root} already holds ${full.recordCount} records; seed needs an empty store.`,
    InvalidRecordInput: (invalid) => `taste: ${invalid.message}`,
    UnknownRecordRef: (unknown) => `taste: No ${unknown.expected} matches "${unknown.ref}".`,
    AmbiguousRecordRef: (ambiguous) => `taste: "${ambiguous.ref}" matches several records: ${ambiguous.candidates.join(", ")}`,
    CorruptRecordFile: (corrupt) => `taste: Unreadable record file ${corrupt.path}: ${corrupt.message}`,
    DecisionNotAllowed: (refused) => `taste: ${refused.message}`,
    DecisionLockTimeout: (timeout) => `taste: Another process held ${timeout.lockPath} too long.`,
    StoreWriteFailed: (failed) => `taste: Write failed at ${failed.path}: ${failed.message}`,
  });
