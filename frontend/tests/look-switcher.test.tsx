import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LookSwitcher } from "@/components/looks/look-switcher";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));
vi.mock("next/image", async (importOriginal) => {
  const original = await importOriginal<typeof import("next/image")>();
  return {
    default: (props: Parameters<typeof original.getImageProps>[0]) => {
      // Keep the real framework validation: invalid fill sizing must fail here too.
      const { props: validated } = original.getImageProps(props);
      const { fill, priority, unoptimized, ...imageProps } = props;
      // eslint-disable-next-line @next/next/no-img-element -- Validate Next image props before native DOM assertions.
      return <img {...imageProps} src={validated.src} alt={props.alt} />;
    },
  };
});

const looks = [
  {
    id: "casual",
    name: "White tee and jeans",
    src: "/model.webp",
    frame: { row: 0 as const, column: 0 as const },
  },
  {
    id: "office",
    name: "Blue shirt and trousers",
    src: "/model.webp",
    frame: { row: 0 as const, column: 1 as const },
  },
  {
    id: "layer",
    name: "A knitted layer",
    src: "/model.webp",
    frame: { row: 1 as const, column: 0 as const },
  },
];

describe("full-look photograph switcher", () => {
  it("changes the whole look with previous, next and direct selection", () => {
    render(<LookSwitcher looks={looks} notice="AI model demonstration" />);
    expect(
      screen.getByRole("img", { name: looks[0].name }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "switcher.next" }));
    expect(
      screen.getByRole("img", { name: looks[1].name }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "switcher.previous" }));
    expect(
      screen.getByRole("img", { name: looks[0].name }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: 'switcher.select:{"index":3}' }),
    );
    expect(
      screen.getByRole("img", { name: looks[2].name }),
    ).toBeInTheDocument();
    expect(screen.getByText("AI model demonstration")).toBeInTheDocument();
  });

  it("supports arrow keys on the gallery without consuming a control's key events", () => {
    render(<LookSwitcher looks={looks} />);
    const gallery = screen.getByRole("group", {
      name: 'switcher.position:{"current":1,"total":3}',
    });
    fireEvent.keyDown(gallery, { key: "ArrowRight" });
    expect(
      screen.getByRole("img", { name: looks[1].name }),
    ).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("button", { name: "switcher.next" }), {
      key: "ArrowLeft",
    });
    expect(
      screen.getByRole("img", { name: looks[1].name }),
    ).toBeInTheDocument();
  });

  it("compares two real look photos and exits comparison explicitly", () => {
    render(<LookSwitcher looks={looks} />);
    fireEvent.click(screen.getByRole("button", { name: "switcher.compare" }));
    expect(screen.getAllByRole("img")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "switcher.compare" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "switcher.compare" }));
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it("shows an honest fallback for a failed photograph and handles removed looks", () => {
    const { rerender } = render(<LookSwitcher looks={looks} />);
    fireEvent.error(screen.getByRole("img", { name: looks[0].name }));
    expect(screen.getByText("switcher.imageUnavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "switcher.next" }));
    rerender(<LookSwitcher looks={[looks[2]]} />);
    expect(
      screen.getByRole("img", { name: looks[2].name }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "switcher.next" }),
    ).toBeDisabled();
  });

  it("keeps the compact homepage version small and renders an empty state", () => {
    const { rerender } = render(<LookSwitcher looks={looks} compact />);
    expect(
      screen.queryByRole("button", { name: "switcher.compare" }),
    ).not.toBeInTheDocument();
    rerender(<LookSwitcher looks={[]} />);
    expect(screen.getByText("switcher.empty")).toBeInTheDocument();
  });
});
