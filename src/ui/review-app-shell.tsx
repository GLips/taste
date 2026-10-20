import { Badge, Container, Group, Text, Tooltip, UnstyledButton } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { reviewStoreInfoQuery } from "./review-queries.ts";

const styles = stylex.create({
  page: { minHeight: "100vh", backgroundColor: "var(--mantine-color-gray-0)" },
  header: {
    position: "sticky",
    top: 0,
    zIndex: 10,
    backgroundColor: "rgba(255,255,255,0.92)",
    backdropFilter: "blur(8px)",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "var(--mantine-color-gray-2)",
  },
  bar: { height: "52px" },
  wordmark: { fontWeight: 700, letterSpacing: "-0.02em", fontSize: "16px" },
  navLink: {
    paddingInline: "10px",
    paddingBlock: "6px",
    borderRadius: "6px",
    fontSize: "14px",
    color: "var(--mantine-color-gray-7)",
    textDecoration: "none",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    ":hover": { backgroundColor: "var(--mantine-color-gray-1)" },
  },
  main: { paddingBlock: "28px" },
});

// TanStack's `activeProps` styles the current tab; StyleX can't express "this link is active", so this is inline.
const ACTIVE_NAV = { style: { backgroundColor: "var(--mantine-color-indigo-0)", color: "var(--mantine-color-indigo-7)" } };

export function ReviewAppShell({ children }: { children: ReactNode }) {
  const info = useQuery(reviewStoreInfoQuery);
  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <Container size="lg">
          <Group justify="space-between" {...stylex.props(styles.bar)}>
            <Group gap="lg">
              <UnstyledButton component={Link} to="/">
                <span {...stylex.props(styles.wordmark)}>taste</span>
              </UnstyledButton>
              <Group gap={2}>
                <Link to="/" {...stylex.props(styles.navLink)} activeOptions={{ exact: true }} activeProps={ACTIVE_NAV}>
                  Inbox
                  {info.data !== undefined && info.data.pendingCount > 0 && (
                    <Badge size="sm" circle={info.data.pendingCount < 10} variant="filled">
                      {info.data.pendingCount}
                    </Badge>
                  )}
                </Link>
                <Link to="/beliefs" {...stylex.props(styles.navLink)} activeProps={ACTIVE_NAV}>
                  Beliefs
                </Link>
                <Link to="/recall" {...stylex.props(styles.navLink)} activeProps={ACTIVE_NAV}>
                  Recall inspector
                </Link>
              </Group>
            </Group>
            {info.data !== undefined ? (
              <Tooltip label={info.data.root} withArrow>
                <Text size="xs" c="dimmed">
                  Reviewing as <b>{info.data.owner}</b>
                </Text>
              </Tooltip>
            ) : info.error ? (
              <Text size="xs" c="red">
                Store unavailable
              </Text>
            ) : null}
          </Group>
        </Container>
      </header>
      <Container size="lg" {...stylex.props(styles.main)}>
        {children}
      </Container>
    </div>
  );
}
