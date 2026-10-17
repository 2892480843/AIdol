"use client";
import * as React from "react";
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "./dialog";
import type { ButtonProps } from "./button";
const AlertDialog = (props: React.ComponentProps<typeof DialogRoot>) => (
  <DialogRoot {...props} alert />
);
const AlertDialogAction = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (props, ref) => (
    <DialogClose ref={ref} data-ui="alert-dialog-action" {...props} />
  ),
);
const AlertDialogCancel = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (props, ref) => (
    <DialogClose
      ref={ref}
      variant="outline"
      data-autofocus
      data-ui="alert-dialog-cancel"
      {...props}
    />
  ),
);
AlertDialogAction.displayName = "AlertDialogAction";
AlertDialogCancel.displayName = "AlertDialogCancel";
export {
  AlertDialog,
  DialogPortal as AlertDialogPortal,
  DialogOverlay as AlertDialogOverlay,
  DialogTrigger as AlertDialogTrigger,
  DialogContent as AlertDialogContent,
  DialogHeader as AlertDialogHeader,
  DialogFooter as AlertDialogFooter,
  DialogTitle as AlertDialogTitle,
  DialogDescription as AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
