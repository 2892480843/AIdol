"use client";
import * as React from "react";
import {
  Tabs as MantineTabs,
  type TabsProps as MantineTabsProps,
} from "@mantine/core";
interface TabsProps extends Omit<MantineTabsProps, "onChange"> {
  onValueChange?: (value: string) => void;
  activationMode?: "automatic" | "manual";
}
const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  ({ onValueChange, activationMode, ...props }, ref) => (
    <MantineTabs
      ref={ref}
      data-ui="tabs"
      keepMounted={false}
      activateTabWithKeyboard={activationMode !== "manual"}
      onChange={(value) => {
        if (value !== null) onValueChange?.(value);
      }}
      {...props}
    />
  ),
);
const TabsList = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof MantineTabs.List>
>((props, ref) => (
  <MantineTabs.List ref={ref} data-ui="tabs-list" {...props} />
));
const TabsTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof MantineTabs.Tab>
>((props, ref) => (
  <MantineTabs.Tab ref={ref} data-ui="tabs-trigger" {...props} />
));
const TabsContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof MantineTabs.Panel>
>((props, ref) => (
  <MantineTabs.Panel ref={ref} data-ui="tabs-content" pt="sm" {...props} />
));
Tabs.displayName = "Tabs";
TabsList.displayName = "TabsList";
TabsTrigger.displayName = "TabsTrigger";
TabsContent.displayName = "TabsContent";
export { Tabs, TabsList, TabsTrigger, TabsContent };
