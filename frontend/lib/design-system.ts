import {
  Button,
  Card,
  Drawer,
  Input,
  Menu,
  Modal,
  Paper,
  Select,
  Tabs,
  Tooltip,
  createTheme,
} from "@mantine/core";

const raspberry = [
  "#fff0f3",
  "#ffe1e7",
  "#ffc7d1",
  "#ffabbc",
  "#f78aa1",
  "#e66c86",
  "#da526d",
  "#c84356",
  "#ad3046",
  "#90243b",
] as const;

export const wardrobeTheme = createTheme({
  primaryColor: "raspberry",
  primaryShade: { light: 7, dark: 3 },
  white: "#ffffff",
  black: "#2c2833",
  colors: {
    raspberry,
    // Existing status badges use this name; keep their API on the current palette.
    forest: raspberry,
    terracotta: raspberry,
    gray: [
      "#fcfbfd",
      "#f6f3f8",
      "#ece6f0",
      "#d9d0e0",
      "#b8adbf",
      "#95899e",
      "#716978",
      "#5a5161",
      "#423a4a",
      "#2c2833",
    ],
    dark: [
      "#ebe5f2",
      "#d1c7db",
      "#b6aac2",
      "#91839f",
      "#64586f",
      "#463b51",
      "#332b3e",
      "#28222f",
      "#201b26",
      "#18141d",
    ],
  },
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
  headings: {
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif',
    fontWeight: "650",
  },
  fontSizes: { xs: "13px", sm: "14px", md: "15px", lg: "17px", xl: "20px" },
  shadows: {
    xs: "0 3px 18px rgba(52, 29, 66, 0.045)",
    sm: "0 5px 24px rgba(52, 29, 66, 0.07)",
  },
  defaultRadius: "md",
  radius: { xs: "6px", sm: "10px", md: "12px", lg: "16px", xl: "20px" },
  components: {
    Button: Button.extend({
      defaultProps: { radius: "md", autoContrast: true },
      classNames: { root: "design-button" },
    }),
    Input: Input.extend({ classNames: { input: "design-input" } }),
    Select: Select.extend({
      defaultProps: { checkIconPosition: "right", radius: "md" },
    }),
    Card: Card.extend({
      defaultProps: { radius: "lg", withBorder: false, shadow: "none" },
    }),
    Paper: Paper.extend({ defaultProps: { radius: "lg", shadow: "none" } }),
    Modal: Modal.extend({
      defaultProps: {
        radius: "lg",
        centered: true,
        padding: "lg",
        overlayProps: { backgroundOpacity: 0.35 },
        transitionProps: { duration: 160 },
      },
      classNames: { content: "design-modal", header: "design-modal-header" },
    }),
    Drawer: Drawer.extend({
      defaultProps: {
        padding: "lg",
        overlayProps: { backgroundOpacity: 0.35 },
        transitionProps: { duration: 180 },
      },
    }),
    Menu: Menu.extend({
      defaultProps: { radius: "md", shadow: "md", offset: 8 },
    }),
    Tabs: Tabs.extend({ defaultProps: { radius: "md", keepMounted: false } }),
    Tooltip: Tooltip.extend({
      defaultProps: { radius: "sm", withArrow: true, openDelay: 300 },
    }),
  },
});
