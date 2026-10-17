"use client";
import * as React from "react";
import { Switch as MantineSwitch } from "@mantine/core";
interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  onCheckedChange?: (checked: boolean) => void;
}
const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ onCheckedChange, onChange, ...props }, ref) => (
    <MantineSwitch
      ref={ref}
      data-ui="switch"
      role="switch"
      onChange={(event) => {
        onChange?.(event);
        onCheckedChange?.(event.currentTarget.checked);
      }}
      {...props}
    />
  ),
);
Switch.displayName = "Switch";
export { Switch };
