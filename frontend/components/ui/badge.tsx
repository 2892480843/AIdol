"use client";
import * as React from "react";
import { Badge as MantineBadge } from "@mantine/core";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const badgeVariants = cva("design-badge", {
  variants: {
    variant: { default: "", secondary: "", destructive: "", outline: "" },
  },
  defaultVariants: { variant: "default" },
});
export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}
const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = "default", style, ...props }, ref) => (
    <MantineBadge
      component="div"
      ref={ref}
      data-ui="badge"
      variant={
        variant === "outline"
          ? "outline"
          : variant === "default"
            ? "filled"
            : "light"
      }
      color={variant === "destructive" ? "red" : undefined}
      radius="xl"
      className={cn(badgeVariants({ variant }), className)}
      style={{ textTransform: "none", letterSpacing: 0, ...style }}
      {...props}
    />
  ),
);
Badge.displayName = "Badge";
export { Badge, badgeVariants };
