import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PhotoRack } from "@/components/wardrobe-3d/photo-rack";
import type { Item } from "@/lib/types";
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { name: string }) =>
    key + (values?.name ? ` ${values.name}` : ""),
}));
vi.mock("@/components/wardrobe-3d/item-photo", () => ({
  RackItemPhoto: ({ name }: { name: string }) => <span>{name}</span>,
}));
describe("authentic garment photo rail", () => {
  it("centers the current garment and makes neighboring actual photos selectable", () => {
    const items = [1, 2, 3].map(
      (id) => ({ id: String(id), name: `Garment ${id}` }) as Item,
    );
    const select = vi.fn();
    render(
      <PhotoRack
        items={items}
        selectedId="2"
        name={(item) => item.name!}
        onSelect={select}
      />,
    );
    expect(
      screen.getByRole("button", { name: "photoRailChoose Garment 2" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      screen.getByRole("button", { name: "photoRailChoose Garment 3" }),
    );
    expect(select).toHaveBeenCalledWith("3");
    expect(screen.getByText("photoRailNotice")).toBeInTheDocument();
  });
});
