/* eslint-disable @next/next/no-img-element -- Exercise image states through a DOM image. */
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Item } from "@/lib/types";
import { Wardrobe3DWorkspace } from "@/components/wardrobe-3d/workspace";

const state = vi.hoisted(() => ({
  owner: "owner-one" as string | null,
  items: [] as Item[],
  total: 5,
  isLoading: false,
  isError: false,
  isFetching: false,
  hasMore: false,
  isFetchingMore: false,
  loadMore: vi.fn(),
  refetch: vi.fn(),
  update: vi.fn(),
  detailItem: null as Item | null,
  draftOwner: "owner-one" as string | null,
  draftIds: [] as string[],
  draftItems: [] as Item[],
  draftStates: {} as Record<string, string>,
  storageAvailable: true,
  openPhotos: vi.fn(),
}));
vi.mock("@/lib/hooks/use-wardrobe-3d", () => ({ useWardrobe3D: () => state }));
vi.mock("@/lib/lightbox-context", () => ({
  useLightbox: () => ({ open: state.openPhotos }),
}));
vi.mock("@/lib/hooks/use-wardrobe-draft", async () => {
  const React = await import("react");
  return {
    useWardrobeDraft: () => {
      const [ids, setIds] = React.useState(state.draftIds);
      return {
        owner: state.draftOwner,
        ids,
        hydrated: true,
        storageAvailable: state.storageAvailable,
        toggle: (id: string) =>
          setIds((v) =>
            v.includes(id) ? v.filter((q) => q !== id) : [...v, id],
          ),
        remove: (id: string) => setIds((v) => v.filter((q) => q !== id)),
        clear: () => setIds([]),
      };
    },
    useWardrobeDraftItems: (_owner: string | null, ids: readonly string[]) => ({
      entries: ids.map((id) => ({
        id,
        item:
          [...state.items, ...state.draftItems].find((q) => q.id === id) ||
          null,
        state: state.draftStates[id] || "ready",
      })),
      isLoading: ids.some((id) => state.draftStates[id] === "loading"),
      hasErrors: ids.some((id) => state.draftStates[id] === "error"),
      retry: vi.fn(),
    }),
  };
});
vi.mock("@/lib/hooks/use-items", () => ({
  useUpdateItem: () => ({ mutateAsync: state.update, isPending: false }),
  useItem: () => ({ data: state.detailItem }),
}));
vi.mock("@/lib/hooks/use-translated-constants", () => ({
  useTypeLabel: () => (type: string) => type,
  useColorLabel: () => (color: string) => color,
}));
vi.mock("next/dynamic", () => ({
  default:
    () =>
    (props: { onUnavailable(): void; mode?: string; rotation: number }) => (
      <div
        data-testid="rack-renderer"
        data-mode={props.mode}
        data-rotation={props.rotation}
      >
        <button onClick={props.onUnavailable}>Simulate unavailable 3D</button>
      </div>
    ),
}));
vi.mock("next/image", () => ({
  default: ({
    fill,
    priority,
    unoptimized,
    ...props
  }: Record<string, unknown>) => <img alt="" {...props} />,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    key + (values?.name ? ` ${values.name}` : ""),
}));
vi.mock("@/components/item-detail-dialog", () => ({
  ItemDetailDialog: ({ item, open }: { item: Item; open: boolean }) =>
    open ? <div role="dialog">{item.name}</div> : null,
}));

function item(index: number, type: string, name: string, wash = false): Item {
  return {
    id: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
    user_id: "owner-one",
    type,
    name,
    favorite: false,
    needs_wash: wash,
    status: "ready",
    is_archived: false,
    tags: { colors: [], style: [], season: [] },
    colors: ["blue"],
    primary_color: "blue",
    wear_count: index,
    image_url: `/api/v1/images/${index}?signature=example`,
    image_path: "private",
    ai_processed: true,
    tagging_status: "tagged",
    suggestion_count: 0,
    acceptance_count: 0,
    wears_since_wash: 0,
    effective_wash_interval: 5,
    additional_images: [],
    created_at: "2026-10-18T01:00:00Z",
    updated_at: "2026-10-18T01:00:00Z",
  } as Item;
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, {
    owner: "owner-one",
    total: 5,
    isLoading: false,
    isError: false,
    hasMore: false,
    detailItem: null,
    draftOwner: "owner-one",
    draftIds: [],
    draftItems: [],
    draftStates: {},
    storageAvailable: true,
  });
  state.items = [
    item(1, "t-shirt", "Tee"),
    item(2, "pants", "Denim"),
    item(3, "coat", "Coat"),
    item(4, "dress", "Dress"),
    item(5, "sneakers", "Shoes", true),
  ];
  state.update.mockResolvedValue(state.items[0]);
  state.refetch.mockResolvedValue(undefined);
});

