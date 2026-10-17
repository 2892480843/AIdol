import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InspirationWorkspace } from "@/components/inspiration/inspiration-workspace";
import type { Item } from "@/lib/types";

const mock = vi.hoisted(() => ({
  wardrobe: vi.fn(),
  replace: vi.fn(),
  toggle: vi.fn(),
  saved: [] as string[],
  query: "",
  error: false,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mock.replace }),
  useSearchParams: () => new URLSearchParams(mock.query),
}));
vi.mock("next/image", () => ({
  default: ({ fill, ...props }: Record<string, unknown>) => <img {...props} />,
}));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));
vi.mock("@/lib/hooks/use-inspiration-wardrobe", () => ({
  useInspirationWardrobe: mock.wardrobe,
}));
vi.mock("@/lib/hooks/use-saved-inspirations", () => ({
  useSavedInspirations: () => ({
    savedIds: mock.saved,
    toggle: mock.toggle,
    storageError: mock.error,
  }),
}));
vi.mock("@/lib/hooks/use-translated-constants", () => ({
  useTypeLabel: () => (v: string) => v,
  useOccasionLabel: () => (v: string) => v,
}));
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const item = (n: number, type: string, name: string, color: string, wear = 0) =>
  ({
    id: id(n),
    type,
    name,
    primary_color: color,
    colors: [color],
    status: "ready",
    is_archived: false,
    needs_wash: false,
    wear_count: wear,
    thumbnail_url: `/item-${n}.jpg`,
  }) as Item;
const items = [
  item(1, "t-shirt", "Blue tee", "blue", 5),
  item(2, "blouse", "White blouse", "white", 1),
  item(3, "pants", "Black trousers", "black"),
  item(4, "shoes", "White sneakers", "white"),
  item(5, "dress", "Yellow dress", "yellow"),
  item(6, "jacket", "Red jacket", "red"),
];
beforeEach(() => {
  vi.clearAllMocks();
  mock.saved = [];
  mock.query = "";
  mock.error = false;
  mock.wardrobe.mockReturnValue({
    items,
    total: 6,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    hasMore: false,
    loadMore: vi.fn(),
    isFetchingMore: false,
  });
});

describe("inspiration to wardrobe workflow", () => {
  it("preserves a manual swap when its own formula URL update arrives late", async () => {
    const view = render(<InspirationWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: /^03/ }));
    fireEvent.click(screen.getByRole("textbox", { name: "swap · slots.top" }));
    fireEvent.click(await screen.findByRole("option", { name: "Blue tee" }));
    const selectedIds = () =>
      new URL(
        screen.getByRole("link", { name: "openStudio" }).getAttribute("href")!,
        "http://localhost",
      ).searchParams
        .get("seed")
        ?.split(",");
    expect(selectedIds()).toContain(id(1));
    mock.query = "formula=tonal";
    view.rerender(<InspirationWorkspace />);
    await waitFor(() => expect(selectedIds()).toContain(id(1)));
  });
  it("builds a real studio seed with the selected owned clothing IDs and occasion", () => {
    render(<InspirationWorkspace />);
    const href = screen
      .getByRole("link", { name: "openStudio" })
      .getAttribute("href")!;
    const url = new URL(href, "http://localhost");
    expect(url.pathname).toBe("/dashboard/outfits/new");
    expect(url.searchParams.get("seed")?.split(",")).toEqual([
      id(2),
      id(3),
      id(4),
    ]);
    expect(url.searchParams.get("occasion")).toBe("casual");
    expect(
      screen.getByText('coverage:{"matched":3,"required":3}'),
    ).toBeInTheDocument();
  });
  it("searches creator names and changes the active exercise to a matching result", () => {
    render(<InspirationWorkspace />);
    fireEvent.change(screen.getByRole("textbox", { name: "search" }), {
      target: { value: "Jean Wang" },
    });
    expect(
      screen.getByRole("heading", { name: "formulas.dress.title" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "formulas.everyday.title" }),
    ).not.toBeInTheDocument();
    const url = new URL(
      screen.getByRole("link", { name: "openStudio" }).getAttribute("href")!,
      "http://localhost",
    );
    expect(url.searchParams.get("seed")?.split(",")).toContain(id(5));
  });
  it("shows no-results without an unrelated active outfit and can clear filters", () => {
    render(<InspirationWorkspace />);
    fireEvent.change(screen.getByRole("textbox", { name: "search" }), {
      target: { value: "not-present" },
    });
    expect(screen.getByText("noResults")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "openStudio" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "clearFilters" }));
    expect(
      screen.getByRole("link", { name: "openStudio" }),
    ).toBeInTheDocument();
  });
  it("filters bookmarks and delegates changes to per-account persistence", () => {
    mock.saved = ["dress"];
    render(<InspirationWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "savedOnly" }));
    expect(
      screen.getByRole("heading", { name: "formulas.dress.title" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole("button", {
        name: 'unsave:{"name":"formulas.dress.title"}',
      })[0],
    );
    expect(mock.toggle).toHaveBeenCalledWith("dress");
  });
  it("disables studio when there are no eligible clothes and explains missing categories", () => {
    mock.wardrobe.mockReturnValue({
      items: [],
      total: 0,
      isLoading: false,
      isError: false,
      hasMore: false,
    });
    render(<InspirationWorkspace />);
    expect(screen.getByRole("button", { name: "openStudio" })).toBeDisabled();
    expect(screen.getAllByText("missing")).toHaveLength(4);
    expect(screen.getByText("noPieces")).toBeInTheDocument();
  });
  it("hides stale matches on query error and offers retry", () => {
    const refetch = vi.fn();
    mock.wardrobe.mockReturnValue({
      items,
      total: 6,
      isLoading: false,
      isError: true,
      hasMore: false,
      refetch,
    });
    render(<InspirationWorkspace />);
    expect(
      screen.queryByRole("link", { name: "openStudio" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "retry" }));
    expect(refetch).toHaveBeenCalledOnce();
  });
  it("discloses a partial inventory and explicitly loads the next page", () => {
    const loadMore = vi.fn();
    mock.wardrobe.mockReturnValue({
      items,
      total: 106,
      isLoading: false,
      isError: false,
      hasMore: true,
      loadMore,
    });
    render(<InspirationWorkspace />);
    expect(
      screen.getByText('partial:{"loaded":6,"total":106}'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "loadMore" }));
    expect(loadMore).toHaveBeenCalledOnce();
  });
  it("changes a clothing choice and transfers the new selection into the studio URL", async () => {
    render(<InspirationWorkspace />);
    fireEvent.click(screen.getByRole("textbox", { name: "swap · slots.top" }));
    fireEvent.click(await screen.findByRole("option", { name: "Blue tee" }));
    await waitFor(() =>
      expect(
        new URL(
          screen
            .getByRole("link", { name: "openStudio" })
            .getAttribute("href")!,
          "http://localhost",
        ).searchParams
          .get("seed")
          ?.split(","),
      ).toContain(id(1)),
    );
  });
});
