import { ActionIcon, Alert, Button, Center, CopyButton, Group, Loader, Paper, Stack, Text, Timeline, Title, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Check, Undo2, X } from "lucide-react";
import { useState } from "react";
import type { BeliefSummary } from "../core/index.ts";
import { DespiteNotice, SupersedesNotice } from "../ui/belief-asides.tsx";
import { BeliefScopeChips, BeliefStatusBadge } from "../ui/belief-chips.tsx";
import { BeliefSummaryLine } from "../ui/belief-link.tsx";
import { BeliefThread } from "../ui/belief-thread.tsx";
import { shortIdOf } from "../shared/vocabulary.ts";
import { describeAuthor, formatReviewTime, formatTimeAgo } from "../ui/format.ts";
import { MemoryQuote } from "../ui/memory-quote.tsx";
import { RejectReasonForm } from "../ui/reject-reason-form.tsx";
import { beliefDetailQuery } from "../ui/review-queries.ts";
import { QueryErrorAlert } from "../ui/route-panels.tsx";
import { AnchorLink } from "../ui/router-links.tsx";
import { useReviewDecision } from "../ui/use-review-decision.ts";

export const Route = createFileRoute("/beliefs/$id")({
  component: BeliefScreen,
});

const styles = stylex.create({
  layout: {
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr) 300px",
      "@media (max-width: 900px)": "minmax(0, 1fr)",
    },
    gap: "20px",
    alignItems: "start",
  },
  statement: {
    fontSize: "22px",
    lineHeight: 1.3,
    letterSpacing: "-0.015em",
    fontWeight: 650,
  },
  prose: { whiteSpace: "pre-wrap" },
  current: { fontWeight: 600 },
  single: { gridTemplateColumns: "minmax(0, 1fr)" },
  id: {
    fontFamily: "var(--mantine-font-family-monospace)",
    fontSize: "11px",
    cursor: "copy",
  },
});

function ChainLink({ summary, current }: { summary: BeliefSummary; current: boolean }) {
  return current ? (
    <Group gap={6} wrap="nowrap">
      <BeliefStatusBadge status={summary.status} />
      <Text size="sm" {...stylex.props(styles.current)}>
        This belief
      </Text>
    </Group>
  ) : (
    <BeliefSummaryLine summary={summary} />
  );
}

