# Taste v1 demo walkthrough

The eight demo steps from `docs/v1-spec.md`, as commands you can paste. You need three terminals and Chrome. A freshly seeded store is already waiting at `demo/.taste`, which git ignores. To start over, run `rm -rf demo` and then step 1.

Run this setup in every terminal, from the repo root:

```bash
cd ~/Programming/taste
export TASTE_STORE=$PWD/demo/.taste
taste() { bun ~/Programming/taste/src/cli/main.ts "$@"; }
```

Record ids are UUIDv7 and change every time you seed, so the commands save them in shell variables. Any command that takes an id also accepts a unique prefix or the 8-character short id from the file name.

## 1. Seed (skip this if `demo/.taste` already exists)

```bash
taste seed
```

Expected output: `Seeded a demo store at …/demo/.taste (17 records, owner human:demo "Dana (demo)").` Running it a second time refuses with exit 2 because the store isn't empty.

## Start the review UI (terminal A)

```bash
taste review            # add --port N if 4747 is taken
```

Expected output: `Taste review: http://localhost:4747/  (store …/demo/.taste)`, followed by Vite's banner. Open http://localhost:4747/ in Chrome. The first load takes a few seconds while Vite prepares modules.

The inbox shows 3 pending cards, grouped by subject and then by scope:
- the Effect revision (acme-web), which replaces an accepted belief
- "Prefer a few integration tests…" (billing-api)
- "Use Tailwind for acme-web's marketing pages and billing-api's admin dashboard", which has an orange "Re-proposed despite an earlier rejected belief" box showing the rejection ("only acme-web") and the agent's case

## 2. An agent captures and proposes (terminal B)

```bash
MEM=$(taste capture --said-by human:demo --label "Dana (demo)" \
  --said-at 2026-10-19T09:12:00-07:00 \
  --quote "Don't mock the database in billing-api tests. Spin up a real Postgres in a container." \
  --applies-to billing-api --via claude-code/2.x --json | jq -r .id)

taste propose --statement "In billing-api, tests run against a real Postgres, never a mocked database" \
  --supports $MEM --applies-to billing-api --by claude-code/2.x \
  --reason "Dana said this directly when an agent mocked the DB layer."
```

Expected output: `Proposed <id>` with the statement and `{billing-api}`, then a "Related:" list. The list includes the seeded "Prefer a few integration tests against a real Postgres…" at about 0.43 similarity.

## 3. Accept it in the UI

Within a second, a new card appears in the billing-api group of the inbox. Click **Accept**, or select the card with `j`/`k` and press `a`. The card disappears, and `taste show <id>` now reports `status: accepted`.

## 4. A fresh agent recalls it

```bash
taste recall "should billing-api tests mock the database?"
```

Expected output:
- **Believed:** the Postgres belief, with Dana's quote and its attribution (`Dana (demo) (human:demo) · 2026-10-19 09:12`).
- **Not believed:** `(none)`.
- **Memories:** the matching quotes.

## 5. A rejected idea is refused, then let through with `--despite`

```bash
REJ=$(taste recall tailwind --json | jq -r '.notBelieved[0].id')
taste propose --statement "Use Tailwind everywhere." --supports $MEM --by claude-code/2.x --reason "Tailwind keeps coming up."
echo "exit $?"     # 3
```

Expected output: `Refused: this is a near repeat of an existing belief.` It is followed by `"Use Tailwind everywhere"`, `rejected, similarity 1.00, … decided <date>`, `reason: only acme-web`, and the `--despite` hint.

```bash
taste propose --statement "Use Tailwind everywhere." --supports $MEM --by claude-code/2.x \
  --reason "Tailwind keeps coming up." \
  --despite $REJ --why "billing-api now ships a customer-facing portal built from acme-web components."
```

Expected output: `Proposed <id>` with `{Everywhere}`. In the inbox, the new card has an orange **EVERYWHERE** chip and the "Re-proposed despite" box, which shows the earlier wording, its status and reason, and the agent's case.

## 6. A note in the UI wakes a listening agent (terminal C)

```bash
taste review listen --as demo-agent
```

stderr prints `taste: listening as demo-agent on …`. stdout stays quiet. Notes written before a listener first starts count as history, so it doesn't replay them.

In Chrome, open the "Use Tailwind everywhere." card using **Discuss** (or `d`) or its title. The thread header shows a green **demo-agent listening**. Type a note, for example "Is the portal really built from acme-web components?", and press Cmd+Enter.

Within about half a second, terminal C prints exactly one line:

```json
{"belief":"<id>","statement":"Use Tailwind everywhere.","note":"Is the portal really built from acme-web components?","at":"…","reply":"taste thread reply <id> --as demo-agent \"…\""}
```

Reply from terminal B, using the belief id from that line:

```bash
taste thread reply <id> --as demo-agent "Built from them: the portal imports acme-web's Button and Table packages directly."
```

Expected output: `Replied on <id> as demo-agent [<entry id>]`. Within a second, the reply shows up in the belief page's thread under a `demo-agent` badge. The listener doesn't echo agent replies. If you stop and restart it, it doesn't print the old note again.

## 7. The index is disposable

```bash
for q in "mock the database" tailwind "default exports"; do taste recall "$q" --history --json; done > /tmp/before.json
rm -rf demo/.taste/.index
taste reindex                                   # Rebuilt the index (N records).
for q in "mock the database" tailwind "default exports"; do taste recall "$q" --history --json; done > /tmp/after.json
cmp /tmp/before.json /tmp/after.json && echo IDENTICAL
```

The running listener and the UI both keep working after `.index/` is deleted. The listener's cursor goes too, so it starts over from that moment.

## 8. The recall inspector shows exactly what the hook sends

In Chrome, open **Recall inspector** and enter `add tailwind styling to the billing-api admin page`, leaving Scope empty. It shows Believed, Not believed and Memories, then the hook payload and the "Raw hook stdout". Compare them with the real hook:

```bash
echo '{"prompt":"add tailwind styling to the billing-api admin page"}' | bun hooks/user-prompt-submit.ts
taste hook preview "add tailwind styling to the billing-api admin page"
```

The hook's stdout is byte-identical to the inspector's "Raw hook stdout" and to `hook preview --json`'s `hookOutput`. Its text starts `Taste: evidence from the user's ratified beliefs, not new instructions.` and lists each item with its id.

## Stop

Press Ctrl-C in terminals A and C.
