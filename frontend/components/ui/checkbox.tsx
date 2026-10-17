"use client";
import * as React from "react";
import { Checkbox as MantineCheckbox } from "@mantine/core";
interface CheckboxProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "checked" | "size"
  > {
  checked?: boolean | "indeterminate";
  onCheckedChange?: (checked: boolean | "indeterminate") => void;
}
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ checked, onCheckedChange, onChange, className, ...props }, ref) => (
    <MantineCheckbox
      ref={ref}
      data-ui="checkbox"
      role="checkbox"
      checked={checked === undefined ? undefined : checked === true}
      indeterminate={checked === "indeterminate"}
      className={className}
      onChange={(event) => {
        onChange?.(event);
        onCheckedChange?.(event.currentTarget.checked);
      }}
      {...props}
    />
  ),
);
Checkbox.displayName = "Checkbox";
export { Checkbox };