describe("3D wardrobe workspace", () => {
  it("shows actual owned items, explains the silhouette and links back to the original wardrobe", () => {
    render(<Wardrobe3DWorkspace />);
    expect(
      screen.getAllByRole("button", { name: /^chooseItem / }),
    ).toHaveLength(5);
    expect(screen.getByText("modelNotice")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "backToGrid" })).toHaveAttribute(
      "href",
      "/dashboard/wardrobe",
    );
  });
  it("intersects category and search and recovers the real controls from an empty result", () => {
    render(<Wardrobe3DWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "groups.tops" }));
    expect(
      screen.getAllByRole("button", { name: /^chooseItem / }),
    ).toHaveLength(1);
    fireEvent.change(screen.getByRole("textbox", { name: "searchLabel" }), {
      target: { value: "absent123" },
    });
    expect(screen.getByText("emptyTitle")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "resetFilters" }));
    expect(screen.getByRole("textbox", { name: "searchLabel" })).toHaveValue(
      "",
    );
    expect(
      screen.getAllByRole("button", { name: /^chooseItem / }),
    ).toHaveLength(5);
  });
  it("selects two items for comparison, builds a real studio seed and keeps dirty clothes out of the basket", () => {
    render(<Wardrobe3DWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "compare" }));
    fireEvent.click(screen.getByRole("button", { name: "addToTray" }));
    fireEvent.click(screen.getByRole("button", { name: "chooseItem Denim" }));
    fireEvent.click(screen.getByRole("button", { name: "compare" }));
    fireEvent.click(screen.getByRole("button", { name: "addToTray" }));
    expect(
      within(screen.getByRole("region", { name: "compareTitle" })).getAllByRole(
        "img",
      ),
    ).toHaveLength(2);
    const href = screen
      .getByRole("link", { name: "openStudio" })
      .getAttribute("href")!;
    const params = new URL(href, "http://localhost").searchParams;
    expect(params.get("seed")?.split(",")).toEqual(
      state.items.slice(0, 2).map((q) => q.id),
    );
    fireEvent.click(screen.getByRole("button", { name: "chooseItem Shoes" }));
    expect(screen.getByRole("button", { name: "addToTray" })).toBeDisabled();
  });
  it("persists favorite using the existing mutation and refreshes the independent inventory", async () => {
    render(<Wardrobe3DWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "favorite" }));
    await waitFor(() =>
      expect(state.update).toHaveBeenCalledWith({
        id: state.items[0].id,
        data: { favorite: true },
      }),
    );
    await waitFor(() => expect(state.refetch).toHaveBeenCalled());
  });
  it("offers a usable photo fallback when WebGL is unavailable", () => {
    render(<Wardrobe3DWorkspace />);
    fireEvent.click(
      screen.getByRole("button", { name: "Simulate unavailable 3D" }),
    );
    expect(screen.getByText("unavailable")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /^chooseItem / }),
    ).toHaveLength(5);
  });
  it("clears basket and comparison when the active owner changes", async () => {
    const { rerender } = render(<Wardrobe3DWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "addToTray" }));
    fireEvent.click(screen.getByRole("button", { name: "compare" }));
    state.owner = "owner-two";
    state.items = [];
    state.total = 0;
    rerender(<Wardrobe3DWorkspace />);
    await waitFor(() =>
      expect(
        screen.queryByRole("link", { name: "openStudio" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("region", { name: "compareTitle" }),
    ).not.toBeInTheDocument();
  });
  it("keeps loaded clothes and the basket usable when a later page fails", () => {
    const { rerender } = render(<Wardrobe3DWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "addToTray" }));
    state.isError = true;
    state.hasMore = true;
    rerender(<Wardrobe3DWorkspace />);
    expect(screen.getByText("partialError")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /^chooseItem / }),
    ).toHaveLength(5);
    expect(
      screen.getByRole("link", { name: "openStudio" }),
    ).toBeInTheDocument();
  });
  it("keeps an open detail connected to the authoritative single-item cache", () => {
    const { rerender } = render(<Wardrobe3DWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "showDetails" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Tee");
    state.detailItem = { ...state.items[0], name: "Updated Tee" };
    rerender(<Wardrobe3DWorkspace />);
    expect(screen.getByRole("dialog")).toHaveTextContent("Updated Tee");
    state.detailItem = {
      ...state.items[0],
      name: "Other account item",
      user_id: "owner-two",
    };
    rerender(<Wardrobe3DWorkspace />);
    expect(screen.getByRole("dialog")).not.toHaveTextContent(
      "Other account item",
    );
  });
  it("switches to focus mode and exposes complete rotation without replacing the selected item", () => {
    render(<Wardrobe3DWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "focusItem" }));
    expect(screen.getByTestId("rack-renderer")).toHaveAttribute(
      "data-mode",
      "focus",
    );
    const slider = screen.getByRole("slider", { name: "rotateLabel" });
    expect(slider).toHaveAttribute("min", "-180");
    expect(slider).toHaveAttribute("max", "180");
    fireEvent.change(slider, { target: { value: "180" } });
    expect(screen.getByTestId("rack-renderer")).toHaveAttribute(
      "data-rotation",
      "180",
    );
    fireEvent.click(screen.getByRole("button", { name: "backToRack" }));
    expect(screen.getByTestId("rack-renderer")).toHaveAttribute(
      "data-mode",
      "rack",
    );
    expect(slider).toHaveAttribute("max", "70");
  });
  it("opens actual primary and additional photos with signed URLs intact", () => {
    state.items[0].additional_images = [
      { image_url: "/private/back?sig=original" },
    ] as Item["additional_images"];
    render(<Wardrobe3DWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: /inspectPhotos/ }));
    expect(state.openPhotos).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          uri: state.items[0].image_url,
          itemName: "Tee",
        }),
        expect.objectContaining({
          uri: "/private/back?sig=original",
          itemName: "Tee",
        }),
      ],
      0,
      state.items[0].id,
    );
  });
  it("restores a basket item outside the current inventory page, even when filtering has no results", () => {
    const extra = item(60, "coat", "Saved coat");
    state.draftIds = [extra.id];
    state.draftItems = [extra];
    render(<Wardrobe3DWorkspace />);
    fireEvent.change(screen.getByRole("textbox", { name: "searchLabel" }), {
      target: { value: "absent123" },
    });
    expect(screen.getByText("emptyTitle")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "trayTitle" })).toHaveTextContent(
      "Saved coat",
    );
    expect(
      screen.getByRole("link", { name: "openStudio" }),
    ).toBeInTheDocument();
  });
  it("blocks partial studio seeds until all saved clothes resolve and allows removal of missing entries", () => {
    const missing = item(60, "coat", "Missing");
    state.draftIds = [state.items[0].id, missing.id];
    state.draftStates[missing.id] = "unavailable";
    render(<Wardrobe3DWorkspace />);
    expect(
      screen.queryByRole("link", { name: "openStudio" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("draftMissingItem")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "removeUnavailable" }));
    expect(
      screen.getByRole("link", { name: "openStudio" }),
    ).toBeInTheDocument();
  });
  it("does not expose saved IDs or images belonging to a stale draft owner", () => {
    state.draftOwner = "owner-two";
    state.draftIds = [item(60, "coat", "Private coat").id];
    state.draftItems = [item(60, "coat", "Private coat")];
    render(<Wardrobe3DWorkspace />);
    expect(screen.queryByText("Private coat")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "openStudio" }),
    ).not.toBeInTheDocument();
  });
  it("frees comparison capacity when an item is removed from the wardrobe", () => {
    const { rerender } = render(<Wardrobe3DWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "compare" }));
    fireEvent.click(screen.getByRole("button", { name: "chooseItem Denim" }));
    fireEvent.click(screen.getByRole("button", { name: "compare" }));
    state.items = state.items.slice(1);
    rerender(<Wardrobe3DWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "chooseItem Coat" }));
    fireEvent.click(screen.getByRole("button", { name: "compare" }));
    const compare = screen.getByRole("region", { name: "compareTitle" });
    expect(within(compare).getByText("Coat")).toBeInTheDocument();
    expect(within(compare).getAllByRole("img")).toHaveLength(2);
  });
  it("retains unresolved basket slots during loading and network errors without exposing a partial studio link", () => {
    state.draftIds = [state.items[0].id, state.items[1].id];
    state.draftStates[state.items[1].id] = "loading";
    const { rerender } = render(<Wardrobe3DWorkspace />);
    const tray = screen.getByRole("region", { name: "trayTitle" });
    expect(within(tray).getAllByRole("listitem")).toHaveLength(2);
    expect(within(tray).getByRole("status")).toHaveTextContent("draftLoading");
    expect(
      screen.queryByRole("link", { name: "openStudio" }),
    ).not.toBeInTheDocument();
    state.draftStates[state.items[1].id] = "error";
    rerender(<Wardrobe3DWorkspace />);
    expect(
      within(tray).getByRole("button", { name: "retryDraft" }),
    ).toBeInTheDocument();
    expect(
      within(tray).queryByRole("button", { name: "removeUnavailable" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "openStudio" }),
    ).not.toBeInTheDocument();
  });
  it("keeps the restored basket usable if the wardrobe list fails completely and explains storage failure", () => {
    state.draftIds = [state.items[0].id];
    state.draftItems = [state.items[0]];
    state.items = [];
    state.isError = true;
    state.storageAvailable = false;
    render(<Wardrobe3DWorkspace />);
    expect(screen.getByText("error")).toBeInTheDocument();
    const tray = screen.getByRole("region", { name: "trayTitle" });
    expect(tray).toHaveTextContent("Tee");
    expect(tray).toHaveTextContent("draftStorageError");
    expect(
      screen.getByRole("link", { name: "openStudio" }),
    ).toBeInTheDocument();
  });
  it("disables photo inspection when no actual photo exists", () => {
    state.items[0].image_url = "";
    render(<Wardrobe3DWorkspace />);
    expect(
      screen.getByRole("button", { name: /inspectPhotos/ }),
    ).toBeDisabled();
    expect(state.openPhotos).not.toHaveBeenCalled();
  });
});
