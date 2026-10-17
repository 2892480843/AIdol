"use client";
import * as React from "react";
import { Textarea as MantineTextarea } from "@mantine/core";
import { cn } from "@/lib/utils";
export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, style, ...props }, ref) => (
    <MantineTextarea
      ref={ref}
      data-ui="textarea"
      classNames={{ input: cn("design-textarea", className) }}
      styles={{ input: style }}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
export { Textarea };
