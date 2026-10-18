"use client";
import * as React from "react";
import { TextInput } from "@mantine/core";
import { cn } from "@/lib/utils";
export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, style, size, ...props }, ref) => (
    <TextInput
      ref={ref}
      data-ui="input"
      classNames={{ input: cn("design-input", className) }}
      styles={{ input: style }}
      {...props}
    />
  ),
);
Input.displayName = "Input";
export { Input };
