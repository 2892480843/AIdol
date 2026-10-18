import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InspirationWorkspace } from "@/components/inspiration/inspiration-workspace";
import type { Item } from "@/lib/types";
import { setActiveSession } from "@/lib/api";

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
  setActiveSession("owner-a", "token-a");
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
afterEach(() => act(() => setActiveSession(null, null)));

describe("inspiration to wardrobe workflow", () => {
  const seedIds = () =>
    new URL(
      screen.getByRole("link", { name: "openStudio" }).getAttribute("href")!,
      "http://localhost",
    ).searchParams.get("seed")!.split(",");
  const anchor = async (name: string) => {
    fireEvent.click(screen.getByRole("textbox", { name: "anchor.choose" }));
    fireEvent.click(await screen.findByRole("option", { name }));
  };
  it("retains an owned anchor across compatible exercises and locks its clothing slot", async () => {
    render(<InspirationWorkspace />);
    await anchor("Blue tee");
    expect(seedIds()).toContain(id(1));
    expect(screen.getByRole("textbox", { name: "swap · slots.top" })).toBeDisabled();
    expect(screen.getByText("anchor.locked")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^08/ }));
    expect(screen.getByRole("heading", { name: "formulas.easyLayers.title" })).toBeInTheDocument();
    expect(seedIds()).toContain(id(1));
    expect(new Set(seedIds()).size).toBe(seedIds().length);
    fireEvent.click(screen.getByRole("button", { name: "resetSelections" }));
    expect(seedIds()).toContain(id(1));
  });
  it("filters incompatible exercises and restores all exercises after clearing the anchor", async () => {
    render(<InspirationWorkspace />);
    await anchor("Yellow dress");
    const discovery = screen.getByRole("complementary", { name: "all" });
    expect(within(discovery).queryByText("Alyssa Beltempo")).not.toBeInTheDocument();
    expect(within(discovery).getByText("Jean Wang")).toBeInTheDocument();
    expect(seedIds()).toContain(id(5));
    fireEvent.click(screen.getByRole("button", { name: "anchor.clear" }));
    expect(within(discovery).getByText("Alyssa Beltempo")).toBeInTheDocument();
  });
  it("keeps an optional anchored layer included and prevents skipping it", async () => {
    mock.query = "formula=easy-layers";
    render(<InspirationWorkspace />);
    await anchor("Red jacket");
    expect(seedIds()).toContain(id(6));
    expect(screen.queryByRole("button", { name: 'skipOptional:{"name":"slots.layer"}' })).not.toBeInTheDocument();
  });
  it("keeps the anchor for a compatible creator and explains releasing it for an incompatible creator", async () => {
    render(<InspirationWorkspace />);
    await anchor("Blue tee");
    fireEvent.click(within(screen.getByRole("article", { name: "蟹煲" })).getByRole("button", { name: "viewPractice · 蟹煲" }));
    expect(seedIds()).toContain(id(1));
    expect(screen.getByRole("button", { name: "anchor.clear" })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("article", { name: "Jean Wang" })).getByRole("button", { name: "viewPractice · Jean Wang" }));
    expect(screen.getByText("anchor.creatorReset")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "anchor.clear" })).not.toBeInTheDocument();
    expect(seedIds()).toContain(id(5));
  });
  it("blocks stale anchor seeds after the selected item becomes unavailable", async () => {
    const view = render(<InspirationWorkspace />);
    await anchor("Blue tee");
    mock.wardrobe.mockReturnValue({
      ...mock.wardrobe(),
      items: items.filter((entry) => entry.id !== id(1)),
      total: 5,
    });
    view.rerender(<InspirationWorkspace />);
    expect(screen.getByText("anchor.unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "openStudio" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "anchor.clear" }));
    expect(screen.getByRole("link", { name: "openStudio" })).toBeInTheDocument();
  });
  it("clears the anchor when the active account changes", async () => {
    render(<InspirationWorkspace />);
    await anchor("Yellow dress");
    act(() => setActiveSession("owner-b", "token-b"));
    expect(screen.queryByRole("button", { name: "anchor.clear" })).not.toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "all" })).toHaveTextContent("Alyssa Beltempo");
  });
  it("focuses and scrolls to the restored practice after a creator action from no results", async () => {
    const originalScroll = HTMLElement.prototype.scrollIntoView;
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    try {
      render(<InspirationWorkspace />);
      fireEvent.change(screen.getByRole("textbox", { name: "search" }), {
        target: { value: "no-match" },
      });
      expect(
        screen.queryByRole("region", { name: "formulas.easyLayers.title" }),
      ).not.toBeInTheDocument();
      fireEvent.click(
        within(screen.getByRole("article", { name: "蟹煲" })).getByRole(
          "button",
          { name: "viewPractice · 蟹煲" },
        ),
      );
      await waitFor(() =>
        expect(
          screen.getByRole("region", { name: "formulas.easyLayers.title" }),
        ).toHaveFocus(),
      );
      expect(scroll).toHaveBeenCalledWith(
        expect.objectContaining({ block: "start" }),
      );
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScroll;
    }
  });
  it("combines source and creator filters using the actual discovery controls", async () => {
    render(<InspirationWorkspace />);
    fireEvent.click(screen.getByRole("textbox", { name: "sourceFilter" }));
    fireEvent.click(
      await screen.findByRole("option", { name: "platforms.douyin" }),
    );
    const discovery = screen.getByRole("complementary", { name: "all" });
    expect(
      within(discovery).queryByText("Alyssa Beltempo"),
    ).not.toBeInTheDocument();
    expect(within(discovery).getByText("盐百万")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("textbox", { name: "creatorFilter" }));
    fireEvent.click(await screen.findByRole("option", { name: "蟹煲" }));
    expect(within(discovery).getByText("蟹煲")).toBeInTheDocument();
    expect(within(discovery).queryByText("盐百万")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "search" }), {
      target: { value: "no-match" },
    });
    fireEvent.click(screen.getByRole("button", { name: "clearFilters" }));
    expect(within(discovery).getByText("Alyssa Beltempo")).toBeInTheDocument();
    expect(within(discovery).getByText("盐百万")).toBeInTheDocument();
  });
  it("opens a creator's own exercise and provides separate original and profile links", () => {
    render(<InspirationWorkspace />);
    const card = screen.getByRole("article", { name: "蟹煲" });
    expect(
      within(card).getByRole("link", { name: "viewVideo" }),
    ).toHaveAttribute(
      "href",
      "https://www.douyin.com/video/7694687869555022479",
    );
    expect(
      within(card)
        .getByRole("link", { name: "viewProfile" })
        .getAttribute("href"),
    ).toMatch(/^https:\/\/www\.douyin\.com\/user\//);
    fireEvent.click(
      within(card).getByRole("button", { name: "viewPractice · 蟹煲" }),
    );
    expect(
      screen.getByRole("heading", { name: "formulas.easyLayers.title" }),
    ).toBeInTheDocument();
    const discovery = screen.getByRole("complementary", { name: "all" });
    expect(
      within(discovery).queryByText("Alyssa Beltempo"),
    ).not.toBeInTheDocument();
    expect(mock.replace).toHaveBeenLastCalledWith(
      "/dashboard/inspiration?formula=easy-layers",
      { scroll: false },
    );
  });
  it("shows practical steps and skips only the optional layer in the studio seed", () => {
    mock.query = "formula=easy-layers";
    render(<InspirationWorkspace />);
    expect(
      within(screen.getByRole("region", { name: "guideTitle" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(3);
    expect(
      screen.getByText("formulas.easyLayers.steps.adjust"),
    ).toBeInTheDocument();
    const seed = () =>
      new URL(
        screen.getByRole("link", { name: "openStudio" }).getAttribute("href")!,
        "http://localhost",
      ).searchParams
        .get("seed")!
        .split(",");
    expect(seed()).toContain(id(6));
    fireEvent.click(
      screen.getByRole("button", {
        name: 'skipOptional:{"name":"slots.layer"}',
      }),
    );
    expect(seed()).not.toContain(id(6));
    expect(seed()).toHaveLength(3);
    expect(
      screen.getByText('coverage:{"matched":3,"required":3}'),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: 'restoreOptional:{"name":"slots.layer"}',
      }),
    );
    expect(seed()).toContain(id(6));
    expect(
      screen.queryByRole("button", {
        name: 'skipOptional:{"name":"slots.top"}',
      }),
    ).not.toBeInTheDocument();
  });
  it("keeps manual choices scoped to each formula during filter-driven switches", async () => {
    render(<InspirationWorkspace />);
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
    fireEvent.change(screen.getByRole("textbox", { name: "search" }), {
      target: { value: "Caroline Joy" },
    });
    expect(
      screen.getByRole("heading", { name: "formulas.layer.title" }),
    ).toBeInTheDocument();
    expect(selectedIds()).toContain(id(2));
    expect(selectedIds()).not.toContain(id(1));
    fireEvent.change(screen.getByRole("textbox", { name: "search" }), {
      target: { value: "" },
    });
    expect(
      screen.getByRole("heading", { name: "formulas.everyday.title" }),
    ).toBeInTheDocument();
    expect(selectedIds()).toContain(id(1));
  });
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
