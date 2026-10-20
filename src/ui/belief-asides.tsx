import { Group, Stack, Text, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { CornerDownRight, RotateCcw, TriangleAlert } from "lucide-react";
import type { BeliefSummary } from "../core/index.ts";
import { formatReviewDate } from "./format.ts";
import { AnchorLink } from "./router-links.tsx";

const styles = stylex.create({
  aside: { display: "flex", gap: "8px", alignItems: "flex-start" },
  icon: { flexShrink: 0, marginTop: "3px" },
  agentCase: { whiteSpace: "pre-wrap" },
});

/** The accepted belief a proposal would replace, in one line. */
export function SupersedesNotice({ replaces }: { replaces: BeliefSummary }) {
  return (
    <div {...stylex.props(styles.aside)}>
      <Tooltip label="Accepting this replaces the accepted belief" withArrow>
        <RotateCcw size={14} color="var(--mantine-color-taste-7)" {...stylex.props(styles.icon)} />
      </Tooltip>
      <Text size="sm" c="dimmed">
        Replaces{" "}
        <AnchorLink to="/beliefs/$id" params={{ id: replaces.id }} size="sm" c="dark.4">
          {replaces.statement}
        </AnchorLink>
      </Text>
    </div>
  );
}

/** A re-proposal of something the owner turned down: their earlier no and reason first, then the agent's case for asking again. */
export function DespiteNotice({ despite, agentCase }: { despite: BeliefSummary; agentCase: string | undefined }) {
  return (
    <div {...stylex.props(styles.aside)}>
      <Tooltip label="An agent re-proposed this after you turned down something close to it" withArrow multiline w={240}>
        <TriangleAlert size={14} color="var(--mantine-color-orange-6)" {...stylex.props(styles.icon)} />
      </Tooltip>
      <Stack gap={2}>
        <Text size="sm">
          <Text span c="orange.8" fw={500}>
            You {despite.status === "rejected" ? "rejected" : "retired"}
          </Text>{" "}
          <AnchorLink to="/beliefs/$id" params={{ id: despite.id }} size="sm" c="inherit">
            “{despite.statement}”
          </AnchorLink>
          {despite.decidedAt !== undefined && (
            <Text span size="xs" c="dimmed">
              {" "}
              {formatReviewDate(despite.decidedAt)}
            </Text>
          )}
          {despite.reason !== undefined && (
            <Text span c="dimmed">
              {" "}
              — {despite.reason}
            </Text>
          )}
        </Text>
        {agentCase !== undefined && (
          <Group gap={6} wrap="nowrap" align="flex-start">
            <CornerDownRight size={13} color="var(--mantine-color-gray-5)" {...stylex.props(styles.icon)} />
            <Text size="sm" c="dimmed" {...stylex.props(styles.agentCase)}>
              {agentCase}
            </Text>
          </Group>
        )}
      </Stack>
    </div>
  );
}
