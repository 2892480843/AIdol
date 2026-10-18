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
  "#fdf0e8", "#faddd2", "#f4b9a6", "#ee927b", "#e9745c",
  "#e85b44", "#e74c3c", "#b7382b", "#942c21", "#702017",
] as const;

export const wardrobeTheme = createTheme({
  primaryColor: "raspberry",
  primaryShade: { light: 7, dark: 7 },
  white: "#ffffff",
  black: "#171717",
  colors: {
    raspberry,
    // Existing status badges use this name; keep their API on the current palette.
    forest: raspberry,
    terracotta: raspberry,
    gray: [
      "#fcfaf5", "#f5f0e8", "#ebe4d8", "#d9d0c2", "#bfb3a1",
      "#9b8f7f", "#746b60", "#59534b", "#403c36", "#2d2d2d",
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
      'Georgia, "Songti SC", "STSong", "Noto Serif CJK SC", serif',
    fontWeight: "800",
  },
  fontSizes: { xs: "13px", sm: "14px", md: "15px", lg: "17px", xl: "20px" },
  shadows: {
    xs: "3px 3px 0 #2d2d2d",
    sm: "5px 5px 0 #2d2d2d",
    md: "5px 5px 0 #2d2d2d",
    lg: "7px 7px 0 #2d2d2d",
    xl: "9px 9px 0 #2d2d2d",
  },
  defaultRadius: "md",
  radius: { xs: "0", sm: "2px", md: "0", lg: "0", xl: "0" },
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
