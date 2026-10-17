"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export function setRef<T>(
  ref: React.ForwardedRef<T> | undefined,
  value: T | null,
) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

// Keep the child element (not a nested button), including its own handlers/ref.
export const Slot = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement> & { children: React.ReactElement }
>(({ children, ...props }, ref) => {
  const child = React.Children.only(children) as React.ReactElement<
    React.HTMLAttributes<HTMLElement>
  >;
  const merged: Record<string, unknown> = { ...props, ...child.props };
  for (const key of Object.keys(props)) {
    const parentHandler = props[key as keyof typeof props];
    const childHandler = child.props[key as keyof typeof child.props];
    if (/^on[A-Z]/.test(key) && typeof parentHandler === "function") {
      merged[key] = (event: React.SyntheticEvent) => {
        if (typeof childHandler === "function")
          (childHandler as (event: React.SyntheticEvent) => void)(event);
        if (!event.defaultPrevented)
          (parentHandler as (event: React.SyntheticEvent) => void)(event);
      };
    }
  }
  merged.className = cn(props.className, child.props.className);
  merged.style = { ...props.style, ...child.props.style };
  merged.ref = (node: HTMLElement | null) => {
    setRef(ref, node);
    setRef(
      (child as unknown as { ref?: React.ForwardedRef<HTMLElement> }).ref,
      node,
    );
  };
  return React.cloneElement(child, merged);
});
Slot.displayName = "Slot";
