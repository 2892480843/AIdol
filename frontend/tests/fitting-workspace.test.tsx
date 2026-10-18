/* eslint-disable @next/next/no-img-element -- Test the real image states with DOM images. */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FittingRoomWorkspace } from "@/components/fitting-room/workspace";
import type { Item } from "@/lib/types";
import dashboardMessages from "@/messages/zh-CN/dashboard.json";
const state = vi.hoisted(() => ({
  owner: "owner-one",
  create: vi.fn(),
  tasks: [] as unknown[],
  items: [] as Item[],
  isCreating: false,
  cameraStream: null as MediaStream | null,
  cameraStop: vi.fn(),
  transcript: undefined as undefined | ((value: string) => void),
}));
vi.mock("next-intl", async () => {
  const { default: messages } = await import("@/messages/zh-CN/dashboard.json");
  return {
    useLocale: () => "zh-CN",
    useTranslations:
      (namespace: string) =>
      (key: string, values?: Record<string, unknown>) => {
        if (namespace === "dashboard.looks.tryon") {
          const catalog = messages.looks.tryon as Record<string, string>;
          return catalog[key] ?? `${namespace}.${key}`;
        }
        return key + (values?.name ? ` ${values.name}` : "");
      },
  };
});
vi.mock("next/image", () => ({
  default: ({ fill, unoptimized, ...props }: Record<string, unknown>) => (
    <img alt="" {...props} />
  ),
}));
vi.mock("@/lib/looks/use-owner-scope", () => ({
  useLooksOwnerScope: () => ({ ownerId: state.owner, epoch: 0 }),
}));
vi.mock("@/lib/hooks/use-wardrobe-3d", () => ({
  useWardrobe3D: () => ({
    owner: state.owner,
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
      item: state.items.find((i) => i.id === id),
      state: "ready",
    })),
    isLoading: false,
    hasErrors: false,
    retry: vi.fn(),
  }),
}));
vi.mock("@/lib/hooks/use-translated-constants", () => ({
  useTypeLabel: () => (type: string) => type,
}));
vi.mock("@/lib/hooks/use-fitting-media", () => ({
  useFittingCamera: () => ({
    stream: state.cameraStream,
    pending: false,
    error: false,
    start: vi.fn(),
    stop: () => {
      state.cameraStop();
      state.cameraStream = null;
    },
    capture: vi.fn(),
  }),
  useFittingVoice: (callback: (value: string) => void) => {
    state.transcript = callback;
    return {
      supported: true,
      listening: false,
      error: false,
      start: vi.fn(),
      stop: vi.fn(),
    };
  },
}));
vi.mock("@/lib/looks/photo", () => ({
  validateLookPhoto: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/hooks/use-tryon", () => ({
  useTryOn: () => ({
    capabilities: {
      available: true,
      configured: true,
      enabled: true,
      provider: "seedream",
      model: "test",
      max_items: 4,
      supported_item_types: ["t-shirt", "pants", "dress", "coat"],
      supported_categories: [
        "tops",
        "bottoms",
        "dresses",
        "outerwear",
        "shoes",
      ],
      accepted_mime_types: ["image/png"],
      max_person_image_bytes: 10485760,
    },
    tasks: state.tasks,
    isCreating: state.isCreating,
    isLoadingCapabilities: false,
    isLoadingTasks: false,
    create: state.create,
    refetchCapabilities: vi.fn(),
    refetchTasks: vi.fn(),
  }),
}));
const ids = [1, 2, 3, 4].map(
  (n) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`,
);
beforeEach(() => {
  vi.clearAllMocks();
  state.owner = "owner-one";
  state.tasks = [];
  state.isCreating = false;
  state.cameraStream = null;
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  state.items = ["t-shirt", "pants", "dress", "coat"].map(
    (type, i) =>
      ({
        id: ids[i],
        type,
        user_id: "owner-one",
        name: ["Blue tee", "Denim", "Yellow dress", "Red coat"][i],
        status: "ready",
        is_archived: false,
        needs_wash: false,
        colors: ["blue", "blue", "yellow", "red"][i]
          ? [["blue", "blue", "yellow", "red"][i]]
          : [],
        tags: { style: [], season: [], colors: [] },
        image_url: "/private.jpg",
      }) as unknown as Item,
  );
  state.create.mockResolvedValue({
    id: "task-created",
    item_ids: [ids[0]],
    item_id: ids[0],
    status: "processing",
  });
  URL.createObjectURL = vi.fn(() => "blob:person-preview");
  URL.revokeObjectURL = vi.fn();
});
async function photo() {
  fireEvent.change(screen.getByLabelText("upload"), {
    target: { files: [new File(["png"], "person.png", { type: "image/png" })] },
  });
  await screen.findByAltText("photoTab");
}
describe("direct fitting room", () => {
  it("does not claim a command was applied when unresolved saved pieces occupy all slots", () => {
    render(<FittingRoomWorkspace initialIds={["missing-1", "missing-2", "missing-3", "missing-4"]} />);
    fireEvent.change(screen.getByRole("textbox", { name: "commandLabel" }), { target: { value: "黄色连衣裙" } });
    fireEvent.click(screen.getByRole("button", { name: "applyCommand" }));
    expect(screen.getByText("commandCapacity")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "removeItem Yellow dress" })).not.toBeInTheDocument();
    expect(state.create).not.toHaveBeenCalled();
  });
  it("applies final speech locally after consent and supports removal and undo without generating", () => {
    render(<FittingRoomWorkspace initialIds={[ids[0], ids[3]]} />);
    act(() => state.transcript?.("脱掉外套"));
    expect(
      screen.getByRole("button", { name: "removeItem Red coat" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "voiceConsent" }));
    act(() => state.transcript?.("脱掉外套"));
    expect(
      screen.queryByRole("button", { name: "removeItem Red coat" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "removeItem Blue tee" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "undoSelection" }));
    expect(
      screen.getByRole("button", { name: "removeItem Red coat" }),
    ).toBeInTheDocument();
    expect(state.create).not.toHaveBeenCalled();
  });
  it("switches photographic looks without changing garment choices and explicitly reuses an outfit", () => {
    state.tasks = [
      {
        id: "newer",
        item_id: ids[2],
        item_ids: [ids[2]],
        status: "succeeded",
        resultImageUrl: "blob:dress",
      },
      { id: "failed", item_id: ids[1], status: "failed" },
      {
        id: "older",
        item_id: ids[0],
        item_ids: [ids[0], ids[3]],
        status: "succeeded",
        resultImageUrl: "blob:coat",
      },
    ];
    render(<FittingRoomWorkspace initialIds={[ids[1]]} />);
    expect(screen.getByAltText("resultTab")).toHaveAttribute(
      "src",
      "blob:dress",
    );
    fireEvent.click(screen.getByRole("button", { name: "nextLook" }));
    expect(screen.getByAltText("resultTab")).toHaveAttribute(
      "src",
      "blob:coat",
    );
    expect(
      screen.getByRole("button", { name: "removeItem Denim" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "reuseLook" }));
    expect(
      screen.queryByRole("button", { name: "removeItem Denim" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "removeItem Red coat" }),
    ).toBeInTheDocument();
    expect(state.create).not.toHaveBeenCalled();
  });
  it("preserves unresolved seed IDs through manual and command selection until explicitly removed", () => {
    const missing = "22222222-2222-4222-8222-222222222222";
    render(<FittingRoomWorkspace initialIds={[ids[0], missing]} />);
    fireEvent.click(
      screen.getByRole("button", { name: "chooseItem Yellow dress" }),
    );
    expect(screen.getByText("seedError")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "removeItem 22222222" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "commandLabel" }), {
      target: { value: "蓝色t恤" },
    });
    fireEvent.click(screen.getByRole("button", { name: "applyCommand" }));
    expect(screen.getByText("seedError")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "removeItem 22222222" }),
    );
    expect(screen.queryByText("seedError")).not.toBeInTheDocument();
    expect(state.create).not.toHaveBeenCalled();
  });
  it.each([
    ["submitting", "starting"],
    ["queued", "queued"],
    ["processing", "running"],
    ["succeeded", "succeeded"],
    ["failed", "failed"],
  ] as const)(
    "renders the real catalog label for a %s history task",
    (status, messageKey) => {
      state.tasks = [
        { id: "history-status", item_id: ids[0], item_ids: [ids[0]], status },
      ];
      render(<FittingRoomWorkspace initialIds={[]} />);
      const history = screen.getByRole("region", { name: "historyTitle" });
      expect(
        within(history).getByText(dashboardMessages.looks.tryon[messageKey]),
      ).toBeInTheDocument();
      expect(history).not.toHaveTextContent("dashboard.looks.tryon.");
    },
  );
  it("requires photo, an owned garment and unchecked explicit consent before generation", async () => {
    render(<FittingRoomWorkspace initialIds={[ids[0]]} />);
    expect(screen.getByRole("button", { name: "generate" })).toBeDisabled();
    await photo();
    expect(screen.getByRole("button", { name: "generate" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "consent" }));
    expect(screen.getByRole("button", { name: "generate" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "generate" }));
    await waitFor(() =>
      expect(state.create).toHaveBeenCalledWith({
        personPhoto: expect.any(File),
        itemIds: [ids[0]],
        consent: true,
      }),
    );
  });
  it("replaces tops and bottoms with a dress instead of submitting an incompatible outfit", () => {
    render(<FittingRoomWorkspace initialIds={[ids[0], ids[1]]} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "chooseItem Yellow dress",
      }),
    );
    const selected = screen.getByRole("region", { name: "chosenCount" });
    expect(
      within(selected).queryByRole("button", { name: "removeItem Blue tee" }),
    ).not.toBeInTheDocument();
    expect(
      within(selected).getByRole("button", { name: "removeItem Yellow dress" }),
    ).toBeInTheDocument();
  });
  it("keeps command selection separate from generation and preserves choices on no match", () => {
    render(<FittingRoomWorkspace initialIds={[ids[0]]} />);
    fireEvent.change(screen.getByRole("textbox", { name: "commandLabel" }), {
      target: { value: "黄色连衣裙" },
    });
    fireEvent.click(screen.getByRole("button", { name: "applyCommand" }));
    expect(
      screen.getByRole("button", { name: "removeItem Yellow dress" }),
    ).toBeInTheDocument();
    expect(state.create).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "commandLabel" }), {
      target: { value: "zzzz_no_match" },
    });
    fireEvent.click(screen.getByRole("button", { name: "applyCommand" }));
    expect(screen.getByText("commandNoMatch")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "removeItem Yellow dress" }),
    ).toBeInTheDocument();
  });
  it("does not pair a fresh original photo with an unrelated historical result", async () => {
    state.tasks = [
      {
        id: "old",
        item_id: ids[0],
        item_ids: [ids[0]],
        status: "succeeded",
        resultImageUrl: "blob:old",
      },
    ];
    render(<FittingRoomWorkspace initialIds={[ids[0]]} />);
    expect(screen.getByAltText("resultTab")).toHaveAttribute("src", "blob:old");
    await photo();
    expect(screen.getByRole("button", { name: "compareTab" })).toBeDisabled();
  });
  it("does not auto-submit when loading prior tasks or when an account changes", async () => {
    const h = render(<FittingRoomWorkspace initialIds={[ids[0]]} />);
    await photo();
    state.owner = "owner-two";
    state.items = [];
    h.rerender(<FittingRoomWorkspace initialIds={[ids[0]]} />);
    expect(screen.queryByAltText("photoTab")).not.toBeInTheDocument();
    expect(state.create).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:person-preview");
  });
  it("closes the camera before showing and sending a newly uploaded photo", async () => {
    state.cameraStream = { getTracks: () => [] } as unknown as MediaStream;
    render(<FittingRoomWorkspace initialIds={[ids[0]]} />);
    expect(screen.getByRole("button", { name: "generate" })).toBeDisabled();
    await photo();
    expect(state.cameraStop).toHaveBeenCalled();
    expect(screen.getByAltText("photoTab")).toHaveAttribute(
      "src",
      "blob:person-preview",
    );
  });
  it("renders older garments whose tag JSON has no style list", () => {
    state.items[0].tags = {} as Item["tags"];
    render(<FittingRoomWorkspace initialIds={[ids[0]]} />);
    expect(
      screen.getByRole("button", { name: "chooseItem Blue tee" }),
    ).toBeInTheDocument();
  });
  it("enables before-after comparison only for the exact photo used in this generation", async () => {
    const h = render(<FittingRoomWorkspace initialIds={[ids[0]]} />);
    await photo();
    fireEvent.click(screen.getByRole("checkbox", { name: "consent" }));
    fireEvent.click(screen.getByRole("button", { name: "generate" }));
    await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
    await act(async () => {
      await Promise.resolve();
    });
    state.tasks = [
      {
        id: "task-created",
        item_id: ids[0],
        item_ids: [ids[0]],
        status: "succeeded",
        resultImageUrl: "blob:new-result",
      },
    ];
    h.rerender(<FittingRoomWorkspace initialIds={[ids[0]]} />);
    expect(screen.getByRole("button", { name: "compareTab" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "compareTab" }));
    expect(
      screen.getByRole("slider", { name: "compareLabel" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole("slider", { name: "compareLabel" }), {
      target: { value: "80" },
    });
    expect(screen.getByRole("slider", { name: "compareLabel" })).toHaveValue(
      "80",
    );
  });
  it("does not remove the selected garment when applying the same wear command again", () => {
    render(<FittingRoomWorkspace initialIds={[ids[2]]} />);
    fireEvent.change(screen.getByRole("textbox", { name: "commandLabel" }), {
      target: { value: "黄色连衣裙" },
    });
    fireEvent.click(screen.getByRole("button", { name: "applyCommand" }));
    expect(
      screen.getByRole("button", { name: "removeItem Yellow dress" }),
    ).toBeInTheDocument();
    expect(state.create).not.toHaveBeenCalled();
  });
});
