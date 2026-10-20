---
date: 2026-10-19
topic: taste
---

# Taste: an opinionated memory layer for agents

## What We're Building

An opinionated memory layer for agents. You bring the sources and the agents. It keeps people's words verbatim with provenance, turns patterns into beliefs a human ratifies, never forgets a rejection, and gives agents the right belief at the right time. Taste is the only home for these beliefs; they are never baked into other files.

Why "taste": execution is cheap now that agents do it, so a person's judgment is the moat. Taste takes the ad hoc decisions and judgments a person brings and makes them available to agents at the right moment, seamlessly, while the person can still see and correct what agents are given.

It's a product from day one, so the boundary stays clean. Graham is the first user, through tk2's sweep, the Obsidian journal and Claude Code sessions, but not the design target. Those are callers that hand it memories and ask it questions. The gap it fills is real. The 2026-10-19 prior-art scout found that no major memory system has human-ratified beliefs that stay frozen once accepted, or rejections that get read back. Graphiti, mem0, Cognee and Supermemory all let an LLM overwrite facts on its own.

Background is in `~/research/2026-10-19-matt-pocock-personal-wiki.md` (Matt Pocock's wiki, Karpathy's LLM wiki) and in the Yak memory, builder and oracle packages (`yak-sh/yak@4383cd9`).

## Requirements

- **R1 (must)**: Memories are humans' words, verbatim and attributed. Each is a snapshot taken at capture time, holding the words and a bounded excerpt of the surrounding context. Each also carries the source's address when one exists, and may carry an opaque attachment (a whole thread or transcript). · works when every memory can be understood from what's stored, even after the source is edited or deleted.
- **R2 (must)**: Agents propose beliefs; a human accepts, edits or rejects them in batches; an accepted belief never changes on its own. · works when a week's proposals can be reviewed in under 10 minutes, and nothing accepted is reworded later without a new ratification.
- **R3 (must)**: Rejected and superseded beliefs are kept, and they surface when an agent proposes or acts on the same idea. · works when re-proposing a rejected belief comes back with its date and reason before it reaches the human.
- **R4 (must)**: Sources and agents are brought by the user. It fetches nothing. Any agent reads and writes through one standard interface. · works when the sweep, tk2 and a plain Claude Code session all use it without custom glue code.
- **R5 (must)**: A human can read and audit everything without the product running. · works when someone can answer "why does the agent believe X" from what's stored alone.
- **R6 (nice)**: Narrow passive injection: a high similarity cutoff, a few items, labelled as evidence, visible to the user and correctable on the spot.

## Scope

- **In:** memories, beliefs (proposal, ratification, rejection, supersession), recall and injection, the interface agents use.
- **Out:**
  - Fetching or ingesting sources. That's the caller's job: sweeps, Executor, scouts.
  - Agent-authored memories.
  - Topics, oracles, and decay or warmth ranking. Agents can crawl, so these are ceremony at this scale.
  - Beliefs that change on their own.
  - Summarised memories.
  - Pages: beliefs written into other files (CLAUDE.md sections, wiki pages, client briefs). See D7.

## Key Decisions

