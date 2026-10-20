/**
 * Taste core: the one module the CLI, server functions, hook and tests import. Every operation is an
 * Effect needing `TasteStore`; provide it with `provideTasteStore(root)`, root from `resolveStoreRoot`.
 * Refs accept a full id, the file's short id, or a unique id prefix.
 */
import { Effect } from "effect";
import type { InvalidRecordInput, StoreNotInitialised } from "./errors.ts";
import { makeTasteStoreLayer, type TasteStore } from "./store.ts";

export { InvalidRecordInput, StoreNotEmpty, type TasteError } from "./errors.ts";
export { type HookPayload, buildHookPayload } from "./hook-payload.ts";
export { formatLocalIsoTime } from "./ids.ts";
export {
  LISTEN_HEARTBEAT_MS,
  LISTEN_POLL_MS,
  type ListenerHeartbeat,
  listListenerHeartbeats,
  pollListenerEvents,
  writeListenerHeartbeat,
} from "./listener.ts";
export {
  appendAgentThreadReply,
  appendOwnerThreadNote,
  captureMemory,
  decideBelief,
  decodeCaptureMemoryInput,
  decodeProposeBeliefInput,
  type InboxCard,
  type InboxGroup,
  listInboxGroups,
  type ProposeResult,
  proposeBelief,
} from "./operations.ts";
export { listContextBeliefs, type RecallResult, recallBeliefs } from "./recall.ts";
export {
  type CaptureMemoryInput,
  type CaptureMemoryInputFields,
  type MemoryRecord,
  type ProposeBeliefInput,
  type ProposeBeliefInputFields,
  type ThreadEntryRecord,
} from "./records.ts";
export { rebuildStoreIndex, TasteStore } from "./store.ts";
export { initStore, listRecordFiles, resolveStoreRoot } from "./store-files.ts";
export {
  type BeliefSummary,
  type BeliefView,
  getBeliefView,
  listBeliefRows,
  type RecalledBelief,
  type RepeatMatch,
  type ShowResult,
  showRecord,
} from "./views.ts";

/** Provides an open store to `effect` and closes its index afterwards. */
export const provideTasteStore =
  (root: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E | StoreNotInitialised | InvalidRecordInput, Exclude<R, TasteStore>> =>
    Effect.provide(effect, makeTasteStoreLayer(root));
