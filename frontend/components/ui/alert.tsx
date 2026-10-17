"use client";
import * as React from "react";
import { Alert as MantineAlert, Box, Title } from "@mantine/core";
const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "destructive" }
>(({ variant = "default", ...props }, ref) => (
  <MantineAlert
    ref={ref}
    data-ui="alert"
    variant="light"
    color={variant === "destructive" ? "red" : undefined}
    {...props}
  />
));
const AlertTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>((props, ref) => (
  <Title
    ref={ref}
    order={5}
    size="sm"
    mb={4}
    data-ui="alert-title"
    {...props}
  />
));
const AlertDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>((props, ref) => <Box ref={ref} data-ui="alert-description" {...props} />);
Alert.displayName = "Alert";
AlertTitle.displayName = "AlertTitle";
AlertDescription.displayName = "AlertDescription";
export { Alert, AlertTitle, AlertDescription };
