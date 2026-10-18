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
      classNames={{ input: cn("design-input rounded-none border-2 border-[#2d2d2d] bg-[#f5f0e8] focus:outline-none", className) }}
      styles={{ input: style }}
      {...props}
    />
  ),
);
Input.displayName = "Input";
export { Input };
