"use client";
import * as React from "react";
import { Skeleton as MantineSkeleton } from "@mantine/core";
function Skeleton(props: React.HTMLAttributes<HTMLDivElement>) {
  return <MantineSkeleton data-ui="skeleton" {...props} />;
}
export { Skeleton };
