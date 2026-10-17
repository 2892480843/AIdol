"use client";
import * as React from "react";
import { Input } from "@mantine/core";
const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>((props, ref) => <Input.Label ref={ref} data-ui="label" {...props} />);
Label.displayName = "Label";
export { Label };
