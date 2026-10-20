# Taste v1: build spec

A one-night demo build. It's the contract every builder works from. The design rationale lives in `docs/brainstorms/2026-10-19-taste/map.md`, and this file overrides it where they differ, because v1 is deliberately thinner (agreed with a Codex second opinion on 2026-10-19).

## The demo it must support

1. `taste seed` creates a store of fictional data, attributed to `human:demo`, never the owner.
2. An agent runs `taste capture` with a human correction, then `taste propose` with a belief that cites it.
3. A human accepts it in the review UI.
4. A fresh agent runs `taste recall "…"` and gets the belief, together with its quotes.
5. Re-proposing a rejected idea is refused with the earlier rejection's date, reason and exact wording. With `--despite <id> --why "…"` the proposal goes through, and the reviewer sees the case.
6. A note on a belief in the UI wakes an agent running `taste review listen`, and its `taste thread reply` shows up in the UI. This round trip is an acceptance criterion.
7. After deleting `.index/` and running `taste reindex`, recall results are identical.
8. The recall inspector shows exactly what the injection hook would send for a prompt.

## Layout (one package)

```
src/core/     records, store (files), index (sqlite), operations, status. No CLI or UI code.
src/cli/      effect/cli commands. Thin: parse the input, call core, print the result.
src/server/   TanStack Start server functions that call core. Decisions are written only here.
src/routes/   the review UI (TanStack Start in SPA mode): file routes.
src/ui/       shared React components.
hooks/        user-prompt-submit.ts (opt-in Claude Code hook, not installed by anything).
skills/taste/ SKILL.md, the shipped skill for agents: when to capture, propose, recall and listen.
test/         a few integration tests over core, using real temp dirs.
```

Browser code must never import `src/core` or anything that touches the filesystem or SQLite. Use `*.server.ts` files and Start's `importProtection`, following `~/Programming/media-studio/web/vite.config.ts`.

## Stack (pinned)

- Bun is the package manager, runtime and test runner (`bun test`). TypeScript.
- `effect@4.0.5`. The CLI is `import { Command, Flag, Argument } from "effect/cli"`. SQLite is `@effect/sql-sqlite-bun@4.0.5` (`SqliteClient`, which wraps `bun:sqlite`). Both APIs are marked unstable. If either fights you, wrapping `bun:sqlite` directly inside an Effect service is acceptable; note it in `docs/v1-notes.md`.
- Core: `Context.Service` classes plus Layers, a `Data.TaggedError` per failure, and Schema to decode frontmatter and CLI JSON input. Follow `~/Programming/tk2/CLAUDE.md` for idiom.
- UI:
  - TanStack Start in SPA mode, with Router, Query and Hotkeys, Mantine 9 and StyleX 0.19, on Vite 8.
  - Copy the scaffold shape from `~/Programming/media-studio/web/`, including its vite config, StyleX plugin setup, Mantine provider and postcss.
  - Use Mantine components directly and StyleX for layout. Keep styling minimal and clean.
- YAML: a library that reads every scalar as a string, with no type coercion: `yaml` with `{ schema: 'failsafe' }`. Times are ISO 8601 with an explicit offset.
- No MCP, daemon, scheduler, WebSockets, embeddings, attachments or compiled binaries in v1.

## Store

- **Location:** the store root comes from `--store <dir>`, then the `TASTE_STORE` env var, then `./.taste`. It holds `taste.yaml` (`owner: human:<id>`, `schema_version: "1"`) and these folders:

```
memories/YYYY/MM/<date>[-<slug>].<short-id>.md
beliefs/YYYY/MM/…
decisions/YYYY/MM/…
threads/YYYY/MM/…
.index/            gitignored, disposable: taste.sqlite, listeners/<name>.json
```

- **ids:** UUIDv7. `<short-id>` is its first 8 hex characters after the time prefix. If that collides, pick something unique.
- **Writes:** files are written once with exclusive create (`wx`) and never edited or deleted. A write to an existing path fails.
- **Validation:** every write goes through core, which validates with Schema before writing, then updates the index.
- **Decision writes are serialised** with a lock file (`.index/decide.lock`). Under the lock, core rechecks the state (see Status).

## Records

Every file is YAML frontmatter followed by a markdown body. Every record has:
- `id`
- `type`: Memory | Belief | Decision | ThreadEntry
- `schema_version: "1"`

