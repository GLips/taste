import { Button, Group, Kbd, Text, Textarea } from "@mantine/core";
import { useState } from "react";

/** A rejection always carries a reason: it is what a later agent is shown when it proposes the same idea again. */
export function RejectReasonForm({
  pending,
  onSubmit,
  onCancel,
}: {
  pending: boolean;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  const submit = () => {
    if (trimmed !== "") onSubmit(trimmed);
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Textarea
        data-autofocus
        autoFocus
        label="Why reject it?"
        description="Shown to any agent that proposes this again."
        placeholder="e.g. only true for acme-web"
        autosize
        minRows={2}
        value={reason}
        onChange={(event) => setReason(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            submit();
          }
          if (event.key === "Escape") onCancel();
        }}
      />
      <Group justify="space-between" mt="xs">
        <Text size="xs" c="dimmed">
          <Kbd size="xs">⌘</Kbd> <Kbd size="xs">Enter</Kbd> to reject · <Kbd size="xs">Esc</Kbd> to cancel
        </Text>
        <Group gap="xs">
          <Button variant="default" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" color="red" disabled={trimmed === ""} loading={pending}>
            Reject
          </Button>
        </Group>
      </Group>
    </form>
  );
}
