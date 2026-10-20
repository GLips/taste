import { Anchor, Group, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { MemoryRecord } from "../core/index.ts";
import { formatReviewTime } from "./format.ts";

const styles = stylex.create({
  quote: {
    borderLeftWidth: "3px",
    borderLeftStyle: "solid",
    borderLeftColor: "var(--mantine-color-indigo-3)",
    paddingLeft: "12px",
    paddingBlock: "2px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  contradicts: { borderLeftColor: "var(--mantine-color-red-3)" },
  words: { whiteSpace: "pre-wrap" },
  excerpt: { whiteSpace: "pre-wrap", fontFamily: "var(--mantine-font-family-monospace)", fontSize: "12px" },
});

/** A human's exact words with who said them, when, and where: the evidence a belief stands on. */
export function MemoryQuote({ memory, contradicts = false }: { memory: MemoryRecord; contradicts?: boolean }) {
  return (
    <div {...stylex.props(styles.quote, contradicts && styles.contradicts)}>
      <Text {...stylex.props(styles.words)}>“{memory.quote}”</Text>
      {memory.before !== undefined && (
        <Text c="dimmed" {...stylex.props(styles.excerpt)}>
          Before: {memory.before}
        </Text>
      )}
      {memory.after !== undefined && (
        <Text c="dimmed" {...stylex.props(styles.excerpt)}>
          After: {memory.after}
        </Text>
      )}
      <Group gap={6}>
        <Text size="xs" fw={600}>
          {memory.said_by_label}
        </Text>
        <Text size="xs" c="dimmed">
          {formatReviewTime(memory.said_at)}
          {memory.revises !== undefined && " · revises an earlier quote"}
          {contradicts && " · contradicts"}
        </Text>
        {memory.address !== undefined && (
          <Anchor size="xs" href={memory.address} target="_blank" rel="noreferrer">
            source ↗
          </Anchor>
        )}
      </Group>
    </div>
  );
}
