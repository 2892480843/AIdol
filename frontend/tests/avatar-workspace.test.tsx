/* eslint-disable @next/next/no-img-element -- Verify the real image states with a DOM image. */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Item } from "@/lib/types";
import { AvatarWorkspace } from "@/components/avatar-studio/workspace";
import { DEFAULT_AVATAR_CONFIG } from "@/lib/avatar-studio";

const state = vi.hoisted(() => ({
  owner: "owner-one",
  items: [] as Item[],
  save: vi.fn(),
  bookmark: vi.fn(),
  removeBookmark: vi.fn(),
  capture: vi.fn(),
  captureVideo: vi.fn(),
  entries: [] as unknown[],
  sceneError: (_kind: string) => { },
  resolutionError: false,
  retryItems: vi.fn(),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    key +
    (values?.name
      ? ` ${values.name}`
      : values?.count !== undefined
        ? ` ${values.count}`
        : ""),
}));
vi.mock("next/image", () => ({
  default: ({ fill, unoptimized, ...props }: Record<string, unknown>) => (
    <img alt="" {...props} />
  ),
}));
vi.mock("@mantine/hooks", () => ({ useReducedMotion: () => false }));
vi.mock("next/dynamic", async () => {
  const { useEffect } = await import("react");
  return {
    default: () =>
      function Scene(props: Record<string, unknown>) {
        useEffect(() => {
          (props.onController as Function)({ capture: state.capture, captureTurntable: state.captureVideo });
          (props.onReady as Function)();
          state.sceneError = props.onError as typeof state.sceneError;
        }, [props.onController, props.onReady, props.onError]);
        return (
          <div
            data-testid="avatar-scene"
            data-config={JSON.stringify(props.config)}
            data-dress={String(props.dressMode)}
            data-framing={String(props.framing ?? "full")}
          />
        );
      },
  };
});
vi.mock("@/lib/looks/use-owner-scope", () => ({
  useLooksOwnerScope: () => ({
    ownerId: state.owner,
    epoch: 0,
    capture: () => ({
      assert: vi.fn(),
      isCurrent: () => state.owner === "owner-one",
    }),
  }),
}));
vi.mock("@/lib/hooks/use-inspiration-wardrobe", () => ({
  useInspirationWardrobe: () => ({
    items: state.items,
    total: state.items.length,
    isLoading: false,
    isError: false,
    hasMore: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/lib/hooks/use-wardrobe-draft", () => ({
  useWardrobeDraftItems: (_owner: string, ids: string[]) => ({
    entries: ids.map((id) => ({
      id,
      item: state.items.find((item) => item.id === id),
      state: state.items.some((item) => item.id === id)
        ? "ready"
        : "unavailable",
    })),
    isLoading: false,
    hasErrors: state.resolutionError,
    retry: state.retryItems,
  }),
}));
vi.mock("@/lib/hooks/use-translated-constants", () => ({
  useTypeLabel: () => (type: string) => type,
}));
vi.mock("@/lib/hooks/use-avatar-outfit", () => ({
  useSaveAvatarOutfit: () => ({
    ownerId: state.owner,
    isSaving: false,
    error: null,
    save: state.save,
    clearError: vi.fn(),
  }),
}));
vi.mock("@/lib/hooks/use-avatar-journal", () => ({
  useAvatarJournal: () => ({
    entries: state.entries,
    hydrated: true,
    error: false,
    save: state.bookmark,
    remove: state.removeBookmark,
  }),
}));
const ids = [1, 2, 3].map(
  (n) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`,
);
beforeEach(() => {
  vi.clearAllMocks();
  state.owner = "owner-one";
  state.resolutionError = false;
  state.entries = [];
  state.items = ["t-shirt", "pants", "dress"].map(
    (type, i) =>
      ({
        id: ids[i],
        type,
        name: ["Blue tee", "Black pants", "Pink dress"][i],
        user_id: state.owner,
        status: "ready",
        is_archived: false,
        needs_wash: false,
        colors: ["blue", "black", "pink"][i]
          ? [["blue", "black", "pink"][i]]
          : [],
        tags: {},
        image_url: "/private.jpg",
      }) as unknown as Item,
  );
  state.save.mockResolvedValue({ id: ids[2] });
  state.bookmark.mockReturnValue(true);
  state.removeBookmark.mockReturnValue(true);
  state.captureVideo.mockResolvedValue(new Blob(["video"], { type: "video/webm" }));
  state.capture.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
  URL.createObjectURL = vi.fn(() => "blob:avatar-export");
  URL.revokeObjectURL = vi.fn();
});
describe("3D avatar workspace", () => {
  it("locks controls while recording and exposes the completed local video", async () => {
    let finish!: (b: Blob) => void;
    state.captureVideo.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<AvatarWorkspace initialIds={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "exportVideo" }));
    expect(screen.getByText("videoRecording")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "nextLook" })).toBeDisabled();
    await act(async () => finish(new Blob(["video"], { type: "video/webm" })));
    expect(screen.getByRole("button", { name: "nextLook" })).toBeEnabled();
    expect(screen.getByLabelText("videoPreview")).toHaveAttribute("src", "blob:avatar-export");
    expect(screen.getByRole("link", { name: "exportVideo" })).toHaveAttribute("download", expect.stringMatching(/^dada-360-.*\.webm$/));
  });
  it("shows recording errors without discarding the loaded model", async () => {
    state.captureVideo.mockRejectedValueOnce(new Error("unsupported"));
    render(<AvatarWorkspace initialIds={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "exportVideo" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("videoError"));
    expect(screen.getByRole("button", { name: "export" })).toBeEnabled();
  });
  it("switches actual detailed outfits in both directions and bookmarks the specific model", () => {
    render(<AvatarWorkspace initialIds={[]} />);
    expect(JSON.parse(screen.getByTestId("avatar-scene").getAttribute("data-config")!).editorialLook).toBe("dopamine");
    fireEvent.click(screen.getByRole("button", { name: "nextLook" }));
    expect(JSON.parse(screen.getByTestId("avatar-scene").getAttribute("data-config")!).editorialLook).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "nextLook" }));
    expect(JSON.parse(screen.getByTestId("avatar-scene").getAttribute("data-config")!).editorialLook).toBe("street");
    expect(screen.getByRole("button", { name: "editorialFemaleStreet" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "bookmark" }));
    expect(state.bookmark).toHaveBeenCalledWith(expect.objectContaining({ config: expect.objectContaining({ renderMode: "editorial", editorialLook: "street" }) }));
    fireEvent.click(screen.getByRole("button", { name: "previousLook" }));
    expect(JSON.parse(screen.getByTestId("avatar-scene").getAttribute("data-config")!).editorialLook).toBeUndefined();
  });
  it("inspects real facial detail without switching the model and resets to the complete silhouette", () => {
    render(<AvatarWorkspace initialIds={[]} />);
    const original = screen.getByTestId("avatar-scene").getAttribute("data-config");
    fireEvent.click(screen.getByRole("button", { name: "portraitView" }));
    expect(screen.getByTestId("avatar-scene")).toHaveAttribute("data-framing", "portrait");
    expect(screen.getByTestId("avatar-scene")).toHaveAttribute("data-config", original);
    fireEvent.click(screen.getByRole("button", { name: "resetView" }));
    expect(screen.getByTestId("avatar-scene")).toHaveAttribute("data-framing", "full");
  });
  it("keeps the dopamine female asset out of the male collection", () => {
    render(<AvatarWorkspace initialIds={[]} />);
    expect(screen.getByRole("button", { name: "editorialFemaleDopamine" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "modelMale" }));
    expect(JSON.parse(screen.getByTestId("avatar-scene").getAttribute("data-config")!)).toEqual(expect.objectContaining({ model: "male", editorialLook: "refined" }));
    expect(screen.queryByRole("button", { name: "editorialFemaleDopamine" })).not.toBeInTheDocument();
  });
  it("opens the high-detail complete outfit and keeps garment controls in the explicit sample mode", () => {
    render(<AvatarWorkspace initialIds={[]} />);
    expect(JSON.parse(screen.getByTestId("avatar-scene").getAttribute("data-config")!).renderMode).toBe("editorial");
    expect(screen.getByText("editorialNotice")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "sampleMode" }));
    expect(JSON.parse(screen.getByTestId("avatar-scene").getAttribute("data-config")!).renderMode).toBeUndefined();
    expect(screen.getAllByRole("combobox", { name: /sampleCut/ }).length).toBeGreaterThan(0);
  });
  it("browses saved looks by date and makes a new day's bookmark without overwriting the old look", () => {
    state.entries = [
      {
        id: ids[0],
        name: "Earlier",
        date: "2026-10-17",
        config: DEFAULT_AVATAR_CONFIG,
        itemIds: [],
        favorite: true,
        dressMode: false,
        showOuterwear: false,
        createdAt: "2026-10-17T00:00:00Z",
      },
      {
        id: ids[1],
        name: "Later",
        date: "2026-10-18",
        config: DEFAULT_AVATAR_CONFIG,
        itemIds: [],
        favorite: true,
        dressMode: false,
        showOuterwear: false,
        createdAt: "2026-10-18T00:00:00Z",
      },
    ];
    render(<AvatarWorkspace initialIds={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "previousSavedLook" }));
    expect(screen.getByLabelText("nameLabel")).toHaveValue("Later");
    fireEvent.click(screen.getByRole("button", { name: "previousSavedLook" }));
    expect(screen.getByLabelText("dateLabel")).toHaveValue("2026-10-17");
    fireEvent.click(screen.getByRole("button", { name: "nextSavedLook" }));
    expect(screen.getByLabelText("dateLabel")).toHaveValue("2026-10-18");
    fireEvent.change(screen.getByLabelText("dateLabel"), {
      target: { value: "2026-10-19" },
    });
    fireEvent.click(screen.getByRole("button", { name: "bookmark" }));
    const saved = state.bookmark.mock.calls.at(-1)![0];
    expect(saved.id).not.toBe(ids[1]);
    expect(saved.date).toBe("2026-10-19");
    expect(state.save).not.toHaveBeenCalled();
  });
  it("browses complete looks without discarding selected inventory, and can choose a sample cut", () => {
    render(<AvatarWorkspace initialIds={[ids[0]]} />);
    fireEvent.click(screen.getByRole("button", { name: "nextLook" }));
    expect(
      JSON.parse(
        screen.getByTestId("avatar-scene").getAttribute("data-config")!,
      ).preset,
    ).toBe("sport");
    expect(
      screen.getByRole("button", { name: "removeItem Blue tee" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "previousLook" }));
    expect(
      JSON.parse(
        screen.getByTestId("avatar-scene").getAttribute("data-config")!,
      ).preset,
    ).toBe("elegant");
    fireEvent.click(screen.getByRole("checkbox", { name: "showDress" }));
    fireEvent.change(screen.getByLabelText("sampleCut bottoms"), {
      target: { value: "cargo" },
    });
    expect(
      JSON.parse(
        screen.getByTestId("avatar-scene").getAttribute("data-config")!,
      ).garments.bottoms,
    ).toBe("cargo");
    expect(state.save).not.toHaveBeenCalled();
  });
  it("restores saved scene controls, date and owned clothes without automatically creating an outfit", () => {
    state.entries = [
      {
        id: ids[0],
        name: "Saved pose",
        dressMode: false,
        showOuterwear: false,
        createdAt: "2026-10-18T00:00:00.000Z",
        date: "2026-11-01",
        config: {
          ...DEFAULT_AVATAR_CONFIG,
          model: "male",
          pose: "editorial",
          light: "night",
          rotation: 90,
          zoom: 1.25,
        },
        itemIds: [ids[0], ids[1]],
        favorite: false,
      },
    ];
    render(<AvatarWorkspace initialIds={[]} />);
    fireEvent.click(
      screen.getByRole("button", { name: "restoreLook Saved pose" }),
    );
    expect(screen.getByLabelText("dateLabel")).toHaveValue("2026-11-01");
    expect(screen.getByLabelText("nameLabel")).toHaveValue("Saved pose");
    expect(
      screen.getByTestId("avatar-scene").getAttribute("data-config"),
    ).toContain('"model":"male"');
    expect(
      screen.getByTestId("avatar-scene").getAttribute("data-config"),
    ).toContain('"light":"night"');
    expect(
      screen.getByRole("button", { name: "removeItem Blue tee" }),
    ).toBeInTheDocument();
    expect(state.save).not.toHaveBeenCalled();
    expect(state.bookmark).not.toHaveBeenCalled();
  });
  it("closes an unconfirmed deletion when the active account changes", () => {
    state.entries = [
      {
        id: ids[0],
        name: "Weekend",
        date: "2026-10-18",
        config: DEFAULT_AVATAR_CONFIG,
        itemIds: [],
        favorite: true,
      },
    ];
    const h = render(<AvatarWorkspace initialIds={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "deleteLook Weekend" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    state.owner = "owner-two";
    state.entries = [];
    state.items = [];
    h.rerender(<AvatarWorkspace initialIds={[]} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(state.removeBookmark).not.toHaveBeenCalled();
  });
  it("names a saved scene in its deletion dialog and keeps it when deletion is cancelled", () => {
    state.entries = [
      {
        id: ids[0],
        name: "Weekend",
        date: "2026-10-18",
        config: {
          model: "female",
          palette: { tops: "#ffffff", bottoms: "#222222" },
        },
        itemIds: [],
        favorite: true,
      },
    ];
    render(<AvatarWorkspace initialIds={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "deleteLook Weekend" }));
    const dialog = screen.getByRole("dialog", { name: "deleteConfirmTitle" });
    expect(
      within(dialog).getByText("deleteConfirmDescription Weekend"),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "deleteCancel" }),
    );
    expect(state.removeBookmark).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "restoreLook Weekend" }),
    ).toBeInTheDocument();
  });
  it("only deletes after explicit confirmation and shows a recoverable persistence error", () => {
    state.entries = [
      {
        id: ids[0],
        name: "Weekend",
        date: "2026-10-18",
        config: {
          model: "female",
          palette: { tops: "#ffffff", bottoms: "#222222" },
        },
        itemIds: [],
        favorite: true,
      },
    ];
    state.removeBookmark.mockReturnValue(false);
    render(<AvatarWorkspace initialIds={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "deleteLook Weekend" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "deleteConfirm",
      }),
    );
    expect(state.removeBookmark).toHaveBeenCalledWith(ids[0]);
    expect(
      screen.getByRole("button", { name: "restoreLook Weekend" }),
    ).toBeInTheDocument();
    expect(screen.getByText("deleteError")).toBeInTheDocument();
    state.removeBookmark.mockReturnValue(true);
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "deleteConfirm",
      }),
    );
    expect(screen.getByText("deleteSuccess")).toBeInTheDocument();
  });
  it("offers an explicit retry when resolving saved wardrobe IDs fails", () => {
    state.resolutionError = true;
    render(
      <AvatarWorkspace initialIds={["22222222-2222-4222-8222-222222222222"]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "retry" }));
    expect(state.retryItems).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "saveOutfit" })).toBeDisabled();
  });
  it("keeps an explicit PNG download link and preview after preparing an export", async () => {
    render(<AvatarWorkspace initialIds={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "export" }));
    expect(await screen.findByRole("link", { name: "export" })).toHaveAttribute(
      "href",
      "blob:avatar-export",
    );
    expect(screen.getByRole("link", { name: "export" })).toHaveAttribute(
      "download",
      expect.stringMatching(/^dada-3d-.*\.png$/),
    );
    expect(screen.getByAltText("export")).toHaveAttribute(
      "src",
      "blob:avatar-export",
    );
    expect(state.save).not.toHaveBeenCalled();
  });
  it("does not advertise an unsupported dress layer on the male asset", () => {
    render(<AvatarWorkspace initialIds={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "sampleMode" }));
    fireEvent.click(screen.getByRole("button", { name: "modelMale" }));
    expect(screen.getByRole("checkbox", { name: "showDress" })).toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: "showDress" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "chooseItem Pink dress" }),
    ).toBeDisabled();
    expect(screen.getByTestId("avatar-scene")).toHaveAttribute(
      "data-dress",
      "false",
    );
    expect(screen.getByText("maleDressNotice")).toBeInTheDocument();
  });
  it("keeps a selected real dress on a model that can display it", () => {
    render(<AvatarWorkspace initialIds={[ids[2]]} />);
    expect(screen.getByRole("button", { name: "modelMale" })).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "removeItem Pink dress" }),
    );
    expect(screen.getByRole("button", { name: "modelMale" })).toBeEnabled();
  });
  it("opens a preset model without creating outfits or sending photos", () => {
    render(<AvatarWorkspace initialIds={[]} />);
    expect(screen.getByTestId("avatar-scene")).toBeInTheDocument();
    expect(state.save).not.toHaveBeenCalled();
    expect(state.bookmark).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "saveOutfit" })).toBeDisabled();
  });
  it("uses real garment slots and creates an accurate photo try-on link", () => {
    render(<AvatarWorkspace initialIds={[ids[0], ids[1]]} />);
    expect(screen.getByRole("link", { name: "tryOn" })).toHaveAttribute(
      "href",
      expect.stringContaining(encodeURIComponent(ids[0])),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "chooseItem Pink dress" }),
    );
    const selection = screen.getByRole("region", { name: "chosenCount 1" });
    expect(
      within(selection).queryByRole("button", { name: "removeItem Blue tee" }),
    ).not.toBeInTheDocument();
    expect(
      within(selection).getByRole("button", { name: "removeItem Pink dress" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("avatar-scene")).toHaveAttribute(
      "data-dress",
      "true",
    );
  });
  it("changes gender and visual preset without claiming an AI photo reconstruction", () => {
    render(<AvatarWorkspace initialIds={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "sampleMode" }));
    fireEvent.click(screen.getByRole("button", { name: "modelMale" }));
    fireEvent.click(screen.getByRole("button", { name: "presetStreet" }));
    expect(
      screen.getByTestId("avatar-scene").getAttribute("data-config"),
    ).toContain('"model":"male"');
    expect(screen.getByText("reconstructionNotice")).toBeInTheDocument();
    expect(state.save).not.toHaveBeenCalled();
  });
  it("requires a valid date before explicitly saving an account outfit", async () => {
    render(<AvatarWorkspace initialIds={[ids[0], ids[1]]} />);
    fireEvent.change(screen.getByLabelText("nameLabel"), {
      target: { value: "Weekend" },
    });
    fireEvent.change(screen.getByLabelText("dateLabel"), {
      target: { value: "" },
    });
    expect(screen.getByRole("button", { name: "saveOutfit" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("dateLabel"), {
      target: { value: "2026-10-18" },
    });
    fireEvent.click(screen.getByRole("button", { name: "saveOutfit" }));
    await waitFor(() =>
      expect(state.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Weekend",
          scheduledFor: "2026-10-18",
          items: expect.arrayContaining([
            expect.objectContaining({ id: ids[0] }),
          ]),
        }),
      ),
    );
    expect(await screen.findByText("outfitSaved")).toBeInTheDocument();
  });
  it("never silently drops an unavailable seeded garment to save a different outfit", () => {
    render(
      <AvatarWorkspace
        initialIds={[ids[0], "22222222-2222-4222-8222-222222222222"]}
      />,
    );
    expect(screen.getByText("invalidSelection")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "saveOutfit" })).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "chooseItem Pink dress" }),
    );
    expect(screen.getByText("invalidSelection")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "removeItem 22222222" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "saveOutfit" })).toBeDisabled();
  });
  it("keeps the loaded model usable after a PNG export error", () => {
    render(<AvatarWorkspace initialIds={[]} />);
    act(() => state.sceneError("export"));
    expect(screen.queryByText("modelError")).not.toBeInTheDocument();
    expect(screen.getByText("exportError")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "export" })).toBeEnabled();
  });
  it("blocks an incompatible dress and top from a seeded URL", () => {
    render(<AvatarWorkspace initialIds={[ids[0], ids[2]]} />);
    expect(screen.getByText("invalidSelection")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "saveOutfit" })).toBeDisabled();
  });
  it("can return from a category to all real wardrobe items", () => {
    render(<AvatarWorkspace initialIds={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "dresses" }));
    expect(
      screen.queryByRole("button", { name: "chooseItem Blue tee" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "all" }));
    expect(
      screen.getByRole("button", { name: "chooseItem Blue tee" }),
    ).toBeInTheDocument();
  });
  it("keeps a local 3D bookmark separate from a cloud outfit and from personal photos", () => {
    render(<AvatarWorkspace initialIds={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "bookmark" }));
    expect(state.bookmark).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ model: "female" }),
        itemIds: [],
      }),
    );
    expect(state.save).not.toHaveBeenCalled();
  });
});
