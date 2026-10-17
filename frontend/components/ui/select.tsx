"use client";
import * as React from "react";
import {
  Box,
  Combobox,
  InputBase,
  useCombobox,
  type ComboboxStore,
} from "@mantine/core";
interface SelectContextValue {
  value: string;
  change: (value: string) => void;
  store: ComboboxStore;
  disabled?: boolean;
  options: Map<string, React.ReactNode>;
}
const Context = React.createContext<SelectContextValue | null>(null);
function useSelect() {
  const ctx = React.useContext(Context);
  if (!ctx) throw new Error("Select components require Select");
  return ctx;
}
function collect(
  node: React.ReactNode,
  result = new Map<string, React.ReactNode>(),
) {
  React.Children.forEach(node, (child) => {
    if (
      !React.isValidElement<{ value?: string; children?: React.ReactNode }>(
        child,
      )
    )
      return;
    if (child.type === SelectItem && child.props.value !== undefined)
      result.set(child.props.value, child.props.children);
    else collect(child.props.children, result);
  });
  return result;
}
interface SelectProps {
  children?: React.ReactNode;
  value?: string;
  defaultValue?: string;
  onValueChange?(value: string): void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  name?: string;
  required?: boolean;
}
function Select({
  children,
  value: controlled,
  defaultValue = "",
  onValueChange,
  open,
  defaultOpen,
  onOpenChange,
  disabled,
  name,
  required,
}: SelectProps) {
  const [local, setLocal] = React.useState(defaultValue);
  const value = controlled ?? local;
  const store = useCombobox({
    opened: open,
    defaultOpened: defaultOpen,
    onOpenedChange: onOpenChange,
    onDropdownOpen: () => store.updateSelectedOptionIndex("active"),
    onDropdownClose: () => store.resetSelectedOption(),
  });
  const change = (next: string) => {
    if (disabled) return;
    if (controlled === undefined) setLocal(next);
    onValueChange?.(next);
    store.closeDropdown();
    store.focusTarget();
  };
  return (
    <Context.Provider
      value={{ value, change, store, disabled, options: collect(children) }}
    >
      <Combobox
        store={store}
        onOptionSubmit={change}
        withinPortal
        zIndex={650}
        position="bottom-start"
      >
        {children}
      </Combobox>
      {name && (
        <Combobox.HiddenInput
          name={name}
          value={value}
          disabled={disabled}
          required={required}
        />
      )}
    </Context.Provider>
  );
}
const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(
  (
    { onClick, onKeyDown, children, disabled, className, style, ...props },
    ref,
  ) => {
    const ctx = useSelect();
    return (
      <Combobox.Target targetType="button" withExpandedAttribute>
        <InputBase
          component="button"
          type="button"
          ref={ref}
          pointer
          role="combobox"
          data-ui="select-trigger"
          classNames={{
            input: ["design-select", className].filter(Boolean).join(" "),
          }}
          styles={{ input: style }}
          rightSection={<Combobox.Chevron />}
          rightSectionPointerEvents="none"
          disabled={disabled ?? ctx.disabled}
          onKeyDown={(event) => {
            // Some virtual keyboards provide key without a physical code; Mantine uses code for navigation.
            if (
              !event.nativeEvent.code &&
              ["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)
            )
              Object.defineProperty(event.nativeEvent, "code", {
                value: event.key === " " ? "Space" : event.key,
                configurable: true,
              });
            onKeyDown?.(event);
          }}
          onClick={(event) => {
            onClick?.(event);
            if (!event.defaultPrevented) ctx.store.toggleDropdown();
          }}
          {...props}
        >
          {children}
        </InputBase>
      </Combobox.Target>
    );
  },
);
const SelectValue = ({ placeholder }: { placeholder?: React.ReactNode }) => {
  const ctx = useSelect();
  return (
    <Box
      component="span"
      data-ui="select-value"
      c={ctx.value ? undefined : "dimmed"}
    >
      {ctx.options.get(ctx.value) ?? placeholder}
    </Box>
  );
};
const SelectContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    position?: "popper" | "item-aligned";
    side?: "top" | "bottom";
    sideOffset?: number;
    align?: "start" | "center" | "end";
  }
>(({ position, side, sideOffset, align, children, ...props }, ref) => (
  <Combobox.Dropdown ref={ref} data-ui="select-content" {...props}>
    <Combobox.Options mah={320} style={{ overflowY: "auto" }}>
      {children}
    </Combobox.Options>
  </Combobox.Dropdown>
));
const SelectItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    value: string;
    disabled?: boolean;
    textValue?: string;
  }
>(({ value, children, textValue, ...props }, ref) => {
  const ctx = useSelect();
  return (
    <Combobox.Option
      ref={ref}
      value={value}
      active={ctx.value === value}
      data-ui="select-item"
      {...props}
    >
      {children}
    </Combobox.Option>
  );
});
const SelectGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>((props, ref) => (
  <Combobox.Group ref={ref} data-ui="select-group" {...props} />
));
const SelectLabel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>((props, ref) => (
  <Box
    ref={ref}
    data-ui="select-label"
    fw={600}
    fz="xs"
    px="sm"
    py={6}
    {...props}
  />
));
const SelectSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>((props, ref) => (
  <Box
    ref={ref}
    role="separator"
    my={4}
    style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}
    {...props}
  />
));
const SelectScrollUpButton = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>((props, ref) => <Box ref={ref} hidden aria-hidden {...props} />);
const SelectScrollDownButton = SelectScrollUpButton;
SelectTrigger.displayName = "SelectTrigger";
SelectContent.displayName = "SelectContent";
SelectItem.displayName = "SelectItem";
SelectGroup.displayName = "SelectGroup";
SelectLabel.displayName = "SelectLabel";
SelectSeparator.displayName = "SelectSeparator";
SelectScrollUpButton.displayName = "SelectScrollUpButton";
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
