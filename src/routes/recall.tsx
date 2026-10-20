import {
  ActionIcon,
  Alert,
  Autocomplete,
  Button,
  Center,
  Code,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Schema } from "effect";
import { FolderTree, History, Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { RecalledBelief, RecallResult } from "../core/index.ts";
import { BeliefScopeChips, BeliefStatusDot } from "../ui/belief-chips.tsx";
import { formatReviewDate } from "../ui/format.ts";
import { MemoryQuote } from "../ui/memory-quote.tsx";
import { recallInspectionQuery, reviewStoreInfoQuery } from "../ui/review-queries.ts";
import { QueryErrorAlert } from "../ui/route-panels.tsx";
import { AnchorLink } from "../ui/router-links.tsx";

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
    gap: "20px",
    alignItems: "start",
  },
  payload: { whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "12px", lineHeight: 1.55 },
  row: { display: "flex", gap: "8px", alignItems: "baseline" },
  rowBody: { minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: "4px" },
  quotes: { paddingLeft: "2px" },
});

function RecallSectionHeading({ children, count }: { children: ReactNode; count: number }) {
  return (
    <Text size="sm" fw={600}>
      {children}{" "}
      <Text span size="xs" c="dimmed" fw={400}>
        {count}
      </Text>
    </Text>
  );
}

/** One recalled belief as a row: status dot, wording, scope, and whatever should travel with it. */
function RecallBeliefRow({ id, status, statement, appliesTo, children }: Pick<RecalledBelief, "id" | "status" | "statement" | "appliesTo"> & { children?: ReactNode }) {
  return (
    <div {...stylex.props(styles.row)}>
      <BeliefStatusDot status={status} />
      <div {...stylex.props(styles.rowBody)}>
        <Group gap={6} wrap="nowrap" justify="space-between" align="flex-start">
          <AnchorLink to="/beliefs/$id" params={{ id }} c="inherit" fw={500} size="sm" underline="hover">
            {statement}
          </AnchorLink>
          <BeliefScopeChips appliesTo={appliesTo} />
        </Group>
        {children}
      </div>
    </div>
  );
}

function RecallSections({ recall }: { recall: RecallResult }) {
  return (
    <Stack gap="md">
      <Stack gap={8}>
        <RecallSectionHeading count={recall.believed.length}>Believed</RecallSectionHeading>
        {recall.believed.map((belief) => (
          <RecallBeliefRow key={belief.id} {...belief}>
            <Stack gap={4} {...stylex.props(styles.quotes)}>
              {belief.quotes.map((memory) => (
                <MemoryQuote key={memory.id} memory={memory} />
              ))}
            </Stack>
          </RecallBeliefRow>
        ))}
      </Stack>

      {recall.notBelieved.length > 0 && (
        <Stack gap={8}>
          <RecallSectionHeading count={recall.notBelieved.length}>Not believed</RecallSectionHeading>
          {recall.notBelieved.map((rejection) => (
            <RecallBeliefRow key={rejection.id} id={rejection.id} status="rejected" statement={rejection.statement} appliesTo={rejection.appliesTo}>
              <Text size="xs" c="dimmed">
                “{rejection.reason}” · {formatReviewDate(rejection.decidedAt)}
              </Text>
            </RecallBeliefRow>
          ))}
        </Stack>
      )}

      {recall.memories.length > 0 && (
        <Stack gap={8}>
          <RecallSectionHeading count={recall.memories.length}>Loose quotes</RecallSectionHeading>
          {recall.memories.map((memory) => (
            <MemoryQuote key={memory.id} memory={memory} />
          ))}
        </Stack>
      )}

      {recall.history.length > 0 && (
        <Stack gap={8}>
          <RecallSectionHeading count={recall.history.length}>History</RecallSectionHeading>
          {recall.history.map((belief) => (
            <RecallBeliefRow key={belief.id} {...belief} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function HookPayloadPanel({ context, stdout }: { context: string; stdout: string }) {
  const [view, setView] = useState<"context" | "stdout">("context");
  return (
    <Paper p="sm">
      <Group justify="space-between" mb="xs">
        <Tooltip label="The exact text the prompt hook would add before the agent sees the prompt" withArrow multiline w={260}>
          <Text size="sm" fw={600}>
            Injected
          </Text>
        </Tooltip>
        <SegmentedControl
          size="xs"
          value={view}
          onChange={(value) => setView(value as "context" | "stdout")}
          data={[
            { value: "context", label: "Context" },
            { value: "stdout", label: "Hook stdout" },
          ]}
        />
      </Group>
      <Code block {...stylex.props(styles.payload)}>
        {view === "context" ? context : stdout}
      </Code>
    </Paper>
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

  return (
    <Stack gap="md">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          run();
        }}
      >
        <Group gap="sm" wrap="nowrap">
          <Tooltip label="What an agent would be told for a prompt" withArrow position="bottom-start">
            <Title order={3}>Recall</Title>
          </Tooltip>
          <TextInput
            aria-label="Prompt"
            placeholder="A prompt, e.g. add styling to the billing settings page"
            leftSection={<Search size={14} />}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            style={{ flex: 1 }}
            autoFocus
          />
          <Autocomplete aria-label="Scope" placeholder="Any scope" leftSection={<FolderTree size={14} />} data={scopes} value={scope} onChange={setScope} w={180} />
          <Tooltip label={submitted.history ? "Hiding nothing: replaced and retracted included" : "Include replaced and retracted beliefs"} withArrow>
            <ActionIcon
              size="lg"
              variant={submitted.history ? "light" : "default"}
              aria-label="Include history"
              aria-pressed={submitted.history}
              onClick={() => run(!submitted.history)}
            >
              <History size={16} />
            </ActionIcon>
          </Tooltip>
          <Button type="submit" size="sm">
            Recall
          </Button>
        </Group>
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
          <RecallSections recall={inspection.data.recall} />
          {inspection.data.hook.additionalContext === undefined || inspection.data.hook.hookOutput === undefined ? (
            <Alert color="gray" variant="light">
              Nothing matched, so the hook stays silent and the prompt goes through untouched.
            </Alert>
          ) : (
            <HookPayloadPanel context={inspection.data.hook.additionalContext} stdout={inspection.data.hook.hookOutput} />
          )}
        </div>
      )}
    </Stack>
  );
}
