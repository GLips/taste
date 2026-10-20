import { Badge, Group, Tooltip } from "@mantine/core";
import { type BeliefStatus, formatScopeLabel } from "../shared/vocabulary.ts";

const STATUS_COLORS: Record<BeliefStatus, string> = {
  pending: "blue",
  accepted: "teal",
  rejected: "red",
  retracted: "gray",
  superseded: "gray",
};

export function BeliefStatusBadge({ status }: { status: BeliefStatus }) {
  return (
    <Badge color={STATUS_COLORS[status]} variant={status === "accepted" ? "filled" : "light"} style={{ flexShrink: 0 }}>
      {status}
    </Badge>
  );
}

/** A missing `applies_to` means the belief applies to every project, which is easy to approve by accident. */
export function BeliefScopeChips({ appliesTo }: { appliesTo: ReadonlyArray<string> | undefined }) {
  if (appliesTo === undefined) {
    return (
      <Tooltip label="No applies_to: this would apply in every project" withArrow>
        <Badge color="orange" variant="light" leftSection="●">
          {formatScopeLabel(appliesTo)}
        </Badge>
      </Tooltip>
    );
  }
  return (
    <Group gap={4}>
      {appliesTo.map((scope) => (
        <Badge key={scope} color="gray" variant="outline" tt="none">
          {scope}
        </Badge>
      ))}
    </Group>
  );
}
