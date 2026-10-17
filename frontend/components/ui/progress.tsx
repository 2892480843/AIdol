"use client";
import * as React from "react";
import { Progress as MantineProgress } from "@mantine/core";
const Progress = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value?: number | null; max?: number }
>(({ value = 0, max = 100, ...props }, ref) => (
  <MantineProgress
    ref={ref}
    data-ui="progress"
    value={Math.max(0, Math.min(100, ((value ?? 0) / max) * 100))}
    aria-valuemin={0}
    aria-valuemax={max}
    aria-valuenow={value ?? undefined}
    {...props}
  />
));
Progress.displayName = "Progress";
export { Progress };
