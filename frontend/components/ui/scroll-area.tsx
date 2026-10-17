"use client";
import * as React from "react";
import {
  ScrollArea as MantineScrollArea,
  Box,
  type ScrollAreaProps,
} from "@mantine/core";
const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  (props, ref) => (
    <MantineScrollArea
      ref={ref}
      data-ui="scroll-area"
      scrollbarSize={8}
      {...props}
    />
  ),
);
const ScrollBar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    orientation?: "horizontal" | "vertical";
  }
>(({ orientation = "vertical", ...props }, ref) => (
  <Box
    ref={ref}
    data-ui="scroll-bar"
    data-orientation={orientation}
    aria-hidden
    {...props}
  />
));
ScrollArea.displayName = "ScrollArea";
ScrollBar.displayName = "ScrollBar";
export { ScrollArea, ScrollBar };
