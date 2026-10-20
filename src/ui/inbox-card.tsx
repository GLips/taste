import { Alert, Box, Button, Divider, Group, Kbd, Paper, Stack, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { useNavigate } from "@tanstack/react-router";
import { AnchorLink, ButtonLink } from "./router-links.tsx";
import type { Ref } from "react";
import type { InboxCard } from "../core/index.ts";
import { BeliefScopeChips } from "./belief-chips.tsx";
import { BeliefSummaryLine } from "./belief-link.tsx";
import { formatTimeAgo, formatReviewTime } from "./format.ts";
import { MemoryQuote } from "./memory-quote.tsx";
import { RejectReasonForm } from "./reject-reason-form.tsx";
import { useReviewDecision } from "./use-review-decision.ts";

const styles = stylex.create({
  card: {
    transitionProperty: "box-shadow, border-color",
    transitionDuration: "120ms",
    borderLeftWidth: "3px",
    borderLeftStyle: "solid",
    borderLeftColor: "transparent",
  },
  selected: {
    borderLeftColor: "var(--mantine-color-indigo-5)",
    boxShadow: "0 1px 2px rgba(15,23,42,0.06), 0 4px 16px rgba(15,23,42,0.06)",
  },
  statement: { fontSize: "17px", fontWeight: 600, lineHeight: 1.35, letterSpacing: "-0.01em" },
  reasoning: { whiteSpace: "pre-wrap" },
  despite: {
    backgroundColor: "var(--mantine-color-orange-0)",
    borderRadius: "8px",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  label: { textTransform: "uppercase", letterSpacing: "0.06em", fontSize: "11px", fontWeight: 600 },
});

function SectionLabel({ children }: { children: string }) {
  return (
    <Text c="dimmed" {...stylex.props(styles.label)}>
      {children}
    </Text>
  );
}

/** Mounted only inside the selected card, so a/r/d always act on exactly one proposal. */
function SelectedCardHotkeys({ onAccept, onReject, onDiscuss }: { onAccept: () => void; onReject: () => void; onDiscuss: () => void }) {
  useHotkeys([
    { hotkey: "A", callback: onAccept },
    { hotkey: "R", callback: onReject },
    { hotkey: "D", callback: onDiscuss },
  ]);
  return null;
}

/** One pending proposal with everything needed to decide it without leaving the inbox. */
export function InboxProposalCard({
  card,
  selected,
  rejecting,
  onSelect,
  onRejectingChange,
  ref,
}: {
  card: InboxCard;
  selected: boolean;
  rejecting: boolean;
  onSelect: () => void;
  onRejectingChange: (open: boolean) => void;
  ref?: Ref<HTMLDivElement>;
}) {
  const { view, related } = card;
  const { belief } = view;
  const decision = useReviewDecision(belief.id);
  const navigate = useNavigate();
  return (
    <Paper ref={ref} p="md" onClick={onSelect} {...stylex.props(styles.card, selected && styles.selected)}>
      {selected && !rejecting && (
        <SelectedCardHotkeys
          onAccept={() => void decision.decide("accept")}
          onReject={() => onRejectingChange(true)}
          onDiscuss={() => void navigate({ to: "/beliefs/$id", params: { id: belief.id } })}
        />
      )}
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Group gap={6}>
            <BeliefScopeChips appliesTo={belief.applies_to} />
            {view.supersedes !== undefined && <Text size="xs" c="dimmed">revision</Text>}
          </Group>
          <Text size="xs" c="dimmed" title={formatReviewTime(belief.proposed_at)}>
            {belief.proposed_by} · {formatTimeAgo(belief.proposed_at)}
          </Text>
        </Group>

        <Text {...stylex.props(styles.statement)}>{belief.statement}</Text>
        {belief.reasoning.trim() !== "" && (
          <Text c="dimmed" {...stylex.props(styles.reasoning)}>
            {belief.reasoning.trim()}
          </Text>
        )}

        {view.supersedes !== undefined && (
          <Box>
            <SectionLabel>Replaces</SectionLabel>
            <BeliefSummaryLine summary={view.supersedes} />
          </Box>
        )}

        {view.despite !== undefined && (
          <div {...stylex.props(styles.despite)}>
            <Text size="xs" fw={600} c="orange.8">
              Re-proposed despite an earlier {view.despite.status} belief
            </Text>
            <BeliefSummaryLine summary={view.despite} />
            {belief.despite_case !== undefined && (
              <Box>
                <SectionLabel>The agent's case</SectionLabel>
                <Text {...stylex.props(styles.reasoning)}>{belief.despite_case}</Text>
              </Box>
            )}
          </div>
        )}

        <Box>
          <SectionLabel>{view.supports.length === 1 ? "Evidence" : `Evidence (${view.supports.length})`}</SectionLabel>
          <Stack gap="xs" mt={6}>
            {view.supports.map((memory) => (
              <MemoryQuote key={memory.id} memory={memory} />
            ))}
            {view.contradicts.map((memory) => (
              <MemoryQuote key={memory.id} memory={memory} contradicts />
            ))}
          </Stack>
        </Box>

        {related.length > 0 && (
          <Box>
            <SectionLabel>Related beliefs</SectionLabel>
            <Stack gap={6} mt={6}>
              {related.map((match) => (
                <BeliefSummaryLine key={match.id} summary={match} note={match.similarity >= 0.35 ? `${Math.round(match.similarity * 100)}% similar` : "shares wording"} />
              ))}
            </Stack>
          </Box>
        )}

        {decision.error !== undefined && (
          <Alert color="red" variant="light" withCloseButton onClose={decision.clearError} title="Not decided">
            {decision.error}
          </Alert>
        )}

        <Divider />
        {rejecting ? (
          <RejectReasonForm
            pending={decision.pending}
            onCancel={() => onRejectingChange(false)}
            onSubmit={(reason) =>
              void decision.decide("reject", reason).then((result) => {
                if (result.ok) onRejectingChange(false);
              })
            }
          />
        ) : (
          <Group justify="space-between">
            <Group gap="xs">
              <Button color="teal" loading={decision.pending} onClick={() => void decision.decide("accept")} rightSection={selected && <Kbd size="xs">a</Kbd>}>
                Accept
              </Button>
              <Button variant="default" onClick={() => onRejectingChange(true)} rightSection={selected && <Kbd size="xs">r</Kbd>}>
                Reject…
              </Button>
              <ButtonLink
                variant="subtle"
                color="gray"
                to="/beliefs/$id"
                params={{ id: belief.id }}
                rightSection={selected && <Kbd size="xs">d</Kbd>}
              >
                Discuss{view.thread.length > 0 && ` (${view.thread.length})`}
              </ButtonLink>
            </Group>
            <AnchorLink to="/beliefs/$id" params={{ id: belief.id }} size="xs" c="dimmed">
              Open record
            </AnchorLink>
          </Group>
        )}
      </Stack>
    </Paper>
  );
}
