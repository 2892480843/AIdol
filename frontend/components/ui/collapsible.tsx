"use client";
import * as React from "react";
import { Box, Collapse } from "@mantine/core";
import { Slot } from "./slot";
interface CollapsibleValue {
  open: boolean;
  change: (open: boolean) => void;
  id: string;
  disabled?: boolean;
}
const Context = React.createContext<CollapsibleValue | null>(null);
function useCollapsible() {
  const value = React.useContext(Context);
  if (!value) throw new Error("Collapsible components require Collapsible");
  return value;
}
interface CollapsibleProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
}
const Collapsible = React.forwardRef<HTMLDivElement, CollapsibleProps>(
  (
    {
      open: controlled,
      defaultOpen = false,
      onOpenChange,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const [local, setLocal] = React.useState(defaultOpen);
    const open = controlled ?? local;
    const id = React.useId();
    const change = (next: boolean) => {
      if (disabled) return;
      if (controlled === undefined) setLocal(next);
      onOpenChange?.(next);
    };
    return (
      <Context.Provider value={{ open, change, id, disabled }}>
        <Box
          ref={ref}
          data-ui="collapsible"
          data-state={open ? "open" : "closed"}
          {...props}
        >
          {children}
        </Box>
      </Context.Provider>
    );
  },
);
const CollapsibleTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ asChild, onClick, children, ...props }, ref) => {
  const ctx = useCollapsible();
  const shared = {
    ...props,
    "aria-expanded": ctx.open,
    "aria-controls": ctx.id,
    disabled: ctx.disabled,
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (!event.defaultPrevented) ctx.change(!ctx.open);
    },
  };
  return asChild ? (
    <Slot
      ref={ref as React.ForwardedRef<HTMLElement>}
      {...(shared as React.HTMLAttributes<HTMLElement>)}
    >
      {children as React.ReactElement}
    </Slot>
  ) : (
    <Box
      component="button"
      type="button"
      ref={ref}
      data-ui="collapsible-trigger"
      {...shared}
    >
      {children}
    </Box>
  );
});
const CollapsibleContent = React.forwardRef<
  HTMLDivElement,
  Omit<React.HTMLAttributes<HTMLDivElement>, "onTransitionEnd"> & {
    forceMount?: boolean;
  }
>(({ forceMount, ...props }, ref) => {
  const ctx = useCollapsible();
  return (
    <Collapse
      ref={ref}
      in={ctx.open}
      keepMounted={forceMount}
      id={ctx.id}
      data-ui="collapsible-content"
      {...props}
    />
  );
});
Collapsible.displayName = "Collapsible";
CollapsibleTrigger.displayName = "CollapsibleTrigger";
CollapsibleContent.displayName = "CollapsibleContent";
export { Collapsible, CollapsibleTrigger, CollapsibleContent };
