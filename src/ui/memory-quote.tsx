import { ActionIcon, Stack, Text, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { ExternalLink, History, TextQuote } from "lucide-react";
import type { MemoryRecord } from "../core/index.ts";
import { formatReviewTime } from "./format.ts";

const styles = stylex.create({
  quote: { display: "flex", gap: "8px", alignItems: "baseline" },
  mark: { fontSize: "18px", lineHeight: 0, fontWeight: 700, color: "var(--mantine-color-taste-4)", flexShrink: 0, transform: "translateY(4px)" },
  against: { color: "var(--mantine-color-red-5)" },
  body: { minWidth: 0, flex: 1 },
  words: { whiteSpace: "pre-wrap" },
  meta: { display: "inline-flex", alignItems: "center", gap: "2px", marginLeft: "6px", verticalAlign: "baseline" },
  context: { whiteSpace: "pre-wrap", maxWidth: "420px", fontSize: "12px" },
});

function SurroundingContext({ memory }: { memory: MemoryRecord }) {
  return (
    <Stack gap={6}>
      {memory.before !== undefined && <Text {...stylex.props(styles.context)}>…{memory.before}</Text>}
      <Text fw={600} {...stylex.props(styles.context)}>
        “{memory.quote}”
      </Text>
      {memory.after !== undefined && <Text {...stylex.props(styles.context)}>{memory.after}…</Text>}
    </Stack>
  );
}

/** A human's exact words with who said them and when: the evidence a belief stands on. Context sits behind icons. */
export function MemoryQuote({ memory, contradicts = false }: { memory: MemoryRecord; contradicts?: boolean }) {
  const hasContext = memory.before !== undefined || memory.after !== undefined;
  return (
    <div {...stylex.props(styles.quote)}>
      <Tooltip label={contradicts ? "Says the opposite" : "Supports this belief"} withArrow openDelay={300}>
        <span aria-hidden {...stylex.props(styles.mark, contradicts && styles.against)}>
          “
        </span>
      </Tooltip>
      <div {...stylex.props(styles.body)}>
        <Text span {...stylex.props(styles.words)}>
          {memory.quote}
        </Text>
        <span {...stylex.props(styles.meta)}>
          <Text span size="xs" c="dimmed" title={memory.said_by}>
            — {memory.said_by_label}, {formatReviewTime(memory.said_at)}
          </Text>
          {memory.revises !== undefined && (
            <Tooltip label="Revises something they said earlier" withArrow>
              <History size={12} color="var(--mantine-color-gray-6)" style={{ marginLeft: 4 }} />
            </Tooltip>
          )}
          {hasContext && (
            <Tooltip label={<SurroundingContext memory={memory} />} withArrow multiline color="dark">
              <ActionIcon variant="subtle" color="gray" size="xs" aria-label="Show surrounding conversation">
                <TextQuote size={12} />
              </ActionIcon>
            </Tooltip>
          )}
          {memory.address !== undefined && (
            <Tooltip label="Open the source" withArrow>
              <ActionIcon component="a" href={memory.address} target="_blank" rel="noreferrer" variant="subtle" color="gray" size="xs" aria-label="Open the source">
                <ExternalLink size={12} />
              </ActionIcon>
            </Tooltip>
          )}
        </span>
      </div>
    </div>
  );
}
