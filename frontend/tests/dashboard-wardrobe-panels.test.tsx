import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import {
  RecentWardrobePanel,
  RediscoverPanel,
} from "@/components/dashboard/wardrobe-panels";
import type { Item } from "@/lib/types";
import constants from "@/messages/en/constants.json";
import common from "@/messages/en/common.json";
import wardrobe from "@/messages/en/wardrobe.json";
import dashboard from "@/messages/en/dashboard.json";

vi.unmock("next-intl");

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider
      locale="en"
      messages={{ dashboard, constants, common, wardrobe }}
    >
      {children}
    </NextIntlClientProvider>
  );
}

function item(id: string, overrides: Partial<Item> = {}): Item {
  return {
    id,
    user_id: "test-user",
    name: `Garment ${id}`,
    type: "shirt",
    favorite: false,
    image_path: `private/${id}.jpg`,
    thumbnail_url: `/api/v1/images/${id}.jpg`,
    tags: { colors: [], style: [], season: [] },
    colors: [],
    status: "ready",
    ai_processed: true,
    tagging_status: "tagged",
    wear_count: 0,
    suggestion_count: 0,
    acceptance_count: 0,
    wears_since_wash: 0,
    needs_wash: false,
    effective_wash_interval: 3,
    additional_images: [],
    is_archived: false,
    created_at: "2026-10-17T08:00:00Z",
    updated_at: "2026-10-17T08:00:00Z",
    ...overrides,
  };
}

