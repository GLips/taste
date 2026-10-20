#!/usr/bin/env bun
/**
 * Opt-in Claude Code `UserPromptSubmit` hook (nothing installs it; see README). Reads `{prompt, cwd}`
 * on stdin and prints the same payload `taste hook preview` shows: at most 3 accepted beliefs and
 * rejections, never raw memories. Store: `TASTE_STORE`, else `<cwd>/.taste`. Scope: `TASTE_SCOPE`
 * if set, else every scope (each item is labelled with its scope).
 */
import { Effect } from "effect";
import { buildHookPayload, provideTasteStore, resolveStoreRoot } from "../src/core/index.ts";

/** A prompt must never wait on taste: past this, print nothing and let the prompt through. */
const HOOK_DEADLINE_MS = 650;
setTimeout(() => process.exit(0), HOOK_DEADLINE_MS);

const input = JSON.parse(await Bun.stdin.text()) as { readonly prompt?: string; readonly cwd?: string };
const root = resolveStoreRoot({ env: process.env.TASTE_STORE, cwd: input.cwd ?? process.cwd() });

const payload = await Effect.runPromise(
  provideTasteStore(root)(buildHookPayload({ prompt: input.prompt ?? "", scope: process.env.TASTE_SCOPE || undefined })).pipe(
    // Installed globally, the hook runs in projects that have no store; that is not an error.
    Effect.catchTag("StoreNotInitialised", () => Effect.succeed(undefined)),
  ),
);
if (payload?.hookOutput !== undefined) process.stdout.write(payload.hookOutput);
process.exit(0);
