"use client";
import * as React from "react";
import { Box, Paper, Text, Title } from "@mantine/core";
import { cn } from "@/lib/utils";
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <Paper
    ref={ref}
    shadow="xs"
    data-ui="card"
    className={cn("design-card", className)}
    {...props}
  />
));
const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <Box
    ref={ref}
    data-ui="card-header"
    className={cn("flex flex-col gap-1.5 p-6", className)}
    {...props}
  />
));
const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <Title
    ref={ref}
    order={3}
    size="h4"
    data-ui="card-title"
    className={className}
    {...props}
  />
));
const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <Text
    ref={ref}
    component="p"
    size="sm"
    c="dimmed"
    data-ui="card-description"
    className={className}
    {...props}
  />
));
const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <Box
    ref={ref}
    data-ui="card-content"
    className={cn("p-6 pt-0", className)}
    {...props}
  />
));
const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <Box
    ref={ref}
    data-ui="card-footer"
    className={cn("flex items-center gap-2 p-6 pt-0", className)}
    {...props}
  />
));
Card.displayName = "Card";
CardHeader.displayName = "CardHeader";
CardTitle.displayName = "CardTitle";
CardDescription.displayName = "CardDescription";
CardContent.displayName = "CardContent";
CardFooter.displayName = "CardFooter";
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
};
