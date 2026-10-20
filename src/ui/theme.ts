import { ActionIcon, Badge, Button, createTheme, type MantineColorsTuple, Paper, Text, Tooltip } from "@mantine/core";

// The logo's green, as a Mantine ramp: shade 6 is the mark itself (#3BB273).
const tasteGreen: MantineColorsTuple = [
  "#e9f8f0", "#d6efe2", "#aedcc4", "#83c9a4", "#5fba89", "#47b078", "#3bb273", "#2c9560", "#228454", "#107345",
];

/** A quiet, light reviewing tool: neutral ground, the logo's green as the one accent, colour reserved for state. */
export const tasteMantineTheme = createTheme({
  primaryColor: "taste",
  colors: { taste: tasteGreen },
  primaryShade: { light: 7, dark: 5 },
  defaultRadius: "md",
  cursorType: "pointer",
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  fontFamilyMonospace: 'ui-monospace, "SF Mono", Menlo, monospace',
  headings: { fontWeight: "650" },
  components: {
    Button: Button.extend({ defaultProps: { size: "xs" } }),
    ActionIcon: ActionIcon.extend({ defaultProps: { radius: "md" } }),
    Badge: Badge.extend({ defaultProps: { radius: "sm", variant: "light", size: "sm" } }),
    Text: Text.extend({ defaultProps: { size: "sm" } }),
    Paper: Paper.extend({ defaultProps: { withBorder: true, radius: "md" } }),
    Tooltip: Tooltip.extend({ defaultProps: { openDelay: 250, fz: "xs" } }),
  },
});
