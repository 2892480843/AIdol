"use client";
import * as React from "react";
import { Menu } from "@mantine/core";
import { Button, type ButtonProps } from "./button";
import { Slot } from "./slot";
interface MenuProps {
  children?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}
function DropdownMenu({
  children,
  open,
  defaultOpen,
  onOpenChange,
}: MenuProps) {
  const content = React.Children.toArray(children).find(
    (node) => React.isValidElement(node) && node.type === DropdownMenuContent,
  ) as
    | React.ReactElement<{
        align?: "start" | "center" | "end";
        sideOffset?: number;
      }>
    | undefined;
  return (
    <Menu
      opened={open}
      defaultOpened={defaultOpen}
      onChange={onOpenChange}
      position={content?.props.align === "end" ? "bottom-end" : "bottom-start"}
      offset={content?.props.sideOffset ?? 4}
      withinPortal
      zIndex={650}
    >
      {children}
    </Menu>
  );
}
const DropdownMenuTrigger = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild, children, ...props }, ref) => (
    <Menu.Target>
      {asChild ? (
        <Slot
          ref={ref as React.ForwardedRef<HTMLElement>}
          {...(props as React.HTMLAttributes<HTMLElement>)}
        >
          {children as React.ReactElement}
        </Slot>
      ) : (
        <Button ref={ref} type="button" {...props}>
          {children}
        </Button>
      )}
    </Menu.Target>
  ),
);
const DropdownMenuContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    align?: "start" | "center" | "end";
    sideOffset?: number;
  }
>(({ align, sideOffset, ...props }, ref) => (
  <Menu.Dropdown ref={ref} data-ui="dropdown-menu-content" {...props} />
));
const DropdownMenuItem = React.forwardRef<
  HTMLButtonElement,
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onSelect"> & {
    inset?: boolean;
    onSelect?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  }
>(({ inset, onSelect, onClick, ...props }, ref) => (
  <Menu.Item
    ref={ref}
    data-ui="dropdown-menu-item"
    pl={inset ? "xl" : undefined}
    onClick={(event) => {
      onSelect?.(event);
      if (!event.defaultPrevented) onClick?.(event);
    }}
    {...props}
  />
));
DropdownMenuTrigger.displayName = "DropdownMenuTrigger";
DropdownMenuContent.displayName = "DropdownMenuContent";
DropdownMenuItem.displayName = "DropdownMenuItem";
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
};
