import { Center, Group, Loader, Paper, SegmentedControl, Select, Stack, Table, Text, Title, Tooltip } from "@mantine/core";
import { CornerDownRight, MessageSquare } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AnchorLink } from "../ui/router-links.tsx";
import { Schema } from "effect";
import { BeliefScopeChips, BeliefStatusDot } from "../ui/belief-chips.tsx";
import { formatReviewDate } from "../ui/format.ts";
import { BELIEF_STATUSES, type BeliefStatus, BeliefStatusSchema } from "../shared/vocabulary.ts";
import { beliefListQuery, reviewStoreInfoQuery } from "../ui/review-queries.ts";
import { QueryErrorAlert } from "../ui/route-panels.tsx";

const STATUS_CHOICES = ["all", ...BELIEF_STATUSES] as const;

const BeliefListSearch = Schema.Struct({
  status: Schema.optionalKey(BeliefStatusSchema),
  scope: Schema.optionalKey(Schema.String),
});

export const Route = createFileRoute("/beliefs/")({
  validateSearch: Schema.toStandardSchemaV1(BeliefListSearch),
  component: BeliefListScreen,
});

function BeliefListScreen() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const list = useQuery(beliefListQuery({ status: search.status, scope: search.scope }));
  const scopes = useQuery(reviewStoreInfoQuery).data?.scopes;
  const setFilter = (next: { status?: BeliefStatus | undefined; scope?: string | undefined }) =>
    void navigate({
      search: (previous) => {
        const merged = { ...previous, ...next };
        return {
          ...(merged.status !== undefined && { status: merged.status }),
          ...(merged.scope !== undefined && { scope: merged.scope }),
        };
      },
      replace: true,
    });

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Group gap="md">
          <Tooltip label="Everything ever proposed, with what became of it" withArrow position="bottom-start">
            <Title order={3}>Beliefs</Title>
          </Tooltip>
          <SegmentedControl
          size="xs"
          value={search.status ?? "all"}
          data={STATUS_CHOICES.map((value) => ({ value, label: value[0]?.toUpperCase() + value.slice(1) }))}
          onChange={(value) => setFilter({ status: value === "all" ? undefined : (value as BeliefStatus) })}
          />
        </Group>
        <Select
          size="xs"
          w={200}
          placeholder="Any scope"
          clearable
          value={search.scope ?? null}
          data={scopes ?? (search.scope ? [search.scope] : [])}
          onChange={(value) => setFilter({ scope: value ?? undefined })}
        />
      </Group>
      {list.error ? (
        <QueryErrorAlert error={list.error} />
      ) : list.data === undefined ? (
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      ) : list.data.length === 0 ? (
        <Center py={60}>
          <Text c="dimmed">No beliefs match these filters.</Text>
        </Center>
      ) : (
        <Paper p={0}>
          <Table verticalSpacing={8} horizontalSpacing="md" highlightOnHover>
            <Table.Tbody>
              {list.data.map((belief) => (
                <Table.Tr key={belief.id}>
                  <Table.Td w={28} pr={0}>
                    <BeliefStatusDot status={belief.status} />
                  </Table.Td>
                  <Table.Td>
                    <AnchorLink to="/beliefs/$id" params={{ id: belief.id }} c="inherit" fw={500} size="sm" underline="hover">
                      {belief.statement}
                    </AnchorLink>
                    {belief.replacedBy !== undefined && (
                      <Group gap={4} wrap="nowrap">
                        <CornerDownRight size={12} color="var(--mantine-color-gray-5)" />
                        <AnchorLink to="/beliefs/$id" params={{ id: belief.replacedBy.id }} size="xs" c="dimmed" lineClamp={1}>
                          {belief.replacedBy.statement}
                        </AnchorLink>
                      </Group>
                    )}
                    {belief.status === "rejected" && belief.reason !== undefined && (
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        “{belief.reason}”
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td w={48}>
                    {belief.threadCount > 0 && (
                      <Tooltip label={`${belief.threadCount} ${belief.threadCount === 1 ? "note" : "notes"} in the thread`} withArrow>
                        <Group gap={3} wrap="nowrap" c="dimmed">
                          <MessageSquare size={13} />
                          <Text size="xs">{belief.threadCount}</Text>
                        </Group>
                      </Tooltip>
                    )}
                  </Table.Td>
                  <Table.Td style={{ width: "1%", whiteSpace: "nowrap" }}>
                    <BeliefScopeChips appliesTo={belief.appliesTo} />
                  </Table.Td>
                  <Table.Td w={84} ta="right">
                    <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                      {formatReviewDate(belief.proposedAt)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}
