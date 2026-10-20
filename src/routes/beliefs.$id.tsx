import { Alert, Box, Button, Center, Code, Group, Loader, Paper, Stack, Text, Timeline, Title } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AnchorLink } from "../ui/router-links.tsx";
import { useState } from "react";
import type { BeliefSummary } from "../core/index.ts";
import { BeliefScopeChips, BeliefStatusBadge } from "../ui/belief-chips.tsx";
import { BeliefSummaryLine } from "../ui/belief-link.tsx";
import { BeliefThread } from "../ui/belief-thread.tsx";
import { shortIdOf } from "../shared/vocabulary.ts";
import { describeAuthor, formatReviewTime } from "../ui/format.ts";
import { MemoryQuote } from "../ui/memory-quote.tsx";
import { RejectReasonForm } from "../ui/reject-reason-form.tsx";
import { beliefDetailQuery } from "../ui/review-queries.ts";
import { QueryErrorAlert } from "../ui/route-panels.tsx";
import { useReviewDecision } from "../ui/use-review-decision.ts";

export const Route = createFileRoute("/beliefs/$id")({ component: BeliefScreen });

const styles = stylex.create({
  layout: {
    display: "grid",
    gridTemplateColumns: { default: "minmax(0, 1fr) 320px", "@media (max-width: 900px)": "minmax(0, 1fr)" },
    gap: "24px",
    alignItems: "start",
  },
  statement: { fontSize: "24px", lineHeight: 1.3, letterSpacing: "-0.015em" },
  prose: { whiteSpace: "pre-wrap" },
  despite: { backgroundColor: "var(--mantine-color-orange-0)", borderColor: "var(--mantine-color-orange-2)" },
  current: { fontWeight: 600 },
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

  return (
    <Stack gap="lg">
      <Group gap={6}>
        <AnchorLink to="/beliefs" size="sm" c="dimmed">
          Beliefs
        </AnchorLink>
        <Text size="sm" c="dimmed">
          /
        </Text>
        <Code>{shortIdOf(belief.id)}</Code>
      </Group>

      <Stack gap="xs">
        <Group gap="xs">
          <BeliefStatusBadge status={view.status} />
          <BeliefScopeChips appliesTo={belief.applies_to} />
        </Group>
        <Title order={2} {...stylex.props(styles.statement)}>
          {belief.statement}
        </Title>
        <Text size="xs" c="dimmed">
          Proposed by {belief.proposed_by} · {formatReviewTime(belief.proposed_at)} · subject{" "}
          {belief.subject === "owner" ? "you" : belief.subject}
          {view.status === "rejected" && view.reason !== undefined && ` · rejected: “${view.reason}”`}
        </Text>
      </Stack>

      {decision.error !== undefined && (
        <Alert color="red" variant="light" withCloseButton onClose={decision.clearError} title="Not decided">
          {decision.error}
        </Alert>
      )}
      {view.status === "pending" &&
        (rejecting ? (
          <Paper p="md">
            <RejectReasonForm
              pending={decision.pending}
              onCancel={() => setRejecting(false)}
              onSubmit={(reason) =>
                void decision.decide("reject", reason).then((result) => {
                  if (result.ok) setRejecting(false);
                })
              }
            />
          </Paper>
        ) : (
          <Group gap="xs">
            <Button color="teal" loading={decision.pending} onClick={() => void decision.decide("accept")}>
              Accept
            </Button>
            <Button variant="default" onClick={() => setRejecting(true)}>
              Reject…
            </Button>
          </Group>
        ))}
      {view.status === "accepted" && (
        <Group gap="xs">
          <Button variant="default" color="red" loading={decision.pending} onClick={() => void decision.decide("retract")}>
            Retract
          </Button>
          <Text size="xs" c="dimmed">
            Agents stop recalling it; its history stays.
          </Text>
        </Group>
      )}

      <div {...stylex.props(styles.layout)}>
        <Stack gap="lg">
          {belief.reasoning.trim() !== "" && (
            <Box>
              <Text fw={600} mb={4}>
                Reasoning
              </Text>
              <Text c="dimmed" {...stylex.props(styles.prose)}>
                {belief.reasoning.trim()}
              </Text>
            </Box>
          )}

          {view.despite !== undefined && (
            <Paper p="md" {...stylex.props(styles.despite)}>
              <Stack gap="xs">
                <Text size="xs" fw={600} c="orange.8">
                  Proposed despite an earlier {view.despite.status} belief
                </Text>
                <BeliefSummaryLine summary={view.despite} />
                {belief.despite_case !== undefined && <Text {...stylex.props(styles.prose)}>{belief.despite_case}</Text>}
              </Stack>
            </Paper>
          )}

          <Box>
            <Text fw={600} mb="xs">
              Evidence
            </Text>
            <Stack gap="sm">
              {view.supports.map((memory) => (
                <MemoryQuote key={memory.id} memory={memory} />
              ))}
              {view.contradicts.map((memory) => (
                <MemoryQuote key={memory.id} memory={memory} contradicts />
              ))}
            </Stack>
          </Box>

          <Paper p="md">
            <BeliefThread beliefId={belief.id} thread={view.thread} owner={owner} listeners={listeners} />
          </Paper>
        </Stack>

        <Stack gap="lg">
          <Paper p="md">
            <Text fw={600} mb="sm">
              Decisions
            </Text>
            {view.decisions.length === 0 ? (
              <Text size="sm" c="dimmed">
                Not decided yet.
              </Text>
            ) : (
              <Timeline bulletSize={12} lineWidth={2} active={view.decisions.length - 1}>
                {view.decisions.map((entry) => (
                  <Timeline.Item key={entry.id} title={<Text size="sm" fw={600} tt="capitalize">{entry.outcome}</Text>}>
                    <Text size="xs" c="dimmed">
                      {describeAuthor(entry.by, owner)}
                      {entry.via !== undefined && ` via ${entry.via}`} · {formatReviewTime(entry.at)}
                    </Text>
                    {entry.reason !== undefined && <Text size="sm">“{entry.reason}”</Text>}
                  </Timeline.Item>
                ))}
              </Timeline>
            )}
          </Paper>

          {chain.length > 1 && (
            <Paper p="md">
              <Text fw={600} mb="sm">
                Revisions
              </Text>
              <Timeline bulletSize={12} lineWidth={2} active={ancestors.length}>
                {chain.map((summary) => (
                  <Timeline.Item key={summary.id}>
                    <ChainLink summary={summary} current={summary.id === belief.id} />
                  </Timeline.Item>
                ))}
              </Timeline>
            </Paper>
          )}
        </Stack>
      </div>
    </Stack>
  );
}
