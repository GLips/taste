import {
  Accordion,
  Alert,
  Autocomplete,
  Badge,
  Box,
  Button,
  Center,
  Code,
  Group,
  Loader,
  Paper,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AnchorLink } from "../ui/router-links.tsx";
import { Schema } from "effect";
import { useState, type ReactNode } from "react";
import type { RecalledBelief, RecallResult } from "../core/index.ts";
import { shortIdOf } from "../shared/vocabulary.ts";
import { BeliefScopeChips, BeliefStatusBadge } from "../ui/belief-chips.tsx";
import { formatReviewDate } from "../ui/format.ts";
import { MemoryQuote } from "../ui/memory-quote.tsx";
import { recallInspectionQuery, reviewStoreInfoQuery } from "../ui/review-queries.ts";
import { QueryErrorAlert } from "../ui/route-panels.tsx";

const RecallSearch = Schema.Struct({
  q: Schema.optionalKey(Schema.String),
  scope: Schema.optionalKey(Schema.String),
  history: Schema.optionalKey(Schema.Boolean),
});

export const Route = createFileRoute("/recall")({
  validateSearch: Schema.toStandardSchemaV1(RecallSearch),
  component: RecallInspectorScreen,
});

const styles = stylex.create({
  layout: {
    display: "grid",
    gridTemplateColumns: { default: "minmax(0, 1fr) minmax(0, 1fr)", "@media (max-width: 960px)": "minmax(0, 1fr)" },
    gap: "24px",
    alignItems: "start",
  },
  payload: { whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "12px", lineHeight: 1.55 },
  sectionLabel: { textTransform: "uppercase", letterSpacing: "0.06em", fontSize: "11px", fontWeight: 600 },
});

function SectionHeading({ children, count }: { children: ReactNode; count: number }) {
  return (
    <Group gap={6}>
      <Text c="dimmed" {...stylex.props(styles.sectionLabel)}>
        {children}
      </Text>
      <Badge size="xs" color="gray" variant="light" circle>
        {count}
      </Badge>
    </Group>
  );
}

function BeliefLinkText({ id, children }: { id: string; children: ReactNode }) {
  return (
    <AnchorLink to="/beliefs/$id" params={{ id }} c="inherit" fw={500} size="sm" underline="hover">
      {children}
    </AnchorLink>
  );
}

function RecalledBeliefItem({ belief }: { belief: RecalledBelief }) {
  return (
    <Paper p="sm">
      <Stack gap={6}>
        <Group gap={6}>
          <BeliefStatusBadge status={belief.status} />
          <BeliefScopeChips appliesTo={belief.appliesTo} />
        </Group>
        <BeliefLinkText id={belief.id}>{belief.statement}</BeliefLinkText>
        {belief.quotes.map((memory) => (
          <MemoryQuote key={memory.id} memory={memory} />
        ))}
      </Stack>
    </Paper>
  );
}

function RecallSections({ recall }: { recall: RecallResult }) {
  return (
    <Stack gap="md">
      <SectionHeading count={recall.believed.length}>Believed</SectionHeading>
      {recall.believed.length === 0 && <Text c="dimmed">No accepted belief in scope matches.</Text>}
      {recall.believed.map((belief) => (
        <RecalledBeliefItem key={belief.id} belief={belief} />
      ))}

      <SectionHeading count={recall.notBelieved.length}>Not believed</SectionHeading>
      {recall.notBelieved.length === 0 && <Text c="dimmed">No rejected belief matches.</Text>}
      {recall.notBelieved.map((rejection) => (
        <Paper key={rejection.id} p="sm">
          <Stack gap={4}>
            <Group gap={6}>
              <BeliefStatusBadge status="rejected" />
              <BeliefScopeChips appliesTo={rejection.appliesTo} />
            </Group>
            <BeliefLinkText id={rejection.id}>{rejection.statement}</BeliefLinkText>
            <Text size="xs" c="dimmed">
              Rejected {formatReviewDate(rejection.decidedAt)}: “{rejection.reason}”
            </Text>
          </Stack>
        </Paper>
      ))}

      <SectionHeading count={recall.memories.length}>Memories</SectionHeading>
      {recall.memories.length === 0 && <Text c="dimmed">No quote matches.</Text>}
      {recall.memories.map((memory) => (
        <MemoryQuote key={memory.id} memory={memory} />
      ))}

      {recall.history.length > 0 && (
        <>
          <SectionHeading count={recall.history.length}>History</SectionHeading>
          {recall.history.map((belief) => (
            <RecalledBeliefItem key={belief.id} belief={belief} />
          ))}
        </>
      )}
    </Stack>
  );
}