- **Product from day one, with Graham as first user:** building for strangers keeps the boundary clean.
- **The model is enforced; the mechanics are guidance:** the content model's invariants are enforced and can't be configured. Memories are human words, verbatim, attributed and snapshotted; beliefs change only through a human; rejections are kept. Mechanics are documented best practice with defaults the user can change: excerpt size, injection thresholds, review cadence, item counts. We'll learn the right numbers by using it.
- **Writers and readers:** a writer is whatever saves memories through the interface (a sweep's scout, a Claude Code session, a tk2 hook, an import script). A reader is whatever queries it. One agent is often both. Writers know their sources, so they choose the excerpt.
- **Memories come from any human, always attributed, and the speaker decides what a memory can ground:** the user's own words can ground beliefs about how they work. Someone else's words ground only beliefs about that person's world ("Acme dropped the B2B portal, 14 Oct"). An agent's words ground nothing; the agent is recorded only as who saved the memory.
- **A belief is a proposal a human ratified, not a builder's output:** this removes Yak's rebuild cascade. Contradicting evidence raises a new proposal and never rewrites the belief.
- **A memory is a snapshot, never a mirror:** context is frozen when the memory is captured. A later edit to the source becomes a new memory, never an update. That keeps all source-specific syncing out of the product, and the one generic shape is filled in by the caller.
- **Rejections are first-class:** a crawl can rebuild what was said, never what was decided against.
- **Store a conclusion only if a human reviews it, and compute everything else on read:** that's what removes the need for topics, oracles and eager maintenance.
- **D1, append-only files are the source of truth:**
  - Every record (memory, belief revision, decision) is its own markdown file with YAML frontmatter, and no file is ever edited.
  - A SQLite index (full text, optionally vectors) is a rebuildable cache.
  - The folder's location is configurable: a git repo, an Obsidian vault, Dropbox.
  - Why: the model is append-only by nature. Writers only create files, so concurrent writers and git/Dropbox merges never conflict. One decision file makes ratification atomic. And the folder itself is the audit trail (R5).
  - Rejected: a database first (fails R6 and needs infrastructure), and editable files (writers clobber each other, ratification can't be atomic).
  - No database adapter until a second user needs one.
- **Links only point back in time:** a new record names older ones in its frontmatter (a belief's `cites` and `supersedes`, a decision's `accepts` or `rejects`, a memory's `revises`). No record is edited to point forward. Questions like "what superseded this" or "what cites this" are reverse lookups, answered by the index, by grep, or by Obsidian backlinks if ids are wikilinks. A memory is never false ("on 14 Oct, Dana said X" stays true), so truth and supersession live on beliefs. Memories link to each other only through `revises`.
- **D3, the record model** (prior art: `~/research/2026-10-19-agent-memory-format-prior-art.md`):
  - **Every record:** `id` (stable, independent of the path), `type` (Memory, Belief, Decision, Thread, Person link), and `schema_version`. `type` alone makes the folder valid OKF v0.2. Use OKF's actor convention: `human:<id>`, `<agent>/<version>`, `process:<id>`. Times are ISO with an explicit offset. Frontmatter values are read as strings, never coerced, after the PyYAML bug OKF found. Frontmatter holds simple values and lists only; long text goes in the body.
  - **Memory:** `said_by` is a source account, such as `slack:<workspace>/<user>`, plus a display label. Also `said_at` and `said_at_precision`, `captured_at`, `captured_via`, an optional `address`, an optional `applies_to` hint, an optional `revises`, and `attachments` (content hashes). The body holds the exact quote, plus the text just before and after it as a frozen excerpt, following W3C Web Annotation's quote selector.
  - **Belief revision:** a short `statement`, `applies_to` (a flat, free-form list; leaving it out means everywhere), optional `valid_from` and `valid_until`, `subject`, `supports` and `contradicts` (typed citations of memories or beliefs), an optional `supersedes`, and `proposed_by`. The body holds the reasoning.
  - **Decision:** a single `target`, `outcome` (accept, reject or retract), `by` (always `human:`), `at`, and `reason` (required for reject). Current status is computed from decisions, never written onto a belief. Accepting a revision that supersedes another retires the old one.
  - **People are not accounts:** source accounts are what get recorded. Linking an account to a person is a decision you ratify, never merged automatically by name or email.
  - **The speaker rule is a warning at review time,** not a hard rejection: a belief whose subject is the owner should cite at least one of the owner's memories.
  - **Operational rules:** writers refuse to overwrite an existing id. Dropbox or sync conflict copies and duplicate ids are detected. Generated files (`index.md`, views) never live in the folder; they're built from it.
  - **Rejected:** hierarchical scope paths (a belief often applies to several projects), a scope registry, and OKF's mutable-page lifecycle (`status`, `verified`) for core records.
- **D8, the layout is by kind, then month:**
  - Folders: `memories/`, `beliefs/` and `decisions/`, each split by `YYYY/MM/`. Review threads go in `threads/YYYY/MM/` (D4).
  - Other paths: `attachments/` is content-addressed by sha256. `.index/` holds the rebuildable SQLite cache and is gitignored. A root `taste.yaml` holds the owner (`human:<id>`), the schema version and the user's defaults. It's the one file that can be edited, like a `.gitignore`.
  - Filenames: `<date>[-<slug>].<short-id>.md`. The full id is a UUIDv7 in the frontmatter. Uniqueness is guaranteed by refusing to overwrite and retrying.
  - Slugs: optional and supplied by the writer, never generated from content. Memories default to date and id, so verbatim words never end up in filenames, sync logs or git history.
  - Erasure: the one true delete removes the file and writes a tombstone decision that holds the reason but none of the content.
  - Rejected: a folder per date holding every kind (it mixes beliefs with high-volume memories), and flat folders per kind (`memories/` grows without bound).
- **D2, CLI first with MCP as a thin layer over it:**
  - One core library. A CLI does everything. An MCP server exposes the same operations for agents with no shell (claude.ai, desktop apps, hosted runs). A shipped skill or `AGENTS.md` snippet teaches the usage.
  - Reads can also go straight to the files, which R5 needs anyway. Writes must go through the product, because it's the one gatekeeper for append-only records, id uniqueness, the schema and the speaker rule.
  - Why: the CLI works in every agent with a shell and in scripts, cron and sweeps; it costs no context until used; it matches `tk` and `oracle`.
  - Rejected: MCP first (pays a context cost in every session and is worse for scripts), library first (no value for the first user until someone builds on it), and Anthropic memory-tool compatibility. Its `str_replace`, `delete` and `rename` operations are the edit-in-place model D1 rejected.
- **D5, a model-free core plus a shipped skill:**
  - Four documented triggers produce proposals: the human says so, repeated corrections, a scheduled pass over new memories, and a new memory contradicting an accepted belief. That last one produces a proposed revision with `supersedes`. An agent proposing something it noticed mid-task is allowed but not encouraged.
  - The CLI is deterministic. `taste propose` validates the proposal, checks for repeats against every belief including rejected and superseded ones, then writes and indexes it.
  - Repeat checking uses full-text search by default, plus vectors if the user configures an embedding model, which is the core's only optional model use. On a close match it refuses until the agent re-proposes with `--despite <belief> --why "…"`. The belief records `despite` (a new D3 field) so the reviewer sees the earlier rejection and the agent's case.
  - Distillation, repeated corrections and contradiction proposals come from a shipped skill that the user's own agents run (a sweep, cron, `/loop`, the weekly recap).
  - The product can own the schedule without owning the model. The user configures how to invoke their agent headless (for example `claude -p "/taste distill"`), and an optional shipped scheduler, likely a background daemon that starts at login, runs that command on a cadence. Anyone with their own scheduler skips it. The core still never calls a model; it runs a command the user wrote. The exact shape (daemon versus OS-native launchd/systemd units, how the agent helps set it up) is for planning.
  - Why: it fits bring-your-own agents, puts no keys or costs inside the product, is testable, and the skill is easy to adapt. Rejections are read back at the moment of proposing, which is where the Agent Memory Atlas found most systems fail.
  - Rejected: the product running distillation itself (it would own model config, cost and prompt quality, and compete with the user's agents).
- **An edited source becomes a revising memory:** the writer saves a new memory with the same address and a link to the one it revises. The original stays as history. Beliefs that cite it are flagged as drifted and come back for review (R2). Detecting the edit is the writer's job, for example by re-checking the addresses live beliefs cite on a schedule the user configures.

- **D4, a local web review UI with agent threads:** `taste review` serves a local web page where proposals arrive grouped by subject in budget-sized batches. You triage them with the keyboard, accept a whole group at once, and see the quotes, any earlier rejection and any `despite` case inline. Any card can hold a comment thread with an agent. The agent attaches through a long-lived CLI process it backgrounds, and that process wakes it whenever Graham adds a note, which fixes the media-studio problem of agents never hearing replies. Decisions are written through `taste decide`.
  - **Stack (adopted):**
    - Bun, shipped as standalone `bun build --compile` binaries cross-compiled per platform. Users don't need Bun. Distribution is through GitHub releases, Homebrew, and npm with per-platform optional packages.
    - Effect v4 for the core and the CLI. Its v4 CLI module location is unverified.
    - `bun:sqlite` for the `.index/` cache only. It can be deleted and rebuilt from the files, and is never synced or edited. A v4 Bun SQLite adapter is unverified.
    - The review UI is TanStack Start in SPA mode with Router, Query, Form and Hotkeys, plus Mantine and StyleX, following media-studio and tk2.
    - Push: a watcher on the store folder fans out over WebSocket, so edits made outside `taste` (Dropbox, git, by hand) show up too.
    - Agent wake: `taste review listen` never exits and prints one line per human note. It runs under Claude Code's Monitor and keeps a cursor per listener, so several agents can listen at once. This fixes media-studio's one-shot `watch`, which exits on every change.
    - Tooling: oxlint, oxfmt, vitest with `@effect/vitest`, lefthook (from tk2).
  - **Packaging:** `taste daemon` is an optional launchd or systemd unit that hosts the D5 scheduler and the review server at a stable localhost URL, and sends native notifications when proposals are waiting. MCP needs no daemon, because stdio MCP is started by each client session. A desktop or menubar shell (Electrobun or Tauri) can come later as a thin wrapper over the same server; it is not day one, because signing, notarisation and auto-updates would come before the model is validated.
  - Comment threads are durable, append-only records: one file per entry in `threads/YYYY/MM/`, each with an actor. A decision cites its thread, so a future agent sees why something was rejected and not only that it was. A human's words in a thread can ground later memories.

- **D6, pull retrieval by default, with hooks opt-in at install:**
  - `taste recall "<text>" [--applies-to <scope>] [--as-of <date>]` (CLI, or the MCP tool) returns accepted beliefs that are in scope and currently valid first, each with its quotes, followed by matching memories. The shipped skill tells agents when to call it.
  - A query that matches a rejected belief returns it marked as not believed, with the date and reason. Superseded beliefs are hidden unless `--history` is passed.
  - `taste context --applies-to <scope>` prints every accepted belief for a scope, for a SessionStart hook. It is never written into files.
  - Passive injection (R6) is a Claude Code `UserPromptSubmit` hook that the user turns on at install. It works in the narrow Yak style: a hard time limit, at most three items, accepted beliefs and rejections only, labelled as evidence rather than instructions, and matched by full-text search unless an embedder is configured.
  - Why: agents decide when to recall, so nothing is injected without the user choosing it, and rejections come back on every match.

- **D7, no pages:** beliefs are mostly one line, and they reach agents only through recall (CLI or MCP, with embedding search over vaguely worded queries when configured) and injection (D6). Taste is the one home for beliefs, so they are never baked into CLAUDE.md, wiki pages or other projects; a copy would go stale and split the source of truth. The user's confidence comes from Taste giving agents the right thing at the right time, not from files they maintain. This removes the pages requirement, page build records, the `pages/` folder and page drift. Drift now applies only to beliefs whose memories were revised.

## Open Decisions

_None. Remaining questions are under Not Yet Specified._

## Not Yet Specified

- **Identity:** D3 settled the model: accounts are recorded, and linking an account to a person is a ratified decision. Still open: who proposes the links, and how a reader asks "everything Dana said" across accounts.
- **Privacy:** verbatim client email and call quotes are stored, so redaction, deletion requests and confidentiality across clients need an answer. When a source is deleted, its memory stays (R1), even though the person may expect it gone. And append-only files mean a true erasure is the one edit the model must allow. OKF has the same problem open as issue #32: when a bundle crosses a trust boundary, are sources dropped, redacted or revealed?
- **Sharing:** team or shared memory. Possibly Scope: Out.
- **Cold start:** bringing in existing material, such as CLAUDE.md lines, the gotchas in the `sourcing` skill, and per-client context notes.
- **Scale:** where crawling stops being enough and an index or cache becomes necessary.
- **Release:** the name is Taste (maybe "tasteful memory"), repo `~/Programming/taste`. The licence is open. Distribution follows D4 (standalone binaries). There is no hosted service: corporate users trust local files and R5's audit-without-the-product more than a new SaaS, and nobody is likely to pay for hosting the current scope. If it is ever sold, the likely place is team sharing with per-client confidentiality, or a polished desktop app.

## Ideas to shape later

Graham's notes, kept even where they are not shaped yet:
- **Injections are visible.** The user sees what the hook or Claude Code mod injected into a session.
- **"That's wrong" opens a review on the spot.** When an injection looks wrong, the user calls a skill. It immediately spawns a background subagent, so the current task isn't interrupted. The subagent opens the review UI in the browser where the user chats with it, preloaded with everything injected in the conversation it was spawned from.

## Pieces
