import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setActiveSession } from "@/lib/api";
import { saveDraft } from "@/lib/studio/draft-storage";
import StudioEditorPage from "@/app/dashboard/outfits/new/page";

const state = vi.hoisted(() => ({
  params: "",
  editOutfit: null as unknown,
  create: vi.fn(),
  patch: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(state.params),
}));
vi.mock("@/lib/hooks/use-items", () => ({
  useItems: () => ({ data: { items: [] } }),
}));
vi.mock("@/lib/hooks/use-outfits", () => ({
  useOutfit: () => ({
    data: state.editOutfit,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/lib/hooks/use-studio", () => ({
  useCreateStudioOutfit: () => ({
    mutateAsync: state.create,
    isPending: false,
  }),
  usePatchOutfit: () => ({ mutateAsync: state.patch, isPending: false }),
}));
vi.mock("@/lib/hooks/use-user", () => ({
  useUserToday: () => () => "2026-10-17",
}));
vi.mock("@/components/shared/item-picker", () => ({ ItemPicker: () => null }));
vi.mock("@/components/shared/clone-to-lookbook-dialog", () => ({
  CloneToLookbookDialog: () => null,
}));
vi.mock("@/components/studio/canvas-panel", () => ({
  CanvasPanel: ({ items }: { items: { id: string }[] }) => (
    <div data-testid="canvas">{items.map((i) => i.id).join(",")}</div>
  ),
}));
vi.mock("@/components/studio/details-panel", () => ({
  DetailsPanel: ({
    name,
    onNameChange,
    occasion,
  }: {
    name: string;
    onNameChange: (name: string) => void;
    occasion: string;
  }) => (
    <>
      <input
        aria-label="look name"
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
      />
      <span data-testid="occasion">{occasion}</span>
    </>
  ),
}));
const first = "11111111-1111-4111-8111-111111111111";
let client: QueryClient;
let fetchMock: ReturnType<typeof vi.fn>;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  setActiveSession("owner-a", "token-a");
  localStorage.clear();
  state.params = new URLSearchParams({
    seed: first,
    occasion: "office",
    name: "Clean lines",
  }).toString();
  state.editOutfit = null;
  state.create.mockReset();
  state.patch.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchMock = vi
    .fn()
    .mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: first,
        user_id: "owner-a",
        type: "shirt",
        status: "ready",
        is_archived: false,
        needs_wash: false,
      }),
    });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  client.clear();
  setActiveSession(null, null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("inspiration Studio entry", () => {
  it("loads verified seed items and metadata without prompting, overwriting or deleting an existing draft", async () => {
    saveDraft({ items: ["old-item"], name: "Old draft", occasion: "casual" });
    const original = localStorage.getItem("studio_draft_v2:owner-a");
    const writes = vi.spyOn(Storage.prototype, "setItem");
    const removes = vi.spyOn(Storage.prototype, "removeItem");
    render(<StudioEditorPage />, { wrapper });
    await waitFor(() =>
      expect(screen.getByTestId("canvas")).toHaveTextContent(first),
    );
    expect(screen.getByLabelText("look name")).toHaveValue("Clean lines");
    expect(screen.getByTestId("occasion")).toHaveTextContent("office");
    expect(screen.queryByText("new.draft.found")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("look name"), {
      target: { value: "A small adjustment" },
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 550));
    });
    expect(writes).not.toHaveBeenCalled();
    expect(removes).not.toHaveBeenCalled();
    expect(localStorage.getItem("studio_draft_v2:owner-a")).toBe(original);
    expect(state.create).not.toHaveBeenCalled();
    expect(state.patch).not.toHaveBeenCalled();
  });
  it("keeps edit mode authoritative even when a seed is also provided", async () => {
    state.params += "&edit=existing-look";
    state.editOutfit = {
      id: "existing-look",
      items: [{ id: "edit-item", type: "pants" }],
      name: "Existing",
      occasion: "casual",
    };
    render(<StudioEditorPage />, { wrapper });
    await waitFor(() =>
      expect(screen.getByTestId("canvas")).toHaveTextContent("edit-item"),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("look name")).toHaveValue("Existing");
  });
  it("shows a safe translated error and never fetches malformed seeds", async () => {
    state.params = "seed=not-a-uuid&occasion=casual";
    render(<StudioEditorPage />, { wrapper });
    expect(
      await screen.findByText("new.errors.couldNotLoad"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("canvas")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not place a foreign item on the canvas or expose server text", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: "private server details" }),
    });
    render(<StudioEditorPage />, { wrapper });
    expect(
      await screen.findByText("new.errors.couldNotLoad"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("canvas")).not.toBeInTheDocument();
    expect(
      screen.queryByText("private server details"),
    ).not.toBeInTheDocument();
    expect(state.create).not.toHaveBeenCalled();
  });
});
