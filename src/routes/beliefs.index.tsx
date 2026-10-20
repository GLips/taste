import { Center, Group, Loader, Paper, SegmentedControl, Select, Stack, Table, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AnchorLink } from "../ui/router-links.tsx";
import { Schema } from "effect";
import { BeliefScopeChips, BeliefStatusBadge } from "../ui/belief-chips.tsx";
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
    <Stack gap="lg">
      <div>
        <Title order={2}>Beliefs</Title>
        <Text c="dimmed">Everything ever proposed, with what became of it.</Text>
      </div>
      <Group justify="space-between">
        <SegmentedControl
          size="xs"
          value={search.status ?? "all"}
          data={STATUS_CHOICES.map((value) => ({ value, label: value[0]?.toUpperCase() + value.slice(1) }))}
          onChange={(value) => setFilter({ status: value === "all" ? undefined : (value as BeliefStatus) })}
        />
        <Select
          size="xs"
          w={220}
          placeholder="Every scope"
          clearable
          value={search.scope ?? null}
          data={scopes ?? (search.scope ? [search.scope] : [])}
          onChange={(value) => setFilter({ scope: value ?? undefined })}
          description={search.scope ? "Includes beliefs that apply everywhere" : undefined}
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
          <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Belief</Table.Th>
                <Table.Th w={130}>Status</Table.Th>
                <Table.Th w={180}>Scope</Table.Th>
                <Table.Th w={120}>Proposed</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {list.data.map((belief) => (
                <Table.Tr key={belief.id}>
                  <Table.Td>
                    <AnchorLink to="/beliefs/$id" params={{ id: belief.id }} c="inherit" fw={500} size="sm" underline="hover">
                      {belief.statement}
                    </AnchorLink>
                    {belief.replacedBy !== undefined && (
                      <Text size="xs" c="dimmed">
                        Replaced by{" "}
                        <AnchorLink to="/beliefs/$id" params={{ id: belief.replacedBy.id }} size="xs">
                          {belief.replacedBy.statement}
                        </AnchorLink>
                      </Text>
                    )}
                    {belief.status === "rejected" && belief.reason !== undefined && (
                      <Text size="xs" c="dimmed">
                        Rejected: “{belief.reason}”
                      </Text>
                    )}
                    {belief.threadCount > 0 && (
                      <Text size="xs" c="dimmed">
                        {belief.threadCount} {belief.threadCount === 1 ? "note" : "notes"}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <BeliefStatusBadge status={belief.status} />
                  </Table.Td>
                  <Table.Td>
                    <BeliefScopeChips appliesTo={belief.appliesTo} />
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
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
