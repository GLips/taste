import { Group, Text } from "@mantine/core";
import { AnchorLink } from "./router-links.tsx";
import type { BeliefSummary } from "../core/index.ts";
import { BeliefStatusDot } from "./belief-chips.tsx";
import { formatReviewDate } from "./format.ts";

/** Another belief in one line: a status dot, its exact wording (linked), and the decision's reason if it has one. */
export function BeliefSummaryLine({ summary, note }: { summary: BeliefSummary; note?: string }) {
  const decided = summary.decidedAt !== undefined ? `${summary.status} ${formatReviewDate(summary.decidedAt)}` : undefined;
  return (
    <Group gap={8} wrap="nowrap" align="baseline">
      <BeliefStatusDot status={summary.status} />
      <Text size="sm" lineClamp={2}>
        <AnchorLink to="/beliefs/$id" params={{ id: summary.id }} size="sm" c="inherit" underline="hover">
          {summary.statement}
        </AnchorLink>
        {summary.reason !== undefined && (
          <Text span size="xs" c="dimmed" title={decided}>
            {" "}
            — “{summary.reason}”
          </Text>
        )}
        {note !== undefined && (
          <Text span size="xs" c="dimmed">
            {" "}
            · {note}
          </Text>
        )}
      </Text>
    </Group>
  );
}
