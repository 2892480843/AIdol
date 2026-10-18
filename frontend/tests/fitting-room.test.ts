import { describe, expect, it } from "vitest";
import type { Item } from "@/lib/types";
import {
  FITTING_GROUPS,
  fittingGroupForType,
  selectFittingCommand,
  resolveFittingCommand,
  toggleFittingItem,
  toggleFittingItemPreservingUnknown,
} from "@/lib/fitting-room";

const uuid = (n: number) =>
  `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
function item(n: number, type: string, extra: Partial<Item> = {}): Item {
  return {
    id: uuid(n),
    user_id: "owner-a",
    type,
    name: `Item ${n}`,
    status: "ready",
    is_archived: false,
    needs_wash: false,
    primary_color: "blue",
    colors: ["blue"],
    tags: { colors: ["blue"], style: [], season: [] },
    ...extra,
  } as Item;
}
const label = (value: Item) => value.name || value.type;

describe("deterministic fitting selection", () => {
  it("accepts the Traditional Chinese commands shown in the localized help", () => {
    const coat = item(1, "coat");
    expect(resolveFittingCommand("脫掉外套", [coat], label, [coat.id]).action).toBe("remove");
    expect(resolveFittingCommand("復原上一步", [], label, []).action).toBe("undo");
    expect(resolveFittingCommand("清空選擇", [], label, []).action).toBe("clear");
  });
  it("removes only selected matching clothes and never adds a garment from a negative instruction", () => {
    const values = [item(1, "coat"), item(2, "shirt")];
    expect(
      resolveFittingCommand("脱掉外套", values, label, [values[0].id]),
    ).toEqual({ action: "remove", items: [values[0]], ambiguous: false });
    expect(
      resolveFittingCommand("不要穿蓝色上衣", values, label, [values[0].id]),
    ).toEqual({ action: "remove", items: [], ambiguous: false });
    expect(
      resolveFittingCommand("不要蓝色，换成白色", values, label, []),
    ).toEqual({ action: "none", items: [], ambiguous: false });
  });
  it("supports undo and explicit clear without interpreting a vague instruction as clear", () => {
    expect(resolveFittingCommand("撤销上一步", [], label, []).action).toBe(
      "undo",
    );
    expect(resolveFittingCommand("clear selection", [], label, []).action).toBe(
      "clear",
    );
    expect(resolveFittingCommand("不要全部换掉", [], label, []).action).toBe(
      "none",
    );
  });
  it("uses the last chosen slot for a color-only follow-up but explicit categories override it", () => {
    const values = [
      item(1, "dress"),
      item(2, "dress", { colors: ["white"], primary_color: "white" }),
      item(3, "shirt", { colors: ["white"], primary_color: "white" }),
    ];
    expect(
      resolveFittingCommand(
        "how about white?",
        values,
        label,
        [values[0].id],
        "dresses",
      ).items,
    ).toEqual([values[1]]);
    expect(
      resolveFittingCommand(
        "白色上衣",
        values,
        label,
        [values[0].id],
        "dresses",
      ).items,
    ).toEqual([values[2]]);
    expect(
      resolveFittingCommand("白色", values, label, [values[0].id]).ambiguous,
    ).toBe(true);
  });
  it("matches dopamine metadata without guessing style from a garment color", () => {
    const values = [
      item(1, "shirt", {
        tags: { style: ["dopamine"], colors: [], season: [] },
      }),
      item(2, "shirt"),
    ];
    expect(
      resolveFittingCommand("多巴胺上衣", values, label, []).items,
    ).toEqual([values[0]]);
  });
  it("keeps saved unknown IDs within the four-item capacity until the user removes them", () => {
    const values = [item(1, "shirt"), item(2, "dress"), item(3, "shoes")];
    expect(
      toggleFittingItemPreservingUnknown(
        [values[0].id, uuid(99)],
        values[1],
        values,
      ),
    ).toEqual([values[1].id, uuid(99)]);
    const full = [uuid(91), uuid(92), uuid(93), uuid(94)];
    expect(toggleFittingItemPreservingUnknown(full, values[2], values)).toEqual(
      full,
    );
  });
  it("exposes only five supported fitting slots", () => {
    expect(FITTING_GROUPS).toEqual([
      "tops",
      "bottoms",
      "dresses",
      "outerwear",
      "shoes",
    ]);
    expect(fittingGroupForType("T-SHIRT")).toBe("tops");
    expect(fittingGroupForType("cardigan")).toBe("outerwear");
    expect(fittingGroupForType("jumpsuit")).toBe("dresses");
    expect(fittingGroupForType("hat")).toBeNull();
    expect(fittingGroupForType("unknown")).toBeNull();
    expect(fittingGroupForType("suit")).toBeNull();
  });
  it("replaces the same slot and preserves unrelated selected clothes without mutating input", () => {
    const values = [
      item(1, "shirt"),
      item(2, "pants"),
      item(3, "t-shirt"),
      item(4, "coat"),
    ];
    const ids = [values[0].id, values[1].id, values[3].id];
    expect(toggleFittingItem(ids, values[2], values)).toEqual([
      values[1].id,
      values[3].id,
      values[2].id,
    ]);
    expect(ids).toEqual([values[0].id, values[1].id, values[3].id]);
    expect(toggleFittingItem(ids, values[0], values)).toEqual(ids.slice(1));
  });
  it("makes a dress mutually exclusive with separate tops and bottoms in both directions", () => {
    const values = [
      item(1, "shirt"),
      item(2, "pants"),
      item(3, "coat"),
      item(4, "shoes"),
      item(5, "dress"),
    ];
    expect(
      toggleFittingItem(
        values.slice(0, 4).map((q) => q.id),
        values[4],
        values,
      ),
    ).toEqual([values[2].id, values[3].id, values[4].id]);
    expect(
      toggleFittingItem([values[4].id, values[2].id], values[0], values),
    ).toEqual([values[2].id, values[0].id]);
  });
  it("removes stale selections, normalizes duplicate slots and never includes unavailable or foreign injected clothes", () => {
    const values = [
      item(1, "shirt"),
      item(2, "t-shirt"),
      item(3, "pants"),
      item(4, "coat"),
      item(5, "shoes"),
      item(6, "hat"),
      item(7, "dress", { needs_wash: true }),
    ];
    const ids = [
      uuid(99),
      values[0].id,
      values[0].id,
      values[1].id,
      values[2].id,
      values[3].id,
    ];
    expect(toggleFittingItem(ids, values[4], values)).toEqual(
      values.slice(1, 5).map((q) => q.id),
    );
    expect(toggleFittingItem([], values[6], values)).toEqual([]);
    expect(toggleFittingItem([], values[5], values)).toEqual([]);
    expect(toggleFittingItem([], item(88, "shirt"), values)).toEqual([]);
    expect(
      toggleFittingItem([], { ...values[0], user_id: "owner-b" }, values),
    ).toEqual([]);
  });
  it("matches Chinese color and precise category together", () => {
    const values = [
      item(1, "shirt", { primary_color: "white", colors: ["white"] }),
      item(2, "pants", { primary_color: "white" }),
      item(3, "shirt"),
    ];
    expect(selectFittingCommand("帮我换上白色衬衫", values, label)).toEqual({
      items: [values[0]],
      ambiguous: false,
    });
  });
  it("matches English aliases and avoids partial word color matches", () => {
    const values = [
      item(1, "jacket", { primary_color: "gray" }),
      item(2, "shirt", { primary_color: "red" }),
    ];
    expect(
      selectFittingCommand("please select a grey jacket", values, label),
    ).toEqual({ items: [values[0]], ambiguous: false });
    expect(selectFittingCommand("featured", values, label)).toEqual({
      items: [],
      ambiguous: false,
    });
  });
  it("uses the longest color name so burgundy does not also select red", () => {
    const values = [
      item(1, "shirt", { primary_color: "burgundy" }),
      item(2, "shirt", { primary_color: "red" }),
    ];
    expect(selectFittingCommand("酒红色上衣", values, label)).toEqual({
      items: [values[0]],
      ambiguous: false,
    });
  });
  it("uses exact owned names before generic category matches", () => {
    const values = [
      item(1, "shirt", { name: "我的蓝色衬衫" }),
      item(2, "shirt"),
    ];
    expect(selectFittingCommand("换成我的蓝色衬衫", values, label)).toEqual({
      items: [values[0]],
      ambiguous: false,
    });
  });
  it("intersects styles, category and color using real metadata", () => {
    const values = [
      item(1, "pants", {
        primary_color: "black",
        tags: { colors: ["black"], style: ["sporty"], season: [] },
      }),
      item(2, "pants", {
        primary_color: "black",
        tags: { colors: ["black"], style: ["formal"], season: [] },
      }),
    ];
    expect(selectFittingCommand("黑色运动长裤", values, label)).toEqual({
      items: [values[0]],
      ambiguous: false,
    });
    expect(selectFittingCommand("black sporty pants", values, label)).toEqual({
      items: [values[0]],
      ambiguous: false,
    });
  });
  it("returns every tied best candidate for confirmation rather than choosing the first", () => {
    const values = [item(1, "shirt"), item(2, "t-shirt"), item(3, "pants")];
    expect(selectFittingCommand("蓝色上衣", values, label)).toEqual({
      items: values.slice(0, 2),
      ambiguous: true,
    });
  });
  it("never invents a choice for unknown or empty commands and excludes dirty/archived/unsupported clothes", () => {
    const values = [
      item(1, "shirt", { needs_wash: true }),
      item(2, "shirt", { is_archived: true }),
      item(3, "hat"),
      item(4, "shirt", { status: "processing" }),
    ];
    for (const text of ["", "  ", "帮我换一件", "不存在的衣服", "blue shirt"]) {
      expect(selectFittingCommand(text, values, label)).toEqual({
        items: [],
        ambiguous: false,
      });
    }
  });
  it("does not let an unnamed localized type label override an explicit color", () => {
    const values = [
      item(1, "shirt", {
        name: undefined,
        primary_color: "white",
        colors: ["white"],
        tags: { colors: ["white"], style: [], season: [] },
      }),
      item(2, "shirt", { name: undefined }),
    ];
    expect(selectFittingCommand("蓝色衬衫", values, () => "衬衫")).toEqual({
      items: [values[1]],
      ambiguous: false,
    });
  });
  it("prefers the longest exact name and keeps generic top commands inside the top slot", () => {
    const values = [
      item(1, "shirt", { name: "蓝色衬衫" }),
      item(2, "shirt", { name: "衬衫" }),
      item(3, "pants"),
    ];
    expect(selectFittingCommand("换上蓝色衬衫", values, label)).toEqual({
      items: [values[0]],
      ambiguous: false,
    });
    expect(selectFittingCommand("blue top", values, label)).toEqual({
      items: values.slice(0, 2),
      ambiguous: true,
    });
  });
  it("does not mistake the sports shoe category for a required style tag", () => {
    const values = [item(1, "sneakers"), item(2, "boots")];
    expect(selectFittingCommand("运动鞋", values, label)).toEqual({
      items: [values[0]],
      ambiguous: false,
    });
  });
  it("recognizes spoken T shirt and common Chinese skirt words before shorter category aliases", () => {
    const values = [
      item(1, "shirt"),
      item(2, "t-shirt"),
      item(3, "skirt"),
      item(4, "pants"),
    ];
    expect(selectFittingCommand("blue t shirt", values, label)).toEqual({
      items: [values[1]],
      ambiguous: false,
    });
    expect(selectFittingCommand("蓝色裙子", values, label)).toEqual({
      items: [values[2]],
      ambiguous: false,
    });
  });
});
