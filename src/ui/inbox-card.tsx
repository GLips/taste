import { ActionIcon, Alert, Badge, Group, HoverCard, Paper, Stack, Text, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { useNavigate } from "@tanstack/react-router";
import { Check, MessageSquare, X } from "lucide-react";
import type { Ref } from "react";
import type { InboxCard } from "../core/index.ts";
import { BeliefSummaryLine } from "./belief-link.tsx";
import { DespiteNotice, SupersedesNotice } from "./belief-asides.tsx";
import { formatReviewTime, formatTimeAgo } from "./format.ts";
import { MemoryQuote } from "./memory-quote.tsx";
import { RejectReasonForm } from "./reject-reason-form.tsx";
import { AnchorLink, ButtonLink } from "./router-links.tsx";
import { useReviewDecision } from "./use-review-decision.ts";

// Below this, a "related" match only shares a word or two; listing those was noise.
const SIMILAR_ENOUGH = 0.35;

const styles = stylex.create({
  card: {
    transitionProperty: "box-shadow, border-color, background-color",
    transitionDuration: "120ms",
    cursor: "default",
  },
  selected: {
    borderColor: "var(--mantine-color-taste-4)",
    boxShadow: "0 0 0 3px var(--mantine-color-taste-1)",
  },
  statement: { fontSize: "15px", fontWeight: 600, lineHeight: 1.35, letterSpacing: "-0.005em" },
  quotes: { paddingTop: "2px" },
});

/** Mounted only inside the selected card, so a/r/d always act on exactly one proposal. */
function SelectedCardHotkeys({ onAccept, onReject, onDiscuss }: { onAccept: () => void; onReject: () => void; onDiscuss: () => void }) {
  useHotkeys([
    { hotkey: "A", callback: onAccept },
    { hotkey: "R", callback: onReject },
    { hotkey: "D", callback: onDiscuss },
  ]);
  return null;
}

/** One pending proposal with what's needed to decide it: the claim, what it replaces or overrides, and the words behind it. */
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
  const { view } = card;
  const { belief } = view;
  const decision = useReviewDecision(belief.id);
  const navigate = useNavigate();
  const shown = new Set([view.supersedes?.id, view.despite?.id]);
  const similar = card.related.filter((match) => match.similarity >= SIMILAR_ENOUGH && !shown.has(match.id));
  const reasoning = belief.reasoning.trim();

  return (
    <Paper ref={ref} px="md" py="sm" onClick={onSelect} {...stylex.props(styles.card, selected && styles.selected)}>
      {selected && !rejecting && (
        <SelectedCardHotkeys
          onAccept={() => void decision.decide("accept")}
          onReject={() => onRejectingChange(true)}
          onDiscuss={() => void navigate({ to: "/beliefs/$id", params: { id: belief.id } })}
        />
      )}
      <Stack gap={8}>
        <Group justify="space-between" wrap="nowrap" align="flex-start" gap="md">
          <Stack gap={2} style={{ minWidth: 0 }}>
            <AnchorLink to="/beliefs/$id" params={{ id: belief.id }} c="inherit" underline="never" {...stylex.props(styles.statement)}>
              {belief.statement}
            </AnchorLink>
            <Text size="xs" c="dimmed" lineClamp={1} title={reasoning === "" ? undefined : reasoning}>
              <span title={formatReviewTime(belief.proposed_at)}>
                {belief.proposed_by} · {formatTimeAgo(belief.proposed_at)}
              </span>
              {reasoning !== "" && ` — ${reasoning}`}
            </Text>
          </Stack>
          {!rejecting && (
            <Group gap={4} wrap="nowrap">
              {similar.length > 0 && (
                <HoverCard width={360} withArrow shadow="md" position="bottom-end">
                  <HoverCard.Target>
                    <Badge variant="light" color="gray" tt="none" fw={500} style={{ cursor: "help" }}>
                      ≈ {similar.length}
                    </Badge>
                  </HoverCard.Target>
                  <HoverCard.Dropdown>
                    <Text size="xs" c="dimmed" mb={6}>
                      Similar beliefs
                    </Text>
                    <Stack gap={6}>
                      {similar.map((match) => (
                        <BeliefSummaryLine key={match.id} summary={match} note={`${Math.round(match.similarity * 100)}%`} />
                      ))}
                    </Stack>
                  </HoverCard.Dropdown>
                </HoverCard>
              )}
              <Tooltip label={view.thread.length > 0 ? `Discuss (${view.thread.length}) · D` : "Discuss with an agent · D"} withArrow>
                <ButtonLink
                  to="/beliefs/$id"
                  params={{ id: belief.id }}
                  variant="subtle"
                  color="gray"
                  size="compact-sm"
                  px={6}
                  leftSection={<MessageSquare size={15} />}
                  aria-label="Discuss"
                >
                  {view.thread.length > 0 ? view.thread.length : null}
                </ButtonLink>
              </Tooltip>
              <Tooltip label="Reject · R" withArrow>
                <ActionIcon variant="default" size="md" aria-label="Reject" onClick={() => onRejectingChange(true)}>
                  <X size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Accept · A" withArrow>
                <ActionIcon size="md" aria-label="Accept" loading={decision.pending} onClick={() => void decision.decide("accept")}>
                  <Check size={16} strokeWidth={2.5} />
                </ActionIcon>
              </Tooltip>
            </Group>
          )}
        </Group>

        {view.supersedes !== undefined && <SupersedesNotice replaces={view.supersedes} />}
        {view.despite !== undefined && <DespiteNotice despite={view.despite} agentCase={belief.despite_case} />}

        <Stack gap={6} {...stylex.props(styles.quotes)}>
          {view.supports.map((memory) => (
            <MemoryQuote key={memory.id} memory={memory} />
          ))}
          {view.contradicts.map((memory) => (
            <MemoryQuote key={memory.id} memory={memory} contradicts />
          ))}
        </Stack>

        {decision.error !== undefined && (
          <Alert color="red" variant="light" withCloseButton onClose={decision.clearError} py={6}>
            {decision.error}
          </Alert>
        )}

        {rejecting && (
          <RejectReasonForm
            pending={decision.pending}
            onCancel={() => onRejectingChange(false)}
            onSubmit={(reason) =>
              void decision.decide("reject", reason).then((result) => {
                if (result.ok) onRejectingChange(false);
              })
            }
          />
        )}
      </Stack>
    </Paper>
  );
}

