import { Group, Text } from "@mantine/core";
import { AnchorLink } from "./router-links.tsx";
import type { BeliefSummary } from "../core/index.ts";
import { BeliefStatusBadge } from "./belief-chips.tsx";
import { formatReviewDate } from "./format.ts";

/** Another belief in one line: its status, its exact wording (linked), and why it was decided, if it was. */
export function BeliefSummaryLine({ summary, note }: { summary: BeliefSummary; note?: string }) {
  return (
    <Group gap={8} wrap="nowrap" align="flex-start">
      <BeliefStatusBadge status={summary.status} />
      <div>
        <AnchorLink to="/beliefs/$id" params={{ id: summary.id }} size="sm" c="inherit" underline="hover">
          {summary.statement}
        </AnchorLink>
        {(summary.decidedAt !== undefined || note !== undefined) && (
          <Text size="xs" c="dimmed">
            {note}
            {note !== undefined && summary.decidedAt !== undefined && " · "}
            {summary.decidedAt !== undefined && `${summary.status} ${formatReviewDate(summary.decidedAt)}`}
            {summary.reason !== undefined && `: “${summary.reason}”`}
          </Text>
        )}
      </div>
    </Group>
  );
}
