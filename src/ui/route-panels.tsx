import { Alert, Button, Center, Code, Stack, Text, Title } from "@mantine/core";
import { Link, type ErrorComponentProps } from "@tanstack/react-router";

export function RouteErrorPanel({ error, reset }: ErrorComponentProps) {
  return (
    <Center py="xl">
      <Alert color="red" title="Something went wrong" maw={560} w="100%">
        <Stack gap="sm">
          <Text>{error.message}</Text>
          <Button variant="light" color="red" onClick={reset} w="fit-content">
            Try again
          </Button>
        </Stack>
      </Alert>
    </Center>
  );
}

export function RouteNotFoundPanel() {
  return (
    <Center py="xl">
      <Stack align="center" gap="xs">
        <Title order={3}>Nothing here</Title>
        <Text c="dimmed">
          That page does not exist. <Link to="/">Back to the inbox</Link>
        </Text>
      </Stack>
    </Center>
  );
}

/** A query's failure, inline: the screens keep polling, so this clears itself once the store reads again. */
export function QueryErrorAlert({ error }: { error: Error }) {
  return (
    <Alert color="red" title="Could not load this">
      <Code block>{error.message}</Code>
    </Alert>
  );
}
