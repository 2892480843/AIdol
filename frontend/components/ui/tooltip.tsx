"use client";
import * as React from "react";
import { Tooltip as MantineTooltip, Box } from "@mantine/core";
import { useTimeout, useUncontrolled, useWindowEvent } from "@mantine/hooks";
import { Slot } from "./slot";
const DelayContext = React.createContext(300);
function TooltipProvider({
  children,
  delayDuration = 300,
  skipDelayDuration = 100,
}: {
  children?: React.ReactNode;
  delayDuration?: number;
  skipDelayDuration?: number;
}) {
  return (
    <DelayContext.Provider value={delayDuration}>
      <MantineTooltip.Group
        openDelay={delayDuration}
        closeDelay={skipDelayDuration}
      >
        {children}
      </MantineTooltip.Group>
    </DelayContext.Provider>
  );
}
interface ContentProps extends React.HTMLAttributes<HTMLDivElement> {
  sideOffset?: number;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}
function Tooltip({
  children,
  open,
  defaultOpen,
  delayDuration,
  onOpenChange,
}: {
  children?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  delayDuration?: number;
}) {
  const nodes = React.Children.toArray(children);
  const trigger = nodes.find(
    (node) => React.isValidElement(node) && node.type === TooltipTrigger,
  );
  const content = nodes.find(
    (node) => React.isValidElement(node) && node.type === TooltipContent,
  ) as React.ReactElement<ContentProps> | undefined;
  const delay = React.useContext(DelayContext);
  const [opened, setOpened] = useUncontrolled({
    value: open,
    defaultValue: defaultOpen,
    finalValue: false,
    onChange: onOpenChange,
  });
  const openedRef = React.useRef(opened);
  openedRef.current = opened;
  const hovered = React.useRef(false);
  const focused = React.useRef(false);
  const change = (next: boolean) => {
    if (next === openedRef.current) return;
    openedRef.current = next;
    setOpened(next);
  };
  const changeRef = React.useRef(change);
  changeRef.current = change;
  const delayedOpen = useTimeout(
    () => changeRef.current(true),
    delayDuration ?? delay,
  );
  useWindowEvent("keydown", (event) => {
    if (onOpenChange && event.key === "Escape") {
      delayedOpen.clear();
      change(false);
    }
  });
  if (!React.isValidElement(trigger)) return null;

  // Mantine 8 has no visibility-change callback. Bridge event intent only when
  // a listener is requested; other callers keep Mantine's native interactions.
  const triggerProps =
    trigger.props as React.ButtonHTMLAttributes<HTMLButtonElement>;
  const startHover = () => {
    hovered.current = true;
    delayedOpen.start();
  };
  const endHover = () => {
    hovered.current = false;
    delayedOpen.clear();
    if (!focused.current) change(false);
  };
  const observedTrigger = onOpenChange
    ? React.cloneElement(
        trigger as React.ReactElement<
          React.ButtonHTMLAttributes<HTMLButtonElement>
        >,
        {
          onMouseEnter: (event) => {
            triggerProps.onMouseEnter?.(event);
            if (!event.defaultPrevented) startHover();
          },
          onMouseLeave: (event) => {
            triggerProps.onMouseLeave?.(event);
            if (!event.defaultPrevented) endHover();
          },
          onFocus: (event) => {
            triggerProps.onFocus?.(event);
            if (!event.defaultPrevented) {
              focused.current = true;
              delayedOpen.clear();
              change(true);
            }
          },
          onBlur: (event) => {
            triggerProps.onBlur?.(event);
            if (!event.defaultPrevented) {
              focused.current = false;
              if (!hovered.current) change(false);
            }
          },
          onPointerEnter: (event) => {
            triggerProps.onPointerEnter?.(event);
            if (!event.defaultPrevented && event.pointerType !== "mouse")
              startHover();
          },
          onPointerLeave: (event) => {
            triggerProps.onPointerLeave?.(event);
            if (!event.defaultPrevented && event.pointerType !== "mouse")
              endHover();
          },
          onPointerDown: (event) => {
            triggerProps.onPointerDown?.(event);
            if (!event.defaultPrevented) {
              delayedOpen.clear();
              change(false);
            }
          },
        },
      )
    : trigger;
  return (
    <MantineTooltip
      label={content?.props.children}
      opened={onOpenChange ? opened : open}
      defaultOpened={defaultOpen}
      openDelay={delayDuration ?? delay}
      offset={content?.props.sideOffset ?? 5}
      position={content?.props.side ?? "top"}
      className={content?.props.className}
      events={
        onOpenChange
          ? { hover: false, focus: false, touch: false }
          : { hover: true, focus: true, touch: true }
      }
      withinPortal
      zIndex={700}
    >
      {observedTrigger}
    </MantineTooltip>
  );
}
const TooltipTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ asChild, children, ...props }, ref) =>
  asChild ? (
    <Slot
      ref={ref as React.ForwardedRef<HTMLElement>}
      {...(props as React.HTMLAttributes<HTMLElement>)}
    >
      {children as React.ReactElement}
    </Slot>
  ) : (
    <Box
      component="button"
      ref={ref}
      type="button"
      data-ui="tooltip-trigger"
      {...props}
    >
      {children}
    </Box>
  ),
);
const TooltipContent = React.forwardRef<HTMLDivElement, ContentProps>(
  () => null,
);
TooltipTrigger.displayName = "TooltipTrigger";
TooltipContent.displayName = "TooltipContent";
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