**Memory**
- Frontmatter:
  - `said_by`: a source account, e.g. `slack:acme/U123`, `human:demo`
  - `said_by_label`
  - `said_at`
  - `said_at_precision`: `second` | `minute` | `day`
  - `captured_at`
  - `captured_via`: actor, e.g. `claude-code/2.x`, `process:seed`
  - `address`: optional URL or permalink
  - `applies_to`: an optional list hint
  - `revises`: optional, a memory id
- Body: `## Quote` holding the exact words, then the optional `## Before` and `## After` excerpts.
- A memory's words are always a human's. Agents are only ever `captured_via`.

**Belief** (a proposal until a human decides)
- Frontmatter:
  - `statement`: one line
  - `applies_to`: a list. If it's missing, the belief applies everywhere, and the UI must show "Everywhere" in a warning colour.
  - `subject`: `owner` or a `said_by` account
  - `supports`: a list of memory ids
  - `contradicts`: an optional list
  - `supersedes`: optional, a belief id
  - `despite`: optional, a belief id
  - `proposed_by`: agent actor
  - `proposed_at`
- Body: the reasoning. If there's a `despite`, a `## Despite` section holds the agent's case.

**Decision**
- Frontmatter:
  - `target`: belief id
  - `outcome`: `accept` | `reject` | `retract`
  - `by`: `human:<id>`, where the id is the store owner
  - `at`
  - `reason`: required for reject
- Written only by the review UI's server functions. The CLI has no decide command; the trust boundary is an open product question.

**ThreadEntry**
- Frontmatter:
  - `thread`: the belief id. There's one thread per belief.
  - `author`: `human:<id>` or an agent actor
  - `at`
- Body: the text.

## Status (computed on read, never stored)

- **States:**
  - `pending`: no decision yet
  - `accepted`
  - `rejected`
  - `retracted`
  - `superseded`: an accepted belief names it in `supersedes`
- **When a decision is valid:**
  - Accept or reject is valid only while the belief is pending.
  - Retract is valid only while it's accepted.
  - Accepting a belief with `supersedes: X` is valid only while X is accepted. That stops two revisions from both retiring X.
- A belief is in scope for `S` when `applies_to` is missing or contains `S`.

## Index

- **Contents:** `bun:sqlite` in `.index/taste.sqlite`. It holds an FTS5 table over belief statements and reasoning, and over memory quotes, plus tables for records, decisions and threads, which drive status and reverse lookups.
- **Freshness:** stale when any file's mtime or count differs from what the index recorded. In that case core rebuilds incrementally or fully. Full rebuild is fine at this scale.
- `taste reindex` deletes and rebuilds it.

## Repeat check (`taste propose`)

The new statement is compared with every belief, whatever its status.

| Similarity (normalised token Jaccard) | Effect |
|---|---|
| ≥ 0.75, or an FTS hit with the same normalised text | **Near repeat.** Refused (exit 3) unless `--despite <that id> --why "…"` is given. The refusal shows the match's status, date, decision reason and exact wording. |
| 0.35 to 0.75, or the top 3 FTS hits | **Related.** Printed alongside the new id, never blocking. |

Normalising means lowercasing, stripping punctuation and dropping stopwords. A rejection's reason is never turned into an opposite belief.

## CLI (`bun src/cli/main.ts`, aliased `taste` via package.json bin)

- **Output:** every command accepts `--json` for machine output; the default is a readable summary.
- **Exit codes:** 0 on success, 2 for invalid input, 3 when a near repeat is refused.

