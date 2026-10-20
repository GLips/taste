import { Badge, Container, Group, Text, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { reviewStoreInfoQuery } from "./review-queries.ts";

const styles = stylex.create({
  page: { minHeight: "100vh", backgroundColor: "var(--mantine-color-gray-0)" },
  header: {
    position: "sticky",
    top: 0,
    zIndex: 10,
    backgroundColor: "white",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "var(--mantine-color-gray-2)",
  },
  bar: { height: "48px" },
  brand: { display: "flex", alignItems: "center", gap: "8px", textDecoration: "none", color: "var(--mantine-color-dark-7)" },
  logo: { width: "26px", height: "26px", display: "block" },
  wordmark: { fontWeight: 750, letterSpacing: "-0.03em", fontSize: "17px" },
  navLink: {
    paddingInline: "10px",
    paddingBlock: "5px",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: 500,
    color: "var(--mantine-color-gray-7)",
    textDecoration: "none",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    ":hover": { backgroundColor: "var(--mantine-color-gray-1)" },
  },
  who: { display: "flex", alignItems: "center", gap: "5px", cursor: "default" },
  main: { paddingBlock: "20px" },
});

// TanStack's `activeProps` styles the current tab; StyleX can't express "this link is active", so this is inline.
const ACTIVE_NAV = { style: { backgroundColor: "var(--mantine-color-taste-0)", color: "var(--mantine-color-taste-9)" } };

export function ReviewAppShell({ children }: { children: ReactNode }) {
  const info = useQuery(reviewStoreInfoQuery);
  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <Container size="lg">
          <Group justify="space-between" {...stylex.props(styles.bar)}>
            <Group gap="lg">
              <Link to="/" {...stylex.props(styles.brand)}>
                <img src="/brand/icon.svg" alt="" {...stylex.props(styles.logo)} />
                <span {...stylex.props(styles.wordmark)}>taste</span>
              </Link>
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
                  Recall
                </Link>
              </Group>
            </Group>
            {info.data !== undefined ? (
              <Tooltip label={`Reviewing as ${info.data.owner} · ${info.data.root}`} withArrow position="bottom-end">
                <span {...stylex.props(styles.who)}>
                  <UserRound size={14} color="var(--mantine-color-gray-6)" />
                  <Text size="xs" c="dimmed">
                    {info.data.owner}
                  </Text>
                </span>
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