function BeliefScreen() {
  const { id } = Route.useParams();
  const detail = useQuery(beliefDetailQuery(id));
  const decision = useReviewDecision(id);
  const [rejecting, setRejecting] = useState(false);

  if (detail.error) return <QueryErrorAlert error={detail.error} />;
  if (detail.data === undefined) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  }
  const { view, listeners, owner } = detail.data;
  const { belief, ancestors } = view;
  const chain: Array<BeliefSummary> = [...ancestors, view, ...view.revisions];
  const hasSidebar = view.decisions.length > 0 || chain.length > 1;

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <AnchorLink to="/beliefs" size="sm" c="dimmed" underline="hover">
          <Group gap={4}>
            <ArrowLeft size={14} />
            Beliefs
          </Group>
        </AnchorLink>
        <CopyButton value={belief.id}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? "Copied" : "Copy id for the CLI"} withArrow>
              <Text c="dimmed" onClick={copy} {...stylex.props(styles.id)}>
                {shortIdOf(belief.id)}
              </Text>
            </Tooltip>
          )}
        </CopyButton>
      </Group>

      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="lg">
        <Stack gap={6}>
          <Group gap={6}>
            <BeliefStatusBadge status={view.status} />
            <BeliefScopeChips appliesTo={belief.applies_to} />
            {belief.subject !== "owner" && belief.subject !== owner && (
              <Text size="xs" c="dimmed">
                about {belief.subject}
              </Text>
            )}
          </Group>
          <Title order={2} {...stylex.props(styles.statement)}>
            {belief.statement}
          </Title>
          <Text size="xs" c="dimmed">
            <span title={formatReviewTime(belief.proposed_at)}>
              {belief.proposed_by} · {formatTimeAgo(belief.proposed_at)}
            </span>
            {belief.reasoning.trim() !== "" && <span {...stylex.props(styles.prose)}> — {belief.reasoning.trim()}</span>}
          </Text>
        </Stack>
        {view.status === "pending" && !rejecting && (
          <Group gap={6} wrap="nowrap">
            <Button variant="default" leftSection={<X size={14} />} onClick={() => setRejecting(true)}>
              Reject
            </Button>
            <Button leftSection={<Check size={14} />} loading={decision.pending} onClick={() => void decision.decide("accept")}>
              Accept
            </Button>
          </Group>
        )}
        {view.status === "accepted" && (
          <Tooltip label="Agents stop recalling it; its history stays" withArrow position="bottom-end">
            <Button
              variant="default"
              leftSection={<Undo2 size={14} />}
              loading={decision.pending}
              onClick={() => void decision.decide("retract")}
            >
              Retract
            </Button>
          </Tooltip>
        )}
      </Group>

      {decision.error !== undefined && (
        <Alert color="red" variant="light" withCloseButton onClose={decision.clearError} title="Not decided">
          {decision.error}
        </Alert>
      )}
      {rejecting && (
        <RejectReasonForm
          pending={decision.pending}
          onCancel={() => setRejecting(false)}
          onSubmit={(reason) =>
            void decision.decide("reject", reason).then((result) => {
              if (result.ok) setRejecting(false);
            })
          }
        />
      )}

      <div {...stylex.props(styles.layout, !hasSidebar && styles.single)}>
        <Stack gap="md">
          {(view.supersedes !== undefined || view.despite !== undefined) && (
            <Stack gap={8}>
              {view.supersedes !== undefined && <SupersedesNotice replaces={view.supersedes} />}
              {view.despite !== undefined && <DespiteNotice despite={view.despite} agentCase={belief.despite_case} />}
            </Stack>
          )}

          {view.supports.length + view.contradicts.length > 0 && (
            <Paper px="md" py="sm">
              <Stack gap={8}>
                {view.supports.map((memory) => (
                  <MemoryQuote key={memory.id} memory={memory} />
                ))}
                {view.contradicts.map((memory) => (
                  <MemoryQuote key={memory.id} memory={memory} contradicts />
                ))}
              </Stack>
            </Paper>
          )}

          <Paper p="md">
            <BeliefThread beliefId={belief.id} thread={view.thread} owner={owner} listeners={listeners} />
          </Paper>
        </Stack>

        {hasSidebar && (
          <Stack gap="md">
            {view.decisions.length > 0 && (
              <Paper p="md">
                <Text size="sm" fw={600} mb="sm">
                  Decisions
                </Text>
                <Timeline bulletSize={10} lineWidth={2} active={view.decisions.length - 1}>
                  {view.decisions.map((entry) => (
                    <Timeline.Item
                      key={entry.id}
                      title={
                        <Text size="sm" fw={600} tt="capitalize">
                          {entry.outcome}
                        </Text>
                      }
                    >
                      <Text size="xs" c="dimmed">
                        {describeAuthor(entry.by, owner)}
                        {entry.via !== undefined && ` via ${entry.via}`} · {formatReviewTime(entry.at)}
                      </Text>
                      {entry.reason !== undefined && <Text size="sm">“{entry.reason}”</Text>}
                    </Timeline.Item>
                  ))}
                </Timeline>
              </Paper>
            )}

            {chain.length > 1 && (
              <Paper p="md">
                <Text size="sm" fw={600} mb="sm">
                  Revisions
                </Text>
                <Timeline bulletSize={10} lineWidth={2} active={ancestors.length}>
                  {chain.map((summary) => (
                    <Timeline.Item key={summary.id}>
                      <ChainLink summary={summary} current={summary.id === belief.id} />
                    </Timeline.Item>
                  ))}
                </Timeline>
              </Paper>
            )}
          </Stack>
        )}
      </div>
    </Stack>
  );
}
