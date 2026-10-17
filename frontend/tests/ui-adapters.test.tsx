import React, { useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

describe("Mantine compatibility adapters", () => {
  it("uses real Mantine controls and preserves native refs, links, child events and rerender wrappers", () => {
    const clicked = vi.fn();
    const ref = React.createRef<HTMLInputElement>();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <section aria-label="wrapper">{children}</section>
    );
    const result = render(
      <>
        <Button asChild onClick={clicked}>
          <a href="#wardrobe">Wardrobe</a>
        </Button>
        <Input ref={ref} aria-label="name" defaultValue="coat" />
      </>,
      { wrapper },
    );
    expect(screen.getByRole("link", { name: "Wardrobe" })).toHaveClass(
      "mantine-Button-root",
    );
    fireEvent.click(screen.getByRole("link", { name: "Wardrobe" }));
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(ref.current).toBe(screen.getByRole("textbox", { name: "name" }));
    result.rerender(<Input aria-label="updated" />);
    expect(screen.getByRole("region", { name: "wrapper" })).toContainElement(
      screen.getByRole("textbox", { name: "updated" }),
    );
  });

  it("keeps boolean check callbacks and array-valued keyboard sliders", () => {
    const checked = vi.fn();
    const switched = vi.fn();
    const slide = vi.fn();
    render(
      <>
        <Checkbox aria-label="select item" onCheckedChange={checked} />
        <Switch aria-label="enabled" onCheckedChange={switched} />
        <Slider aria-label="score" defaultValue={[20]} onValueChange={slide} />
      </>,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "select item" }));
    fireEvent.click(screen.getByRole("switch", { name: "enabled" }));
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
    expect(checked).toHaveBeenLastCalledWith(true);
    expect(switched).toHaveBeenLastCalledWith(true);
    expect(slide).toHaveBeenLastCalledWith([21]);
  });

  it("preserves a slotted child ref and allows its handler to prevent the parent action", () => {
    const parent = vi.fn();
    const child = vi.fn((event: React.MouseEvent) => event.preventDefault());
    const ref = React.createRef<HTMLAnchorElement>();
    render(
      <Button asChild onClick={parent}>
        <a href="#cancel" ref={ref} onClick={child}>
          Cancel link
        </a>
      </Button>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Cancel link" }));
    expect(ref.current).toBe(screen.getByRole("link", { name: "Cancel link" }));
    expect(child).toHaveBeenCalledTimes(1);
    expect(parent).not.toHaveBeenCalled();
  });

  it("shows one avatar fallback for empty or failed images and preserves the caller size", () => {
    const { rerender, container } = render(
      <Avatar className="h-8 w-8">
        <AvatarImage src="" alt="Demo" />
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    );
    expect(screen.getAllByText("AB")).toHaveLength(1);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[data-ui="avatar"]')).toHaveStyle({
      "--avatar-size": "2rem",
    });
    rerender(
      <Avatar>
        <AvatarImage src="/missing-avatar.png" alt="Demo" />
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    );
    fireEvent.error(screen.getByRole("img", { name: "Demo" }));
    expect(screen.getAllByText("AB")).toHaveLength(1);
    expect(container.querySelector("img")).toBeNull();
  });

  it("selects string values through the real Combobox with keyboard navigation", async () => {
    const changed = vi.fn();
    render(
      <Select defaultValue="coat" onValueChange={changed}>
        <SelectTrigger aria-label="type">
          <SelectValue placeholder="Choose" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="coat">Coat</SelectItem>
          <SelectItem value="shirt">Shirt</SelectItem>
        </SelectContent>
      </Select>,
    );
    const trigger = screen.getByRole("combobox", { name: "type" });
    expect(trigger).toHaveTextContent("Coat");
    fireEvent.click(trigger);
    expect(await screen.findByRole("option", { name: "Shirt" })).toHaveClass(
      "mantine-Combobox-option",
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.keyDown(trigger, { key: "ArrowDown", code: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter", code: "Enter" });
    expect(changed).toHaveBeenCalledWith("shirt");
  });

  it("keeps parent modal open while Escape cancels only the nested confirmation and returns focus", async () => {
    function Nested() {
      const [confirm, setConfirm] = useState(false);
      return (
        <Dialog>
          <DialogTrigger asChild>
            <Button>Open item</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Item</DialogTitle>
            <DialogDescription>Edit clothing</DialogDescription>
            <Button onClick={() => setConfirm(true)}>Delete item</Button>
            <AlertDialog open={confirm} onOpenChange={setConfirm}>
              <AlertDialogContent>
                <AlertDialogTitle>Confirm deletion</AlertDialogTitle>
                <AlertDialogCancel>Keep item</AlertDialogCancel>
                <AlertDialogAction>Delete permanently</AlertDialogAction>
              </AlertDialogContent>
            </AlertDialog>
          </DialogContent>
        </Dialog>
      );
    }
    render(<Nested />);
    fireEvent.click(screen.getByRole("button", { name: "Open item" }));
    const dialog = await screen.findByRole("dialog", { name: "Item" });
    expect(dialog).toHaveAccessibleDescription("Edit clothing");
    screen.getByRole("button", { name: "Delete item" }).focus();
    fireEvent.click(screen.getByRole("button", { name: "Delete item" }));
    const confirm = await screen.findByRole("alertdialog", {
      name: "Confirm deletion",
    });
    fireEvent.keyDown(confirm, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("dialog", { name: "Item" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete item" })).toHaveFocus(),
    );
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Open item" })).toHaveFocus(),
    );
  });

  it("honors a prevented confirmation action and calls controlled cancel once", () => {
    const changed = vi.fn();
    render(
      <AlertDialog open onOpenChange={changed}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete clothing?</AlertDialogTitle>
          <AlertDialogAction onClick={(event) => event.preventDefault()}>
            Prevent delete
          </AlertDialogAction>
          <AlertDialogCancel>Cancel delete</AlertDialogCancel>
        </AlertDialogContent>
      </AlertDialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Prevent delete" }));
    expect(changed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel delete" }));
    expect(changed).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("allows content callbacks to prevent Escape and outside dismissal", () => {
    const changed = vi.fn();
    const escape = vi.fn((event: KeyboardEvent) => event.preventDefault());
    const outside = vi.fn((event: Event) => event.preventDefault());
    render(
      <Dialog open onOpenChange={changed}>
        <DialogContent onEscapeKeyDown={escape} onPointerDownOutside={outside}>
          <DialogTitle>Keep editing</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Keep editing" }), {
      key: "Escape",
    });
    fireEvent.click(document.querySelector('[data-ui="dialog-overlay"]')!);
    expect(escape).toHaveBeenCalledTimes(1);
    expect(outside).toHaveBeenCalledTimes(1);
    expect(changed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "close" }));
    expect(changed).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("uses a real menu target and reports selection once", async () => {
    const selected = vi.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>Language</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={selected}>English</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Language" }));
    const item = await screen.findByRole("menuitem", { name: "English" });
    expect(item).toHaveClass("mantine-Menu-item");
    fireEvent.click(item);
    expect(selected).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByRole("menuitem")).not.toBeInTheDocument(),
    );
  });

  it("makes tooltip information available to keyboard focus", async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button>Confidence</Button>
          </TooltipTrigger>
          <TooltipContent>Model confidence is approximate</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    fireEvent.focus(screen.getByRole("button", { name: "Confidence" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Model confidence is approximate",
    );
  });

  it("notifies controlled tooltip hover and focus changes", async () => {
    const changed = vi.fn();
    function ControlledTooltip() {
      const [open, setOpen] = useState(false);
      return (
        <Tooltip
          open={open}
          delayDuration={0}
          onOpenChange={(next) => {
            changed(next);
            setOpen(next);
          }}
        >
          <TooltipTrigger asChild>
            <Button>Controlled help</Button>
          </TooltipTrigger>
          <TooltipContent>Controlled information</TooltipContent>
        </Tooltip>
      );
    }
    render(<ControlledTooltip />);
    const trigger = screen.getByRole("button", { name: "Controlled help" });
    fireEvent.mouseEnter(trigger);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Controlled information",
    );
    fireEvent.mouseLeave(trigger);
    await waitFor(() =>
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
    );
    fireEvent.focus(trigger);
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();
    fireEvent.blur(trigger);
    await waitFor(() =>
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
    );
    expect(changed.mock.calls).toEqual([[true], [false], [true], [false]]);
  });

  it("reports uncontrolled tooltip visibility and Escape dismissal", async () => {
    const changed = vi.fn();
    render(
      <Tooltip defaultOpen onOpenChange={changed} delayDuration={0}>
        <TooltipTrigger asChild>
          <Button>Uncontrolled help</Button>
        </TooltipTrigger>
        <TooltipContent>Uncontrolled information</TooltipContent>
      </Tooltip>,
    );
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Uncontrolled information",
    );
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Uncontrolled help" }),
      { key: "Escape" },
    );
    await waitFor(() =>
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
    );
    fireEvent.mouseEnter(
      screen.getByRole("button", { name: "Uncontrolled help" }),
    );
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();
    fireEvent.mouseLeave(
      screen.getByRole("button", { name: "Uncontrolled help" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
    );
    expect(changed.mock.calls).toEqual([[false], [true], [false]]);
  });

  it("changes real tabs and collapse without replacing child click handlers", async () => {
    const clicked = vi.fn();
    render(
      <>
        <Tabs defaultValue="a">
          <TabsList>
            <TabsTrigger value="a">Single</TabsTrigger>
            <TabsTrigger value="b">Bulk</TabsTrigger>
          </TabsList>
          <TabsContent value="a">Single form</TabsContent>
          <TabsContent value="b">Bulk form</TabsContent>
        </Tabs>
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button onClick={clicked}>History</Button>
          </CollapsibleTrigger>
          <CollapsibleContent>Wear history</CollapsibleContent>
        </Collapsible>
      </>,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Bulk" }));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Bulk form");
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Wear history")).toBeInTheDocument();
  });
});
