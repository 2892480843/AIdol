import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LooksWorkspace } from "@/components/looks/workspace";
import { setActiveSession } from "@/lib/api";
import { LookStorageError } from "@/lib/looks/types";

const mock = vi.hoisted(() => ({
  worn: vi.fn(),
  tryon: vi.fn(),
  createLook: vi.fn(),
  removeLook: vi.fn(),
  createTryon: vi.fn(),
  inventory: vi.fn(),
}));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));
vi.mock("next/image", () => ({
  default: ({ fill, priority, ...props }: Record<string, unknown>) => (
    <img {...props} />
  ),
}));
vi.mock("@/lib/hooks/use-worn-looks", () => ({ useWornLooks: mock.worn }));
vi.mock("@/lib/hooks/use-tryon", () => ({ useTryOn: mock.tryon }));
vi.mock("@/lib/hooks/use-inspiration-wardrobe", () => ({
  useInspirationWardrobe: mock.inventory,
}));
vi.mock("@/lib/hooks/use-translated-constants", () => ({
  useTypeLabel: () => (value: string) => value,
}));
vi.mock("@/components/shared/item-picker", () => ({
  ItemPicker: ({
    selectedIds,
    onToggle,
  }: {
    selectedIds: Set<string>;
    onToggle: (item: typeof top) => void;
  }) => (
    <button
      type="button"
      aria-pressed={selectedIds.has(top.id)}
      onClick={() => onToggle(top)}
    >
      Associate test shirt
    </button>
  ),
}));

const photo = () => new File(["photo"], "Sunday.jpg", { type: "image/jpeg" });
const top = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "shirt",
  name: "My white shirt",
  user_id: "owner-a",
  status: "ready",
  is_archived: false,
  needs_wash: false,
};
const capabilities = {
  available: true,
  configured: true,
  enabled: true,
  provider: "seedream",
  model: "test-model",
  accepted_mime_types: ["image/jpeg"],
  max_person_image_bytes: 10485760,
  supported_categories: ["tops"],
  supported_item_types: ["shirt"],
  max_items: 1,
  poll_interval_ms: 3000,
};

beforeEach(() => {
  setActiveSession("owner-a", "token-a");
  vi.clearAllMocks();
  mock.createLook.mockResolvedValue({ id: "new" });
  mock.removeLook.mockResolvedValue(undefined);
  mock.createTryon.mockResolvedValue({ id: "task", status: "queued" });
  mock.worn.mockReturnValue({
    looks: [],
    isLoading: false,
    isSaving: false,
    error: null,
    create: mock.createLook,
    remove: mock.removeLook,
    refetch: vi.fn(),
  });
  mock.tryon.mockReturnValue({
    capabilities: {
      ...capabilities,
      available: false,
      configured: false,
      reason: "not_configured",
    },
    isLoadingCapabilities: false,
    capabilityError: null,
    tasks: [],
    isLoadingTasks: false,
    error: null,
    isCreating: false,
    create: mock.createTryon,
    refetchCapabilities: vi.fn(),
    refetchTasks: vi.fn(),
  });
  mock.inventory.mockReturnValue({
    items: [top],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    hasMore: false,
    loadMore: vi.fn(),
    isFetchingMore: false,
    total: 1,
  });
});
afterEach(() => act(() => setActiveSession(null, null)));

