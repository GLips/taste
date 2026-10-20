import { ActionIcon, Alert, Button, Center, Group, Kbd, Loader, Stack, Text, Title, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCheck, Keyboard, PartyPopper } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { InboxGroup } from "../core/index.ts";
import { BeliefScopeChips } from "../ui/belief-chips.tsx";
import { InboxProposalCard } from "../ui/inbox-card.tsx";
import { inboxGroupsQuery, reviewStoreInfoQuery } from "../ui/review-queries.ts";
import { QueryErrorAlert } from "../ui/route-panels.tsx";
import { useAcceptReviewGroup } from "../ui/use-review-decision.ts";

export const Route = createFileRoute("/")({ component: InboxScreen });

const styles = stylex.create({
  screen: { maxWidth: "820px", marginInline: "auto" },
  groupHeader: { position: "sticky", top: "48px", zIndex: 5, paddingBlock: "6px", backgroundColor: "var(--mantine-color-gray-0)" },
  keys: { display: "grid", gridTemplateColumns: "auto auto", columnGap: "10px", rowGap: "4px", alignItems: "center" },
});

const INBOX_KEYS: ReadonlyArray<readonly [string, string]> = [
  ["j / k", "Next / previous"],
  ["a", "Accept"],
  ["r", "Reject with a reason"],
  ["d", "Discuss with an agent"],
];

/** Groups about the owner need no label; only beliefs about someone else say whom they're about. */
function subjectLabel(subject: string, owner: string | undefined) {
  return subject === "owner" || subject === owner ? undefined : `About ${subject}`;
}

function InboxGroupSection({
  group,
  owner,
  selectedId,
  rejectingId,
  onSelect,
  onRejecting,
  cardRefs,
}: {
  group: InboxGroup;
  owner: string | undefined;
  selectedId: string | undefined;
  rejectingId: string | undefined;
  onSelect: (id: string) => void;
  onRejecting: (id: string | undefined) => void;
  cardRefs: Map<string, HTMLDivElement>;
}) {
  const accept = useAcceptReviewGroup();
  const targets = group.cards.map((card) => card.view.belief.id);
  const about = subjectLabel(group.subject, owner);
  return (
    <Stack gap="sm">
      <Group justify="space-between" {...stylex.props(styles.groupHeader)}>
        <Group gap={8}>
          {about !== undefined && (
            <Text size="sm" fw={600}>
              {about}
            </Text>
          )}
          <BeliefScopeChips appliesTo={group.appliesTo} />
          <Tooltip label={`${group.cards.length} waiting for review in this scope`} withArrow>
            <Text size="xs" c="dimmed">
              {group.cards.length}
            </Text>
          </Tooltip>
        </Group>
        {group.cards.length > 1 && (
          <Button variant="subtle" leftSection={<CheckCheck size={14} />} loading={accept.pending} onClick={() => accept.acceptAll(targets)}>
            Accept all {group.cards.length}
          </Button>
        )}
      </Group>
      {accept.failures.length > 0 && (
        <Alert color="red" variant="light" title="Some proposals were not accepted">
          <Stack gap={4}>
            {accept.failures.map((failure) => (
              <Text key={failure.target} size="sm">
                {failure.message}
              </Text>
            ))}
          </Stack>
        </Alert>
      )}
      {group.cards.map((card) => {
        const id = card.view.belief.id;
        return (
          <InboxProposalCard
            key={id}
            card={card}
            selected={id === selectedId}
            rejecting={id === rejectingId}
            onSelect={() => onSelect(id)}
            onRejectingChange={(open) => onRejecting(open ? id : undefined)}
            ref={(element) => {
              if (element) cardRefs.set(id, element);
              else cardRefs.delete(id);
            }}
          />
        );
      })}
    </Stack>
  );
}

function InboxScreen() {
  const inbox = useQuery(inboxGroupsQuery);
  const info = useQuery(reviewStoreInfoQuery);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [rejectingId, setRejectingId] = useState<string | undefined>(undefined);
  const cardRefs = useRef(new Map<string, HTMLDivElement>()).current;
  const order = (inbox.data ?? []).flatMap((group) => group.cards.map((card) => card.view.belief.id));
  // When the selected card is decided it vanishes; selection falls to the card that took its place.
  const lastIndex = useRef(0);
  const selectedIndex = selectedId === undefined ? -1 : order.indexOf(selectedId);
  if (selectedIndex >= 0) lastIndex.current = selectedIndex;
  const effectiveId = selectedIndex >= 0 ? selectedId : order[Math.min(lastIndex.current, order.length - 1)];

  useEffect(() => {
    if (effectiveId !== undefined) cardRefs.get(effectiveId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [effectiveId, cardRefs]);

  const move = (by: 1 | -1) => () => {
    if (order.length === 0) return;
    const at = effectiveId === undefined ? -1 : order.indexOf(effectiveId);
    const next = order[Math.max(0, Math.min(order.length - 1, at + by))];
    setRejectingId(undefined);
    setSelectedId(next);
  };
  useHotkeys([
    { hotkey: "J", callback: move(1) },
    { hotkey: "K", callback: move(-1) },
  ]);

  if (inbox.error) return <QueryErrorAlert error={inbox.error} />;
  if (inbox.data === undefined) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  }
  return (
    <Stack gap="md" {...stylex.props(styles.screen)}>
      <Group justify="space-between" align="center">
        <Tooltip label="What agents proposed from what you said. Nothing is believed until you accept it." withArrow multiline w={260} position="bottom-start">
          <Title order={3}>Inbox</Title>
        </Tooltip>
        <Tooltip
          withArrow
          position="bottom-end"
          label={
            <div {...stylex.props(styles.keys)}>
              {INBOX_KEYS.map(([keys, action]) => [
                <Kbd key={`${keys}-k`} size="xs">
                  {keys}
                </Kbd>,
                <span key={`${keys}-a`}>{action}</span>,
              ])}
            </div>
          }
        >
          <ActionIcon variant="subtle" color="gray" aria-label="Keyboard shortcuts">
            <Keyboard size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
      {order.length === 0 ? (
        <Center py={80}>
          <Stack align="center" gap={6}>
            <PartyPopper size={28} color="var(--mantine-color-taste-6)" />
            <Text fw={600}>Nothing to review</Text>
            <Text size="sm" c="dimmed">
              Agents propose with <code>taste propose</code>. <Link to="/beliefs">Browse beliefs</Link>
            </Text>
          </Stack>
        </Center>
      ) : (
        inbox.data.map((group) => (
          <InboxGroupSection
            key={`${group.subject}|${group.appliesTo?.join(",") ?? "*"}`}
            group={group}
            owner={info.data?.owner}
            selectedId={effectiveId}
            rejectingId={rejectingId}
            onSelect={(id) => setSelectedId(id)}
            onRejecting={(id) => {
              if (id !== undefined) setSelectedId(id);
              setRejectingId(id);
            }}
            cardRefs={cardRefs}
          />
        ))
      )}
    </Stack>
  );
}
