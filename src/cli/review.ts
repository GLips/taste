/** `taste review` (starts the UI dev server) and `taste review listen` (wakes an agent on human notes). */
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { Command, Flag } from "effect/cli";
import {
  LISTEN_HEARTBEAT_MS,
  LISTEN_POLL_MS,
  pollListenerEvents,
  provideTasteStore,
  writeListenerHeartbeat,
} from "../core/index.ts";
import { inCliStore, jsonFlag, printErrorLine, printLine, resolveCliStoreRoot, storeFlag } from "./runtime.ts";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

const listenCommand = Command.make(
  "listen",
  {
    as: Flag.String("as").pipe(Flag.withDescription("This agent's name; also names its cursor file")),
    // Accepted for uniformity: listen output is always one JSON object per line.
    json: jsonFlag,
    store: storeFlag,
  },
  ({ as, store }) =>
    Effect.gen(function* () {
      const poll = pollListenerEvents(as).pipe(
        Effect.flatMap((events) => Effect.forEach(events, (event) => printLine(JSON.stringify(event)))),
        Effect.andThen(Effect.sleep(LISTEN_POLL_MS)),
        Effect.forever,
      );
      const heartbeat = writeListenerHeartbeat(as).pipe(Effect.andThen(Effect.sleep(LISTEN_HEARTBEAT_MS)), Effect.forever);
      // stderr, so stdout stays one JSON object per line for Monitor.
      yield* printErrorLine(`taste: listening as ${as} on ${resolveCliStoreRoot(store)}`);
      yield* inCliStore(store, Effect.all([poll, heartbeat], { concurrency: "unbounded", discard: true }));
    }),
).pipe(Command.withDescription("Never exits: prints one JSON line per new human thread note"));

export const reviewCommand = Command.make(
  "review",
  {
    port: Flag.Int("port").pipe(Flag.withDefault(4747)),
    json: jsonFlag,
    store: storeFlag,
  },
  ({ port, json, store }) =>
    Effect.gen(function* () {
      const root = resolveCliStoreRoot(store);
      // Fails with StoreNotInitialised before a server starts against nothing.
      yield* provideTasteStore(root)(Effect.void);
      // `--bun`: the server functions import core, which needs bun:sqlite, so vite must run under Bun.
      const child = Bun.spawn(["bunx", "--bun", "vite", "--port", String(port), "--strictPort"], {
        cwd: REPO_ROOT,
        env: { ...process.env, TASTE_STORE: root },
        stdio: ["inherit", "inherit", "inherit"],
      });
      const url = `http://localhost:${port}/`;
      yield* printLine(json ? JSON.stringify({ url, store: root }) : `Taste review: ${url}  (store ${root})`);
      const code = yield* Effect.promise(() => child.exited);
      if (code !== 0) process.exitCode = code;
    }),
).pipe(
  Command.withDescription("Start the review UI on localhost"),
  Command.withSubcommands([listenCommand]),
);