describe("looks workspace", () => {
  it("labels the fictional model demonstrations and exposes all three experiences", () => {
    render(<LooksWorkspace />);
    expect(screen.getByText("modelNotice")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "tabs.model" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "tabs.worn" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "tabs.tryon" })).toBeInTheDocument();
    expect(mock.createTryon).not.toHaveBeenCalled();
  });

  it("requires explicit saving before storing separately named worn photos", async () => {
    render(<LooksWorkspace />);
    fireEvent.click(screen.getByRole("tab", { name: "tabs.worn" }));
    fireEvent.change(screen.getByLabelText("worn.photos"), {
      target: {
        files: [
          photo(),
          new File(["other"], "Monday.png", { type: "image/png" }),
        ],
      },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: 'worn.name:{"index":1}' }),
      { target: { value: "Sunday outfit" } },
    );
    expect(mock.createLook).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "worn.add" }));
    await waitFor(() => expect(mock.createLook).toHaveBeenCalledTimes(2));
    expect(mock.createLook).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        name: "Sunday outfit",
        photoBlob: expect.any(File),
        itemIds: [],
      }),
    );
    expect(mock.createLook).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ name: "Monday" }),
    );
  });

  it("locks garment associations while a batch save is pending", async () => {
    let finishFirst!: (value: { id: string }) => void;
    const firstSave = new Promise<{ id: string }>((resolve) => {
      finishFirst = resolve;
    });
    mock.createLook
      .mockReturnValueOnce(firstSave)
      .mockResolvedValueOnce({ id: "second" });
    render(<LooksWorkspace />);
    fireEvent.click(screen.getByRole("tab", { name: "tabs.worn" }));
    fireEvent.change(screen.getByLabelText("worn.photos"), {
      target: {
        files: [
          photo(),
          new File(["second"], "Monday.png", { type: "image/png" }),
        ],
      },
    });
    fireEvent.click(screen.getByText("worn.associate"));
    const association = screen.getByRole("button", {
      name: "Associate test shirt",
    });
    fireEvent.click(association);
    expect(association).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "worn.add" }));
    expect(association).toBeDisabled();
    fireEvent.click(association);
    expect(association).toHaveAttribute("aria-pressed", "true");
    await act(async () => {
      finishFirst({ id: "first" });
      await firstSave;
    });
    await waitFor(() => expect(mock.createLook).toHaveBeenCalledTimes(2));
    expect(mock.createLook).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ itemIds: [top.id] }),
    );
    expect(mock.createLook).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ itemIds: [top.id] }),
    );
  });

  it("never deletes a stored photograph until the confirmation action", async () => {
    mock.worn.mockReturnValue({
      ...mock.worn(),
      looks: [
        {
          id: "local-look",
          name: "My real Sunday",
          itemIds: [],
          createdAt: 1,
          photoUrl: "blob:photo",
        },
      ],
    });
    render(<LooksWorkspace />);
    fireEvent.click(screen.getByRole("tab", { name: "tabs.worn" }));
    fireEvent.click(screen.getByRole("button", { name: "worn.delete" }));
    expect(mock.removeLook).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("alertdialog", { name: "worn.deleteTitle" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "worn.confirmDelete" }));
    await waitFor(() =>
      expect(mock.removeLook).toHaveBeenCalledWith("local-look"),
    );
  });

  it("retains only failed uploads for an explicit retry after a partial save", async () => {
    mock.createLook
      .mockResolvedValueOnce({ id: "saved" })
      .mockRejectedValueOnce(new LookStorageError("quota-exceeded"));
    render(<LooksWorkspace />);
    fireEvent.click(screen.getByRole("tab", { name: "tabs.worn" }));
    fireEvent.change(screen.getByLabelText("worn.photos"), {
      target: {
        files: [
          photo(),
          new File(["second"], "Monday.png", { type: "image/png" }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "worn.add" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        'worn.partialError:{"count":1}',
      ),
    );
    expect(
      screen.getByRole("textbox", { name: 'worn.name:{"index":1}' }),
    ).toHaveValue("Monday");
    expect(
      screen.queryByRole("textbox", { name: 'worn.name:{"index":2}' }),
    ).not.toBeInTheDocument();
    expect(mock.createLook).toHaveBeenCalledTimes(2);
  });

  it("lets the user cancel deletion without touching persistent photos", async () => {
    mock.worn.mockReturnValue({
      ...mock.worn(),
      looks: [
        {
          id: "local-look",
          name: "Sunday",
          itemIds: [],
          createdAt: 1,
          photoUrl: "blob:photo",
        },
      ],
    });
    render(<LooksWorkspace />);
    fireEvent.click(screen.getByRole("tab", { name: "tabs.worn" }));
    fireEvent.click(screen.getByRole("button", { name: "worn.delete" }));
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "worn.cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(mock.removeLook).not.toHaveBeenCalled();
  });

  it("disables photo input and generation when the provider is not configured", () => {
    render(<LooksWorkspace />);
    fireEvent.click(screen.getByRole("tab", { name: "tabs.tryon" }));
    expect(screen.getByLabelText("tryon.personPhoto")).toBeDisabled();
    expect(screen.getByRole("button", { name: "tryon.start" })).toBeDisabled();
    expect(screen.getByText("tryon.unavailable")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("tryon.personPhoto"), {
      target: { files: [photo()] },
    });
    expect(mock.createTryon).not.toHaveBeenCalled();
  });

  it("requires a real photo, one owned top and explicit provider consent", async () => {
    mock.tryon.mockReturnValue({ ...mock.tryon(), capabilities });
    render(<LooksWorkspace />);
    fireEvent.click(screen.getByRole("tab", { name: "tabs.tryon" }));
    const start = screen.getByRole("button", { name: "tryon.start" });
    expect(start).toBeDisabled();
    fireEvent.change(screen.getByLabelText("tryon.personPhoto"), {
      target: { files: [photo()] },
    });
    fireEvent.click(screen.getByRole("textbox", { name: "tryon.garment" }));
    fireEvent.click(await screen.findByRole("option", { name: top.name }));
    expect(start).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "tryon.consent" }));
    fireEvent.click(start);
    await waitFor(() =>
      expect(mock.createTryon).toHaveBeenCalledWith({
        personPhoto: expect.any(File),
        itemId: top.id,
        consent: true,
      }),
    );
  });

  it("blocks generation when an inventory refresh fails while an old top remains visible", async () => {
    mock.tryon.mockReturnValue({ ...mock.tryon(), capabilities });
    const { rerender } = render(<LooksWorkspace />);
    fireEvent.click(screen.getByRole("tab", { name: "tabs.tryon" }));
    fireEvent.change(screen.getByLabelText("tryon.personPhoto"), {
      target: { files: [photo()] },
    });
    fireEvent.click(screen.getByRole("textbox", { name: "tryon.garment" }));
    fireEvent.click(await screen.findByRole("option", { name: top.name }));
    fireEvent.click(screen.getByRole("checkbox", { name: "tryon.consent" }));
    expect(
      screen.getByRole("button", { name: "tryon.start" }),
    ).not.toBeDisabled();
    mock.inventory.mockReturnValue({ ...mock.inventory(), isError: true });
    rerender(<LooksWorkspace />);
    expect(screen.getByRole("button", { name: "tryon.start" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "tryon.start" }));
    expect(mock.createTryon).not.toHaveBeenCalled();
  });

  it("discards staged personal photos on an account switch, including batched return", () => {
    render(<LooksWorkspace />);
    fireEvent.click(screen.getByRole("tab", { name: "tabs.worn" }));
    fireEvent.change(screen.getByLabelText("worn.photos"), {
      target: { files: [photo()] },
    });
    expect(
      screen.getByRole("textbox", { name: 'worn.name:{"index":1}' }),
    ).toHaveValue("Sunday");
    act(() => {
      setActiveSession("owner-b", "token-b");
      setActiveSession("owner-a", "token-a");
    });
    fireEvent.click(screen.getByRole("tab", { name: "tabs.worn" }));
    expect(
      screen.queryByRole("textbox", { name: 'worn.name:{"index":1}' }),
    ).not.toBeInTheDocument();
    expect(mock.createLook).not.toHaveBeenCalled();
  });
});
