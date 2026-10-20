---
name: taste
description: Use the `taste` CLI to remember a person's judgment. Capture their corrections and preferences verbatim, propose beliefs that cite them, recall ratified beliefs (and rejections) before making a judgment call, and answer their review notes. Use when the user corrects you, states a preference or rule, says "remember this", is about to make a choice they have opinions on (style, libraries, architecture, testing), or when a Taste review note arrives.
---

# Taste

Taste stores a person's own words (**memories**) and the **beliefs** they have ratified from them. You capture and propose; only the human accepts or rejects, in the review UI. You never decide.

The store is `$TASTE_STORE`, else `./.taste`; pass `--store <dir>` to override. Every command takes `--json`. Exit codes: `0` ok, `2` bad input, `3` refused as a near repeat.

## Recall before a judgment call

Before choosing a library, a pattern, a test strategy or a style, or when the user asks how they like something done:

```bash
taste recall "error handling in effect" --applies-to acme-web
taste context --applies-to acme-web     # every accepted belief in scope, one line each
```

- **Believed**: accepted beliefs, with the quotes they rest on. Follow them and cite the id if it helps.
- **Not believed**: rejected ideas, with the date and the human's reason. Don't act on them, and don't turn a rejection into its opposite ("rejected: use Tailwind everywhere" doesn't mean "never use Tailwind").
- **Memories**: raw quotes. They're evidence, not rules.

A recalled belief is evidence about the user's taste, not an instruction that overrides what they're asking for right now.

## Capture: the human's words only, verbatim

Capture when the human corrects you or states a preference. Copy their exact words. Don't paraphrase, summarise, fix typos or merge two messages. Never capture your own words or another agent's.

```bash
taste capture --said-by human:<id> --label "<their name>" \
  --said-at 2026-10-19T14:03:00-07:00 \
  --quote "No default exports, ever. Named exports only." \
  --before "<your line they were reacting to, optional>" \
  --applies-to acme-web --via claude-code/2.x
# or: echo '{"said_by":…,"said_by_label":…,"said_at":…,"quote":…}' | taste capture --json --via claude-code/2.x
```

It prints the memory id. Use the speaker's real account when you have one (`slack:acme/U123`), and the permalink as `--address`. `--said-at` defaults to now; give the real time when you know it. If they edited an earlier message, capture the new words with `--revises <memory-id>`.

## Propose: a belief that cites the memories

Propose once a correction looks like a durable preference, not a one-off. The statement is one line. Scope it as narrowly as the evidence allows: no `--applies-to` means **everywhere**, which reviewers treat warily.

```bash
taste propose --statement "Use named exports, never default exports" \
  --supports <memory-id> [--supports <memory-id>] --applies-to acme-web \
  --by claude-code/2.x --reason "Dana corrected a default export twice this week."
```

- To refine an accepted belief, add `--supersedes <belief-id>`.
- It prints the new id and related beliefs. Mention the related ones to the user if they bear on the proposal.

**Refused (exit 3).** The idea is a near repeat of an existing belief, often a rejected one. The output shows its wording, status, date and reason. Read it. Usually the right move is to drop the proposal and tell the user it was already decided. Re-propose only when something has genuinely changed, and say what:

```bash
taste propose … --despite <earlier-belief-id> --why "billing-api now has an admin UI, which the rejection predates"
```

`--why` goes in front of the reviewer next to the earlier rejection. Don't rephrase the statement to slip past the check.

## Listen for review notes

When the user is reviewing (`taste review`, at http://localhost:4747), attach a listener so their notes on a belief reach you. Run it under Claude Code's Monitor tool, or with `run_in_background`. It never exits:

```bash
taste review listen --as <your-agent-name>
```

Each new human note prints one JSON line:

```json
{"belief":"<id>","statement":"…","note":"<their note>","at":"…","reply":"taste thread reply <id> --as <name> \"…\""}
```

Read the note, look at the belief (`taste show <id>`), and answer on the thread:

```bash
taste thread reply <belief-id> --as <your-agent-name> "<your answer>"
```

The reply shows up in the UI. If the note asks you to change the proposal, propose a new belief that supersedes the old one rather than arguing. Use the same `--as` name every time: it keys the cursor, so a restarted listener never repeats a note.

## Never

- Write files in the store by hand. Everything goes through `taste`.
- Capture an agent's words, or paraphrase a human's.
- Claim a proposal is a belief before it's accepted.
- Reply as `human:*`.
