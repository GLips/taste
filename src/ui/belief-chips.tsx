import { Badge, Group, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { Globe } from "lucide-react";
import { type BeliefStatus, formatScopeLabel } from "../shared/vocabulary.ts";

const STATUS_COLORS: Record<BeliefStatus, string> = {
  pending: "var(--mantine-color-blue-5)",
  accepted: "var(--mantine-color-teal-6)",
  rejected: "var(--mantine-color-red-6)",
  retracted: "var(--mantine-color-gray-5)",
  superseded: "var(--mantine-color-gray-5)",
};

const STATUS_LABELS: Record<BeliefStatus, string> = {
  pending: "Pending review",
  accepted: "Accepted",
  rejected: "Rejected",
  retracted: "Retracted",
  superseded: "Replaced by a newer belief",
};

const styles = stylex.create({
  dot: { width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0, display: "inline-block" },
  hollow: { borderWidth: "1.5px", borderStyle: "solid", backgroundColor: "transparent" },
});

// Mantine clips badge labels with an ellipsis, which lets a table column squeeze a scope name down to "ac…".
const UNCLIPPED_LABEL = { label: { overflow: "visible" } };

/** Status as a colour dot: dense lists carry many of these, and the word lives in the tooltip. */
export function BeliefStatusDot({ status }: { status: BeliefStatus }) {
  const color = STATUS_COLORS[status];
  const hollow = status === "retracted" || status === "superseded";
  return (
    <Tooltip label={STATUS_LABELS[status]} withArrow openDelay={150}>
      <span
        aria-label={STATUS_LABELS[status]}
        role="img"
        {...stylex.props(styles.dot, hollow && styles.hollow)}
        style={hollow ? { borderColor: color } : { backgroundColor: color }}
      />
    </Tooltip>
  );
}

/** The word form, for a record's own header where the status is the headline. */
export function BeliefStatusBadge({ status }: { status: BeliefStatus }) {
  const colors: Record<BeliefStatus, string> = { pending: "blue", accepted: "teal", rejected: "red", retracted: "gray", superseded: "gray" };
  return (
    <Badge color={colors[status]} variant="light" style={{ flexShrink: 0 }}>
      {status}
    </Badge>
  );
}

/** A missing `applies_to` means the belief applies to every project, which is easy to approve by accident. */
export function BeliefScopeChips({ appliesTo }: { appliesTo: ReadonlyArray<string> | undefined }) {
  if (appliesTo === undefined) {
    return (
      <Tooltip label="No scope: this would apply in every project" withArrow>
        <Badge color="orange" variant="light" tt="none" styles={UNCLIPPED_LABEL} leftSection={<Globe size={11} strokeWidth={2.25} />}>
          {formatScopeLabel(appliesTo)}
        </Badge>
      </Tooltip>
    );
  }
  return (
    <Group gap={4} wrap="nowrap">
      {appliesTo.map((scope) => (
        <Badge key={scope} color="gray" variant="light" tt="none" fw={500} styles={UNCLIPPED_LABEL}>
          {scope}
        </Badge>
      ))}
    </Group>
  );
}
