import { Badge, Button, createTheme, Paper, Text } from "@mantine/core";

/** A quiet, light reviewing tool: neutral ground, one accent, colour reserved for status and warnings. */
export const tasteMantineTheme = createTheme({
  primaryColor: "indigo",
  primaryShade: { light: 6, dark: 5 },
  defaultRadius: "md",
  cursorType: "pointer",
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  fontFamilyMonospace: 'ui-monospace, "SF Mono", Menlo, monospace',
  headings: { fontWeight: "600" },
  components: {
    Button: Button.extend({ defaultProps: { size: "xs" } }),
    Badge: Badge.extend({ defaultProps: { radius: "sm", variant: "light" } }),
    Text: Text.extend({ defaultProps: { size: "sm" } }),
    Paper: Paper.extend({ defaultProps: { withBorder: true, radius: "md" } }),
  },
});