function RecallInspectorScreen() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [query, setQuery] = useState(search.q ?? "");
  const [scope, setScope] = useState(search.scope ?? "");
  const scopes = useQuery(reviewStoreInfoQuery).data?.scopes ?? [];
  const submitted = { query: search.q ?? "", scope: search.scope, history: search.history ?? false };
  const inspection = useQuery(recallInspectionQuery(submitted));

  const run = (history = submitted.history) =>
    void navigate({
      search: {
        ...(query.trim() !== "" && { q: query.trim() }),
        ...(scope.trim() !== "" && { scope: scope.trim() }),
        ...(history && { history: true }),
      },
      replace: true,
    });

  const believedById = new Map((inspection.data?.recall.believed ?? []).map((belief) => [belief.id, belief]));

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Recall inspector</Title>
        <Text c="dimmed">What an agent would get for a prompt: the full recall, and the exact text the hook would inject.</Text>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          run();
        }}
      >
        <Group align="flex-end" gap="sm">
          <TextInput
            label="Prompt"
            placeholder="e.g. add styling to the billing settings page"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            style={{ flex: 1 }}
            autoFocus
          />
          <Autocomplete
            label="Scope"
            placeholder="Every scope"
            data={scopes}
            value={scope}
            onChange={setScope}
            w={200}
          />
          <Button type="submit" size="sm">
            Recall
          </Button>
        </Group>
        <Switch
          mt="sm"
          size="xs"
          label="Include superseded and retracted (history)"
          checked={submitted.history}
          onChange={(event) => run(event.currentTarget.checked)}
        />
      </form>

      {submitted.query === "" ? (
        <Center py={60}>
          <Text c="dimmed">Type a prompt to see what Taste would recall for it.</Text>
        </Center>
      ) : inspection.error ? (
        <QueryErrorAlert error={inspection.error} />
      ) : inspection.data === undefined ? (
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      ) : (
        <div {...stylex.props(styles.layout)}>
          <Box>
            <Text fw={600} mb="sm">
              Recall
            </Text>
            <RecallSections recall={inspection.data.recall} />
          </Box>
          <Box>
            <Text fw={600} mb="sm">
              Hook payload
            </Text>
            {inspection.data.hook.additionalContext === undefined ? (
              <Alert color="gray" variant="light">
                Nothing matched, so the hook would print nothing and the prompt goes through untouched.
              </Alert>
            ) : (
              <Stack gap="md">
                <Paper p="md">
                  <Code block {...stylex.props(styles.payload)}>
                    {inspection.data.hook.additionalContext}
                  </Code>
                </Paper>
                <Accordion variant="separated" multiple>
                  {inspection.data.hook.items.map((item) => {
                    const believed = believedById.get(item.id);
                    return (
                      <Accordion.Item key={item.id} value={item.id}>
                        <Accordion.Control>
                          <Group gap={6} wrap="nowrap">
                            <Badge size="xs" color={item.status === "accepted" ? "teal" : "red"} style={{ flexShrink: 0 }}>
                              {item.status === "accepted" ? "believed" : "not believed"}
                            </Badge>
                            <Text size="sm" truncate>
                              {item.statement}
                            </Text>
                          </Group>
                        </Accordion.Control>
                        <Accordion.Panel>
                          <Stack gap="xs">
                            <Text size="xs" c="dimmed">
                              <Code>{shortIdOf(item.id)}</Code> ·{" "}
                              <AnchorLink to="/beliefs/$id" params={{ id: item.id }} size="xs">
                                open belief
                              </AnchorLink>
                            </Text>
                            {item.status === "rejected" && (
                              <Text size="sm">
                                Rejected {formatReviewDate(item.decidedAt)}: “{item.reason}”
                              </Text>
                            )}
                            {believed?.quotes.map((memory) => (
                              <MemoryQuote key={memory.id} memory={memory} />
                            ))}
                          </Stack>
                        </Accordion.Panel>
                      </Accordion.Item>
                    );
                  })}
                  <Accordion.Item value="raw">
                    <Accordion.Control>
                      <Text size="sm" c="dimmed">
                        Raw hook stdout
                      </Text>
                    </Accordion.Control>
                    <Accordion.Panel>
                      <Code block {...stylex.props(styles.payload)}>
                        {inspection.data.hook.hookOutput}
                      </Code>
                    </Accordion.Panel>
                  </Accordion.Item>
                </Accordion>
              </Stack>
            )}
          </Box>
        </div>
      )}
    </Stack>
  );
}
