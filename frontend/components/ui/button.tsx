"use client";
import * as React from "react";
import { Button as MantineButton } from "@mantine/core";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Slot } from "./slot";

const buttonVariants = cva("design-button rounded-sm font-bold uppercase border-2 border-[#2d2d2d] transition-all duration-200 ease-in-out", {
  variants: {
    variant: {
      default: "",
      destructive: "",
      outline: "",
      secondary: "",
      ghost: "",
      link: "",
    },
    size: { default: "", sm: "", lg: "", icon: "" },
  },
  defaultVariants: { variant: "default", size: "default" },
});
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      asChild,
      children,
      style,
      ...props
    },
    ref,
  ) => {
    const mantineVariant = {
      default: "filled",
      destructive: "filled",
      outline: "outline",
      secondary: "light",
      ghost: "subtle",
      link: "transparent",
    }[variant ?? "default"];
    const child = asChild
      ? (React.Children.only(children) as React.ReactElement<{
          children?: React.ReactNode;
        }>)
      : null;
    return (
      <MantineButton
        ref={ref}
        data-ui="button"
        data-variant={variant}
        data-size={size}
        classNames={{
          inner: "design-button-inner",
          label: "design-button-label",
        }}
        styles={{
          inner: { gap: "inherit" },
          label: { gap: "inherit", whiteSpace: "inherit" },
        }}
        variant={mantineVariant}
        color={variant === "destructive" ? "red" : undefined}
        size={size === "lg" ? "md" : size === "sm" ? "xs" : "sm"}
        className={cn(buttonVariants({ variant, size }), className)}
        style={{
          ...(size === "icon"
            ? { width: 36, paddingInline: 0, flexShrink: 0 }
            : {}),
          ...(variant === "link" ? { textDecoration: "underline" } : {}),
          ...style,
        }}
        {...props}
        renderRoot={
          child
            ? (rootProps) => (
                <Slot {...rootProps}>
                  {React.cloneElement(child, {}, rootProps.children)}
                </Slot>
              )
            : undefined
        }
      >
        {child ? child.props.children : children}
      </MantineButton>
    );
  },
);
Button.displayName = "Button";
export { Button, buttonVariants };
