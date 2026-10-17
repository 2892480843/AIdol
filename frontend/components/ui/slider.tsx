"use client";
import * as React from "react";
import { Slider as MantineSlider, RangeSlider } from "@mantine/core";
interface SliderProps
  extends Omit<
    React.HTMLAttributes<HTMLDivElement>,
    "defaultValue" | "onChange"
  > {
  value?: number[];
  defaultValue?: number[];
  onValueChange?: (value: number[]) => void;
  onValueCommit?: (value: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  name?: string;
  orientation?: "horizontal" | "vertical";
}
const Slider = React.forwardRef<HTMLDivElement, SliderProps>(
  (
    {
      value,
      defaultValue,
      onValueChange,
      onValueCommit,
      orientation,
      ...props
    },
    ref,
  ) => {
    if ((value ?? defaultValue)?.length === 2)
      return (
        <RangeSlider
          ref={ref}
          data-ui="slider"
          {...props}
          value={value as [number, number] | undefined}
          defaultValue={defaultValue as [number, number] | undefined}
          onChange={(next) => onValueChange?.(next)}
          onChangeEnd={(next) => onValueCommit?.(next)}
        />
      );
    return (
      <MantineSlider
        ref={ref}
        data-ui="slider"
        {...props}
        value={value?.[0]}
        defaultValue={defaultValue?.[0]}
        thumbLabel={props["aria-label"]}
        thumbProps={{ "aria-labelledby": props["aria-labelledby"] }}
        onChange={(next) => onValueChange?.([next])}
        onChangeEnd={(next) => onValueCommit?.([next])}
      />
    );
  },
);
Slider.displayName = "Slider";
export { Slider };