describe("RecentWardrobePanel", () => {
  it("limits the real image grid to six while showing the server total and real statuses", () => {
    const items = Array.from({ length: 7 }, (_, index) =>
      item(String(index), {
        status: (["ready", "processing", "error", "archived"] as const)[
          index % 4
        ],
      }),
    );
    render(
      <RecentWardrobePanel
        items={items}
        total={83}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
      />,
      { wrapper },
    );
    expect(screen.getByText("83 items in your wardrobe")).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(6);
    expect(
      screen.queryByRole("link", { name: "Garment 6" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Ready")).toHaveLength(2);
    expect(screen.getAllByText("Processing")).toHaveLength(2);
    expect(screen.getByText("Processing failed")).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View all" })).toHaveAttribute(
      "href",
      "/dashboard/wardrobe",
    );
    expect(screen.getByRole("link", { name: "Garment 0" })).toHaveAttribute(
      "href",
      "/dashboard/wardrobe?item=0",
    );
  });

  it("does not substitute the sample length when the server total is unknown", () => {
    render(
      <RecentWardrobePanel
        items={[item("only")]}
        total={undefined}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
      />,
      { wrapper },
    );
    expect(
      screen.queryByText(/item[s]? in your wardrobe/),
    ).not.toBeInTheDocument();
  });

  it("shows a genuine zero and an add-item link for an empty wardrobe", () => {
    render(
      <RecentWardrobePanel
        items={[]}
        total={0}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
      />,
      { wrapper },
    );
    expect(screen.getByText("0 items in your wardrobe")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add Item" })).toHaveAttribute(
      "href",
      "/dashboard/wardrobe",
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("encodes item links and falls back when no signed image is available or an image fails", () => {
    const id = "coat/蓝 &?";
    const { rerender } = render(
      <RecentWardrobePanel
        items={[
          item(id, {
            thumbnail_url: "",
            image_url: undefined,
            name: "",
            is_archived: true,
          }),
        ]}
        total={1}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
      />,
      { wrapper },
    );
    const link = screen.getByRole("link", { name: constants.types.shirt });
    expect(link).toHaveAttribute(
      "href",
      `/dashboard/wardrobe?${new URLSearchParams({ item: id })}`,
    );
    expect(screen.getByText("Image unavailable")).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    rerender(
      <RecentWardrobePanel
        items={[item("broken")]}
        total={1}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
      />,
    );
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByText("Image unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

describe("RediscoverPanel", () => {
  it("shows at most four items with actual zero/existing wears and encoded details/style links", () => {
    const id = "linen/蓝 &?";
    const items = [
      item(id),
      item("twice", { wear_count: 2 }),
      item("often", { wear_count: 12 }),
      item("four"),
      item("hidden"),
    ];
    render(
      <RediscoverPanel
        items={items}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
      />,
      { wrapper },
    );
    expect(screen.getAllByRole("img")).toHaveLength(4);
    expect(screen.getAllByText("Worn 0 times")).toHaveLength(2);
    expect(screen.getByText("Worn 2 times")).toBeInTheDocument();
    expect(screen.getByText("Worn 12 times")).toBeInTheDocument();
    expect(screen.queryByText("Garment hidden")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: `Garment ${id}` })).toHaveAttribute(
      "href",
      `/dashboard/wardrobe?${new URLSearchParams({ item: id })}`,
    );
    expect(
      screen.getByRole("link", { name: `Style this item: Garment ${id}` }),
    ).toHaveAttribute(
      "href",
      `/dashboard/suggest?${new URLSearchParams({ item: id })}`,
    );
  });

  it("does not add demonstration clothing to an empty panel", () => {
    render(
      <RediscoverPanel
        items={[]}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
      />,
      { wrapper },
    );
    expect(screen.getByRole("link", { name: "Add Item" })).toHaveAttribute(
      "href",
      "/dashboard/wardrobe",
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText(/Worn \d/)).not.toBeInTheDocument();
  });

  it("keeps unavailable items visible while only ready, unarchived items can start styling", () => {
    const items = [
      item("ready/蓝 &?"),
      item("processing", { status: "processing" }),
      item("error", { status: "error" }),
      item("archived", { status: "ready", is_archived: true }),
    ];
    render(
      <RediscoverPanel
        items={items}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
      />,
      { wrapper },
    );
    expect(screen.getAllByRole("img")).toHaveLength(4);
    expect(
      screen.getByRole("link", {
        name: `Style this item: Garment ${items[0].id}`,
      }),
    ).toHaveAttribute(
      "href",
      `/dashboard/suggest?${new URLSearchParams({ item: items[0].id })}`,
    );
    for (const unavailable of items.slice(1)) {
      const label = `Style this item: Garment ${unavailable.id}`;
      const action = screen.getByRole("button", { name: label });
      expect(action).toBeDisabled();
      expect(action).not.toHaveAttribute("href");
      expect(
        screen.queryByRole("link", { name: label }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: `Garment ${unavailable.id}` }),
      ).toHaveAttribute(
        "href",
        `/dashboard/wardrobe?${new URLSearchParams({ item: unavailable.id })}`,
      );
    }
    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(screen.getByText("Processing failed")).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });
});

describe("panel loading and recovery", () => {
  it.each(["recent", "rediscover"] as const)(
    "renders a real retry action for the %s error state",
    (kind) => {
      const onRetry = vi.fn();
      render(
        kind === "recent" ? (
          <RecentWardrobePanel
            items={[]}
            total={undefined}
            isLoading={false}
            isError
            onRetry={onRetry}
          />
        ) : (
          <RediscoverPanel
            items={[]}
            isLoading={false}
            isError
            onRetry={onRetry}
          />
        ),
        { wrapper },
      );
      const alert = screen.getByRole("alert");
      fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
      expect(onRetry).toHaveBeenCalledExactlyOnceWith();
      expect(
        screen.queryByRole("link", { name: "Add Item" }),
      ).not.toBeInTheDocument();
    },
  );

  it.each(["recent", "rediscover"] as const)(
    "shows loading placeholders without a false empty state for %s",
    (kind) => {
      render(
        kind === "recent" ? (
          <RecentWardrobePanel
            items={[]}
            total={undefined}
            isLoading
            isError={false}
            onRetry={vi.fn()}
          />
        ) : (
          <RediscoverPanel
            items={[]}
            isLoading
            isError={false}
            onRetry={vi.fn()}
          />
        ),
        { wrapper },
      );
      expect(
        screen.getByRole("status", { name: "Loading..." }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Add Item" }),
      ).not.toBeInTheDocument();
    },
  );
});
