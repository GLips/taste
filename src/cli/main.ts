#!/usr/bin/env bun
/** `taste`: the CLI. Exit codes: 0 ok, 2 invalid input, 3 near repeat refused, 1 unexpected. */
import { Cause, Effect, Exit } from "effect";
import { Command } from "effect/cli";
import {
  captureCommand,
  contextCommand,
  hookCommand,
  initCommand,
  proposeCommand,
  recallCommand,
  reindexCommand,
  showCommand,
  threadCommand,
} from "./commands.ts";
import { reviewCommand } from "./review.ts";
import { cliPlatformLayer, reportCliFailure } from "./runtime.ts";
import { seedCommand } from "./seed.ts";

const tasteCommand = Command.make("taste").pipe(
  Command.withDescription("Human-ratified beliefs for agents, from the human's own words"),
  Command.withSubcommands([
    initCommand,
    seedCommand,
    captureCommand,
    proposeCommand,
    recallCommand,
    contextCommand,
    showCommand,
    reindexCommand,
    reviewCommand,
    threadCommand,
    hookCommand,
  ]),
);

const exit = await Effect.runPromiseExit(
  Command.run(tasteCommand, { version: "0.1.0" }).pipe(Effect.provide(cliPlatformLayer)),
);
if (Exit.isFailure(exit)) {
  const failed = exit.cause.reasons.find(Cause.isFailReason);
  process.exitCode = reportCliFailure(
    failed ? { _tag: "Fail", error: failed.error } : { _tag: "Die", defect: Cause.squash(exit.cause) },
    process.argv.includes("--json"),
  );
}