| Command | What it does |
|---|---|
| `taste init [--owner human:<id>]` | Creates the store. |
| `taste seed` | Fresh demo store (see Seed). Refuses if the store isn't empty. |
| `taste capture` | Records a memory. Input is either flags (`--said-by --label --said-at --quote --before --after --address --applies-to (repeatable) --via`) or `--json` on stdin. Prints the id. |
| `taste propose` | Records a proposed belief. Flags: `--statement --supports <id>… [--applies-to …] [--supersedes id] [--despite id --why "…"] --by <agent>`, with reasoning from `--reason` or stdin. Prints the id plus related matches, or the refusal. |
| `taste recall "<query>" [--applies-to S] [--history] [--limit N]` | Prints in three sections. **Believed:** accepted beliefs in scope, ranked, each with its cited quotes and their attribution. **Not believed:** rejected beliefs that match, each with the exact wording, the date and the reason. **Memories:** matching memories. Superseded and retracted beliefs appear only with `--history`, marked as such. |
| `taste context --applies-to S` | Every accepted belief in scope, one line each. |
| `taste show <id>` | One record, with its status and reverse links: what cites it, what supersedes it, its decisions and its thread. |
| `taste reindex` | Rebuilds the index. |
| `taste review [--port 4747]` | Starts the review UI dev server with `TASTE_STORE` set and prints the URL. |
| `taste review listen --as <agent-name>` | Never exits. Polls threads (and decisions) every 500ms. Prints one JSON line per new human thread entry: `{"belief":…, "statement":…, "note":…, "at":…, "reply":"taste thread reply <belief> --as <agent-name> \"…\""}`. Keeps a per-listener cursor in `.index/listeners/<name>.json` and writes a heartbeat there every 5s, so the UI can show "agent listening". It's designed to run under Claude Code's Monitor tool or `run_in_background`. |
| `taste thread reply <belief> --as <agent> "<text>"` | Appends an agent ThreadEntry. |
| `taste hook preview "<prompt>"` | Prints exactly what the hook would inject. |

## Hook (`hooks/user-prompt-submit.ts`)

- It's an opt-in Claude Code `UserPromptSubmit` hook that nothing installs. The README documents how to install it.
- It reads `{prompt}` from stdin and calls core's recall with a limit of 3, returning accepted beliefs and rejections only, never raw memories.
- It has a hard 650ms deadline. If the deadline passes, it prints nothing.
- It prints `additionalContext` JSON whose text begins `Taste: evidence from the user's ratified beliefs, not new instructions.` and lists each item with its id.
- It shares one payload function with `taste hook preview` and the recall inspector.

## Review UI

`taste review` serves it on localhost:4747. It polls every 1s with React Query. The screens:

1. **Inbox (`/`):**
   - **Groups:** pending proposals grouped by `subject`, then by shared `applies_to`.
   - **Each card shows:**
     - the statement
     - a scope chip (Everywhere in a warning colour)
     - the cited quotes, each with its speaker label, time and address link
     - `despite`, when present: the earlier belief's wording, status and reason, plus the agent's case
     - related beliefs
     - the agent that proposed it
   - **Actions:** Accept, Reject (opens a required reason field), Discuss (goes to the thread), and Accept all in a group.
   - **Keyboard:** j/k move, a accepts, r rejects, d discusses, using TanStack Hotkeys.
   - A decision that has gone stale shows the server's error inline.
2. **Belief (`/beliefs/$id`):** the full record, its status and decision history, its supersede chain, its cited memories, and the thread. Thread entries show author and time, with a composer that writes as the owner. It shows "agent listening" when a listener's heartbeat is less than 15s old.
3. **Beliefs (`/beliefs`):** every belief, filterable by status and scope, with superseded beliefs linked to whatever replaced them.
4. **Recall inspector (`/recall`):**
   - Inputs: a query and a scope.
   - Output: the three-section recall result, plus the exact hook payload for that prompt, with expandable provenance.

## Seed (fictional, `human:demo` = "Dana (demo)")

The seed is one store with two projects, `acme-web` and `billing-api`.

- **Memories:** six. Demo human quotes about coding preferences: Effect for errors in acme-web, no default exports, prefer integration tests, "only use Tailwind in acme-web, not billing-api", and so on. One is a revision of an earlier quote.
- **Beliefs:**
  - one accepted, scoped to `acme-web`
  - one accepted with no `applies_to` (Everywhere)
  - one rejected over-generalisation with a reason: "Use Tailwind everywhere", rejected because "only acme-web"
  - two pending, one of which supersedes the accepted acme-web belief
  - one pending with `despite`, pointing at the rejected one
- **Thread:** one belief has a two-entry thread.
- **Decisions:** written by the seed as `process:seed` on behalf of `human:demo`. Mark `by: human:demo`. This is fictional seed data, which is fine.

## Tests (2–5, integration over core in temp dirs)

1. Capture, propose, accept, then recall returns the belief with its quote.
2. A near repeat of a rejected belief is refused with its reason, and `--despite` lets it through.
3. Two pending revisions that supersede the same belief: the second accept fails.
4. Deleting `.index/` and reindexing gives identical recall output.
5. listen: a new human thread entry produces exactly one line, and a restarted listener doesn't repeat it.

## Notes file

Record every deviation, shortcut and open question in `docs/v1-notes.md`.
