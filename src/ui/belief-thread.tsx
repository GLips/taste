import { ActionIcon, Alert, Badge, Group, Paper, Stack, Text, Textarea, Tooltip } from "@mantine/core";
import { SendHorizontal } from "lucide-react";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ListenerHeartbeat, ThreadEntryRecord } from "../core/index.ts";
import { postOwnerThreadNote } from "../server/review-functions.ts";
import { describeAuthor, formatReviewTime, formatTimeAgo } from "./format.ts";

const styles = stylex.create({
  entry: { display: "flex", flexDirection: "column", gap: "4px" },
  owner: { backgroundColor: "var(--mantine-color-taste-0)", borderColor: "var(--mantine-color-taste-1)" },
  text: { whiteSpace: "pre-wrap" },
  dot: { width: "8px", height: "8px", borderRadius: "50%", display: "inline-block" },
  dotLive: { backgroundColor: "var(--mantine-color-teal-5)", boxShadow: "0 0 0 3px var(--mantine-color-teal-1)" },
  dotIdle: { backgroundColor: "var(--mantine-color-gray-4)" },
});

/** Whether a note posted now would wake an agent: any listener whose heartbeat is under 15s old. */
export function AgentListeningIndicator({ listeners }: { listeners: ReadonlyArray<ListenerHeartbeat> }) {
  const live = listeners.filter((listener) => listener.listening);
  if (live.length > 0) {
    return (
      <Tooltip label={`Heartbeat ${formatTimeAgo(live[0]?.heartbeatAt)}`} withArrow>
        <Group gap={8}>
          <span {...stylex.props(styles.dot, styles.dotLive)} />
          <Text size="xs" c="teal.8" fw={500}>
            {live.map((listener) => listener.name).join(", ")} listening
          </Text>
        </Group>
      </Tooltip>
    );
  }
  return (
    <Tooltip label="Run `taste review listen --as <name>` in an agent session so notes wake it" withArrow multiline w={260}>
      <Group gap={8}>
        <span {...stylex.props(styles.dot, styles.dotIdle)} />
        <Text size="xs" c="dimmed">
          No agent listening
        </Text>
      </Group>
    </Tooltip>
  );
}

/** One belief's discussion, oldest first, with a composer that always writes as the store owner. */
export function BeliefThread({
  beliefId,
  thread,
  owner,
  listeners,
}: {
  beliefId: string;
  thread: ReadonlyArray<ThreadEntryRecord>;
  owner: string;
  listeners: ReadonlyArray<ListenerHeartbeat>;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const post = useMutation({
    mutationFn: (text: string) => postOwnerThreadNote({ data: { belief: beliefId, text } }),
    onSuccess: () => setDraft(""),
    onSettled: () => queryClient.invalidateQueries(),
  });
  const submit = () => {
    if (draft.trim() !== "" && !post.isPending) post.mutate(draft);
  };
  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text size="sm" fw={600}>
          Thread
        </Text>
        <AgentListeningIndicator listeners={listeners} />
      </Group>
      {thread.map((entry) => {
        const isOwner = entry.author === owner;
        return (
          <Paper key={entry.id} px="sm" py={8} {...stylex.props(styles.entry, isOwner && styles.owner)}>
            <Group gap={8}>
              <Badge size="xs" variant={isOwner ? "filled" : "light"} color={isOwner ? "taste" : "gray"} tt="none">
                {describeAuthor(entry.author, owner)}
              </Badge>
              <Text size="xs" c="dimmed" title={formatReviewTime(entry.at)}>
                {formatTimeAgo(entry.at)}
              </Text>
            </Group>
            <Text {...stylex.props(styles.text)}>{entry.text}</Text>
          </Paper>
        );
      })}
      <Textarea
        placeholder={thread.length === 0 ? "Ask the agent something, or say what you'd change  ·  ⌘↵ to send" : "Reply  ·  ⌘↵ to send"}
        autosize
        minRows={1}
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            submit();
          }
        }}
        rightSection={
          <Tooltip label={`Post as ${owner} · ⌘↵`} withArrow>
            <ActionIcon variant="subtle" aria-label="Post note" onClick={submit} loading={post.isPending} disabled={draft.trim() === ""}>
              <SendHorizontal size={15} />
            </ActionIcon>
          </Tooltip>
        }
      />
      {post.error && (
        <Alert color="red" variant="light">
          {post.error.message}
        </Alert>
      )}
    </Stack>
  );
}
