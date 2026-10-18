"use client";
import * as React from "react";
import {
  Box,
  CloseButton,
  Modal,
  Overlay,
  Portal,
  type ModalContentProps,
} from "@mantine/core";
import { useTranslations } from "next-intl";
import { useWindowEvent } from "@mantine/hooks";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "./button";
import { Slot, setRef } from "./slot";

interface DialogState {
  open: boolean;
  change: (open: boolean) => void;
  id: string;
  modal: boolean;
  alert: boolean;
}
const Context = React.createContext<DialogState | null>(null);
const listeners = new Set<() => void>();
let modalStack: string[] = [];
function notify() {
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function useDialog() {
  const ctx = React.useContext(Context);
  if (!ctx) throw new Error("Dialog components require Dialog");
  return ctx;
}
interface DialogProps {
  children?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
}
export function DialogRoot({
  children,
  open: controlled,
  defaultOpen = false,
  onOpenChange,
  modal = true,
  alert = false,
}: DialogProps & { alert?: boolean }) {
  const [local, setLocal] = React.useState(defaultOpen);
  const open = controlled ?? local;
  const id = React.useId();
  const change = React.useCallback(
    (next: boolean) => {
      if (controlled === undefined) setLocal(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange],
  );
  React.useEffect(() => {
    if (!open) return;
    modalStack = [...modalStack, id];
    notify();
    return () => {
      modalStack = modalStack.filter((entry) => entry !== id);
      notify();
    };
  }, [open, id]);
  return (
    <Context.Provider value={{ open, change, id, modal, alert }}>
      {children}
    </Context.Provider>
  );
}
const Dialog = DialogRoot;
const DialogTrigger = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild, onClick, children, ...props }, ref) => {
    const ctx = useDialog();
    const shared = {
      ...props,
      "aria-haspopup": "dialog" as const,
      "aria-expanded": ctx.open,
      "aria-controls": `${ctx.id}-content`,
      onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          event.currentTarget.focus();
          ctx.change(true);
        }
      },
    };
    return asChild ? (
      <Slot
        ref={ref as React.ForwardedRef<HTMLElement>}
        {...(shared as React.HTMLAttributes<HTMLElement>)}
      >
        {children as React.ReactElement}
      </Slot>
    ) : (
      <Button ref={ref} type="button" data-ui="dialog-trigger" {...shared}>
        {children}
      </Button>
    );
  },
);
const DialogClose = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ onClick, ...props }, ref) => {
    const ctx = useDialog();
    return (
      <Button
        ref={ref}
        type="button"
        data-ui="dialog-close"
        {...props}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) ctx.change(false);
        }}
      />
    );
  },
);
function DialogPortal({
  children,
  container,
}: {
  children?: React.ReactNode;
  container?: HTMLElement | null;
}) {
  return <Portal target={container ?? undefined}>{children}</Portal>;
}
const DialogOverlay = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ onClick, ...props }, ref) => {
  const ctx = useDialog();
  return (
    <Overlay
      ref={ref}
      fixed
      data-ui="dialog-overlay"
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && !ctx.alert) ctx.change(false);
      }}
    />
  );
});
function headingText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(headingText).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node))
    return headingText(node.props.children);
  return "";
}
function findHeading(node: React.ReactNode): string | undefined {
  for (const child of React.Children.toArray(node)) {
    if (!React.isValidElement<{ children?: React.ReactNode }>(child)) continue;
    if (typeof child.type === "string" && /^h[1-6]$/.test(child.type))
      return headingText(child.props.children);
    const nested = findHeading(child.props.children);
    if (nested) return nested;
  }
}
interface DialogContentProps
  extends Omit<ModalContentProps, "onTransitionEnd" | "style"> {
  style?: React.CSSProperties;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
  onPointerDownOutside?: (event: Event) => void;
  onInteractOutside?: (event: Event) => void;
  forceMount?: boolean;
}
const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  (
    {
      children,
      className,
      style,
      onEscapeKeyDown,
      onOpenAutoFocus,
      onCloseAutoFocus,
      onPointerDownOutside,
      onInteractOutside,
      forceMount,
      ...props
    },
    ref,
  ) => {
    const ctx = useDialog();
    const t = useTranslations("common");
    React.useSyncExternalStore(
      subscribe,
      () => modalStack.join("|"),
      () => "",
    );
    const top =
      modalStack.length === 0 || modalStack[modalStack.length - 1] === ctx.id;
    const layer = Math.max(0, modalStack.indexOf(ctx.id));
    useWindowEvent(
      "keydown",
      (event) => {
        if (
          !ctx.open ||
          !top ||
          !onEscapeKeyDown ||
          event.key !== "Escape" ||
          event.isComposing
        )
          return;
        if (
          (event.target as HTMLElement | null)?.getAttribute?.(
            "data-mantine-stop-propagation",
          ) === "true"
        )
          return;
        onEscapeKeyDown(event);
        if (!event.defaultPrevented) ctx.change(false);
      },
      { capture: true },
    );
    const contentRef = React.useCallback(
      (node: HTMLDivElement | null) => {
        // Mantine 8 hardcodes role=dialog; confirmations retain the required alertdialog semantics.
        if (node && ctx.alert) node.setAttribute("role", "alertdialog");
        setRef(ref, node);
      },
      [ctx.alert, ref],
    );
    const wasOpen = React.useRef(false);
    const returnTarget = React.useRef<HTMLElement | null>(null);
    React.useEffect(() => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      if (ctx.open && !wasOpen.current) {
        returnTarget.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        const event = new Event("openAutoFocus", { cancelable: true });
        onOpenAutoFocus?.(event);
        if (event.defaultPrevented) {
          const focused = document.activeElement as HTMLElement | null;
          timer = setTimeout(() => {
            if (focused?.isConnected) focused.focus({ preventScroll: true });
          }, 0);
        }
      }
      if (!ctx.open && wasOpen.current) {
        const event = new Event("closeAutoFocus", { cancelable: true });
        onCloseAutoFocus?.(event);
        if (!event.defaultPrevented)
          timer = setTimeout(() => {
            if (returnTarget.current?.isConnected)
              returnTarget.current.focus({ preventScroll: true });
          }, 0);
      }
      wasOpen.current = ctx.open;
      return () => {
        if (timer) clearTimeout(timer);
      };
    }, [ctx.open, onOpenAutoFocus, onCloseAutoFocus]);
    return (
      <Modal.Root
        id={ctx.id}
        opened={ctx.open}
        onClose={() => ctx.change(false)}
        centered
        size="lg"
        radius={0}
        padding="lg"
        zIndex={300 + layer * 10}
        trapFocus={ctx.modal && top}
        returnFocus={false}
        closeOnEscape={top && !onEscapeKeyDown}
        closeOnClickOutside={
          !ctx.alert && top && !onPointerDownOutside && !onInteractOutside
        }
        keepMounted={forceMount}
        lockScroll={ctx.modal}
      >
        <Modal.Overlay
          data-ui="dialog-overlay"
          backgroundOpacity={0.42}
          blur={0}
          onClick={(event) => {
            if (!top) return;
            onPointerDownOutside?.(event.nativeEvent);
            onInteractOutside?.(event.nativeEvent);
            if (
              !ctx.alert &&
              (onPointerDownOutside || onInteractOutside) &&
              !event.nativeEvent.defaultPrevented
            )
              ctx.change(false);
          }}
        />
        <Modal.Content
          ref={contentRef}
          id={`${ctx.id}-content`}
          role={ctx.alert ? "alertdialog" : "dialog"}
          aria-label={props["aria-label"] ?? findHeading(children)}
          data-ui={ctx.alert ? "alert-dialog-content" : "dialog-content"}
          classNames={{ content: cn("design-dialog", className) }}
          styles={{
            content: {
              display: "flex",
              flexDirection: "column",
              gap: 16,
              ...style,
            },
          }}
          {...props}
        >
          {children}
          {!ctx.alert && (
            <CloseButton
              type="button"
              aria-label={t("close")}
              data-ui="dialog-close"
              onClick={() => ctx.change(false)}
              style={{ position: "absolute", right: 12, top: 12 }}
            />
          )}
        </Modal.Content>
      </Modal.Root>
    );
  },
);
const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <Box
    data-ui="dialog-header"
    className={cn("flex flex-col gap-1.5 pr-7", className)}
    {...props}
  />
);
const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <Box
    data-ui="dialog-footer"
    className={cn(
      "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
      className,
    )}
    {...props}
  />
);
const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>((props, ref) => (
  <Modal.Title ref={ref} data-ui="dialog-title" fw={650} fz="lg" {...props} />
));
const DialogDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>((props, ref) => (
  <Modal.Body
    ref={ref}
    data-ui="dialog-description"
    p={0}
    fz="sm"
    c="dimmed"
    {...props}
  />
));
DialogTrigger.displayName = "DialogTrigger";
DialogClose.displayName = "DialogClose";
DialogOverlay.displayName = "DialogOverlay";
DialogContent.displayName = "DialogContent";
DialogTitle.displayName = "DialogTitle";
DialogDescription.displayName = "DialogDescription";
export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
