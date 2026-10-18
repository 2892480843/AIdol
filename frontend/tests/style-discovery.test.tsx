/* eslint-disable @next/next/no-img-element -- Next Image is a DOM image in these interaction tests. */
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StyleDiscovery } from "@/components/looks/style-discovery";
import { LookSwitcher } from "@/components/looks/look-switcher";

const navigation = vi.hoisted(() => ({ query: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace }),
  usePathname: () => "/dashboard/looks",
  useSearchParams: () => new URLSearchParams(navigation.query),
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
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const labels: Record<string, string> = {
      all: "All styles",
      searchLabel: "Search styles",
      reset: "Reset filters",
      clearSearch: "Clear search",
      preview: "Preview look",
      previewTitle: "Look preview",
      close: "Close preview",
      filtersLabel: "Style filters",
      allTitle: "Your next look",
      allDescription: "Explore full looks",
      practice: "Try this exercise",
      "styles.street.name": "Street utility",
      "styles.sport.name": "Sporty casual",
      "styles.cityboy.name": "Cityboy",
      "styles.clean.name": "Clean fit",
      "styles.retro.name": "Vintage prep",
      "styles.french.name": "French relaxed",
      "styles.street.keywords": "cargo utility bomber",
      "styles.clean.keywords": "simple neutral",
      "lookNames.casual": "White tee",
      "lookNames.office": "Blue office shirt",
      "lookNames.layer": "Knit vest",
      "lookNames.outer": "Olive layers",
      "lookNames.streetBomber": "Blue bomber",
      "lookNames.streetShell": "Technical shell",
      "lookNames.sportTrack": "Green tracksuit",
      "lookNames.sportZip": "Zip sweatshirt",
      "lookNames.retroArgyle": "Argyle prep",
      "lookNames.retroLeather": "Leather prep",
      "lookNames.frenchStripe": "Breton stripes",
      "lookNames.frenchBlouse": "Soft blouse",
      "switcher.position": "{current} / {total}",
      "switcher.next": "Next look",
      "switcher.previous": "Previous look",
      "switcher.compare": "Compare two looks",
      "switcher.compareWith": "Compare with",
      "switcher.select": "Select look {index}",
      count: "{count} looks",
      styleCount: "{count} styles",
    };
    return (labels[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) =>
      String(values?.[name] ?? name),
    );
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  navigation.query = "";
});

describe("style discovery", () => {
  it("shows six real style choices, twelve demonstrations and a clearly labelled default feature", () => {
    render(<StyleDiscovery />);
    expect(
      screen
        .getByRole("group", { name: "Style filters" })
        .querySelectorAll("button"),
    ).toHaveLength(7);
    expect(screen.getByRole("button", { name: "All styles" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("12 looks")).toBeInTheDocument();
    expect(screen.getByText("6 styles")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Your next look" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: "Blue bomber" })).toHaveLength(2);
    expect(screen.getByText("modelNotice")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /^Preview look:/ }),
    ).toHaveLength(12);
    expect(
      screen.getByRole("link", { name: "Try this exercise" }),
    ).toHaveAttribute("href", "/dashboard/inspiration?formula=balance");
  });

  it("filters immediately and writes a shareable category without dropping other URL parameters", () => {
    navigation.query = "from=home";
    render(<StyleDiscovery />);
    fireEvent.click(screen.getByRole("button", { name: "Sporty casual" }));
    expect(screen.getByText("2 looks")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /^Preview look:/ }),
    ).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Preview look: Blue bomber" }),
    ).not.toBeInTheDocument();
    expect(navigation.replace).toHaveBeenLastCalledWith(
      "/dashboard/looks?from=home&style=sport",
      { scroll: false },
    );
    expect(
      screen.getByRole("link", { name: "Try this exercise" }),
    ).toHaveAttribute("href", "/dashboard/inspiration?formula=balance");
  });

  it("keeps an opened category preview when its own delayed URL confirmation arrives", async () => {
    const { rerender } = render(<StyleDiscovery />);
    fireEvent.click(screen.getByRole("button", { name: "Sporty casual" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Preview look: Green tracksuit" }),
    );
    const dialog = await screen.findByRole("dialog");
    navigation.query = "style=sport";
    rerender(<StyleDiscovery />);
    expect(
      within(dialog).getByRole("img", { name: "Green tracksuit" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("searches localized names and keywords, shows no-result recovery, and resets the actual controls", () => {
    render(<StyleDiscovery />);
    const search = screen.getByRole("textbox", { name: "Search styles" });
    fireEvent.change(search, { target: { value: "cargo" } });
    expect(screen.getByText("2 looks")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clean fit" }));
    expect(screen.getByText("0 looks")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "emptyTitle" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Try this exercise" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(search).toHaveValue("");
    expect(screen.getByRole("button", { name: "All styles" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("12 looks")).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "Soft blouse" } });
    expect(screen.getByText("1 looks")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByText("12 looks")).toBeInTheDocument();
  });

  it("restores category URLs, treats unknown values as all, and follows later navigation", () => {
    navigation.query = "style=french";
    const { rerender } = render(<StyleDiscovery />);
    expect(
      screen.getByRole("button", { name: "French relaxed" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("2 looks")).toBeInTheDocument();
    navigation.query = "style=unsupported";
    rerender(<StyleDiscovery />);
    expect(screen.getByRole("button", { name: "All styles" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("12 looks")).toBeInTheDocument();
  });

  it("opens the clicked look, switches only within the filtered list, and restores focus on Escape without AI", async () => {
    navigation.query = "style=street";
    render(<StyleDiscovery />);
    const trigger = screen.getByRole("button", {
      name: "Preview look: Technical shell",
    });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: /Look preview/ });
    expect(within(dialog).getByText("Technical shell")).toBeInTheDocument();
    expect(within(dialog).getByText("2 / 2")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Next look" }));
    expect(within(dialog).getByText("Blue bomber")).toBeInTheDocument();
    expect(within(dialog).getByText("1 / 2")).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Compare two looks" }),
    );
    expect(within(dialog).getAllByRole("img")).toHaveLength(2);
    expect(
      within(dialog).queryByRole("img", { name: "White tee" }),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(
      within(dialog).getByRole("button", { name: "Close preview" }),
      { key: "Escape", code: "Escape" },
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("closes a preview when its search or category scope changes", async () => {
    const { rerender } = render(<StyleDiscovery />);
    fireEvent.click(
      screen.getByRole("button", { name: "Preview look: Blue bomber" }),
    );
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    navigation.query = "style=retro";
    rerender(<StyleDiscovery />);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Preview look: Argyle prep" }),
    );
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search styles"), {
      target: { value: "not found" },
    });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});

describe("shared look switcher", () => {
  const looks = [
    { id: "first", name: "First photo", src: "/first.jpg" },
    { id: "second", name: "Second photo", src: "/second.jpg" },
  ];
  it("accepts an initial look without changing the default used by existing consumers", () => {
    const { rerender } = render(
      <LookSwitcher looks={looks} initialLookId="second" />,
    );
    expect(
      screen.getByRole("img", { name: "Second photo" }),
    ).toBeInTheDocument();
    rerender(<LookSwitcher key="default" looks={looks} />);
    expect(
      screen.getByRole("img", { name: "First photo" }),
    ).toBeInTheDocument();
  });
});
