import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "@/app/dashboard/page";
import {
  CarePanel,
  OverviewMetrics,
  PendingLooksPanel,
  WeatherPanel,
  FamilyPanel,
} from "@/components/dashboard/dashboard-widgets";
import type { AnalyticsData } from "@/lib/hooks/use-analytics";
import type { TaggingProgress } from "@/lib/types";
import { ApiError } from "@/lib/api";

const mocks = vi.hoisted(() => ({
  items: vi.fn(),
  outfits: vi.fn(),
  analytics: vi.fn(),
  weather: vi.fn(),
  family: vi.fn(),
  retry: vi.fn(),
  accept: vi.fn(),
  reject: vi.fn(),
}));
vi.mock("next/image", () => ({
  default: ({ fill, priority, ...props }: Record<string, unknown>) => (
    <img {...props} />
  ),
}));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useFormatter: () => ({
    number: String,
    list: (items: string[]) => items.join(", "),
  }),
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key;
    t.has = () => true;
    return t;
  },
}));
vi.mock("@/lib/hooks/use-items", () => ({
  useItems: mocks.items,
  useTaggingProgress: () => ({
    data: { processing: 0, failed: 0 },
    isLoading: false,
    isError: false,
    refetch: mocks.retry,
  }),
}));
vi.mock("@/lib/hooks/use-analytics", () => ({ useAnalytics: mocks.analytics }));
vi.mock("@/lib/hooks/use-outfits", () => ({
  useOutfits: mocks.outfits,
  useAcceptOutfit: () => ({ mutateAsync: mocks.accept, isPending: false }),
  useRejectOutfit: () => ({ mutateAsync: mocks.reject, isPending: false }),
}));
vi.mock("@/lib/hooks/use-weather", () => ({ useWeather: mocks.weather }));
vi.mock("@/lib/hooks/use-preferences", () => ({
  usePreferences: () => ({ data: {} }),
}));
vi.mock("@/lib/hooks/use-notifications", () => ({
  useSchedules: () => ({ data: [], isLoading: false, isError: false }),
  useNotificationSettings: () => ({
    data: [],
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/lib/hooks/use-family", () => ({
  useFamily: mocks.family,
}));
vi.mock("@/lib/hooks/use-user", () => ({ useUserTimezone: () => "UTC" }));
vi.mock("@/lib/hooks/use-translated-constants", () => ({
  useTypeLabel: () => (s: string) => s,
  useColorLabel: () => (s: string) => s,
  useStyleLabel: () => (s: string) => s,
  useOccasionLabel: () => (s: string) => s,
  useWeatherConditionLabel: () => (s: string) => s,
}));

function analytics(rate: number | null = 0): AnalyticsData {
  return {
    wardrobe: {
      total_items: 999,
      total_outfits: 12,
      outfits_this_week: 3,
      outfits_this_month: 12,
      acceptance_rate: rate,
      average_rating: null,
      total_wears: 30,
      items_by_status: { ready: 999 },
    },
    color_distribution: [],
    type_distribution: [],
    never_worn: [],
    most_worn: [],
    least_worn: [],
    acceptance_trend: [],
    insights: [],
  };
}
const query = (data: unknown, isError = false) => ({
  data,
  isLoading: false,
  isError,
  refetch: mocks.retry,
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.items.mockReturnValue(query({ items: [], total: 7 }));
  mocks.outfits.mockReturnValue(query({ outfits: [], total: 0 }));
  mocks.analytics.mockReturnValue(query(analytics()));
  mocks.family.mockReturnValue(query(null));
  mocks.weather.mockReturnValue({
    ...query(undefined, true),
    error: new ApiError("not configured", 400, undefined),
  });
  mocks.accept.mockResolvedValue({});
  mocks.reject.mockResolvedValue({});
});

describe("dashboard real data composition", () => {
  it("loads bounded active inventories and a server-side washing count", () => {
    render(<DashboardPage />);
    expect(mocks.items).toHaveBeenCalledWith(
      { is_archived: false, sort_by: "created_at", sort_order: "desc" },
      1,
      6,
    );
    expect(mocks.items).toHaveBeenCalledWith(
      { is_archived: false, sort_by: "wear_count", sort_order: "asc" },
      1,
      4,
    );
    expect(mocks.items).toHaveBeenCalledWith(
      { is_archived: false, needs_wash: true },
      1,
      1,
    );
    expect(mocks.outfits).toHaveBeenCalledWith(
      {
        status: "pending",
        source: "scheduled,on_demand",
        is_lookbook: false,
        worn: false,
      },
      1,
      2,
    );
    expect(screen.getByRole("link", { name: /favorites/ })).toHaveAttribute(
      "href",
      "/dashboard/wardrobe?favorite=true",
    );
    expect(screen.getByRole("link", { name: /wornHistory/ })).toHaveAttribute(
      "href",
      "/dashboard/outfits?filter=worn",
    );
  });

  it("uses active inventory total rather than archived analytics total and preserves zero percent", () => {
    render(
      <OverviewMetrics
        inventory={7}
        inventoryLoading={false}
        inventoryError={false}
        analytics={analytics(0)}
        analyticsLoading={false}
        analyticsError={false}
      />,
    );
    expect(
      within(
        screen.getByRole("link", { name: /overview.inventory/ }),
      ).getByText("7"),
    ).toBeInTheDocument();
    expect(screen.queryByText("999")).not.toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("link", { name: /overview.last7Days/ }),
      ).getByText("3"),
    ).toBeInTheDocument();
  });

  it("keeps null and failed metrics distinct from real zero even when stale data exists", () => {
    const { rerender } = render(
      <OverviewMetrics
        inventory={0}
        inventoryLoading={false}
        inventoryError={false}
        analytics={analytics(null)}
        analyticsLoading={false}
        analyticsError={false}
      />,
    );
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    rerender(
      <OverviewMetrics
        inventory={7}
        inventoryLoading={false}
        inventoryError={true}
        analytics={analytics(90)}
        analyticsLoading={false}
        analyticsError={true}
      />,
    );
    expect(screen.queryByText("7")).not.toBeInTheDocument();
    expect(screen.queryByText("90%")).not.toBeInTheDocument();
    expect(screen.getAllByText("overview.noValue")).toHaveLength(4);
  });
});

describe("pending suggestions", () => {
  it("uses a generated outfit title when the optional name is empty", () => {
    mocks.outfits.mockReturnValue(
      query({
        outfits: [
          {
            id: "generated",
            name: null,
            reasoning: "Retro polka dot dress",
            occasion: "casual",
            scheduled_for: "2026-10-17",
            items: [],
          },
        ],
        total: 1,
      }),
    );
    render(<PendingLooksPanel />);
    expect(
      screen.getByRole("heading", { name: "Retro polka dot dress" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "overview.viewOutfit: Retro polka dot dress",
      }),
    ).toHaveAttribute("href", "/dashboard/outfits/generated");
  });
  it("shows a useful empty state without fabricating outfit cards", () => {
    render(<PendingLooksPanel />);
    expect(screen.getByText("overview.pendingEmptyTitle")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /overview.acceptLabel/ }),
    ).not.toBeInTheDocument();
  });
  it("offers retry instead of empty success when the query failed", () => {
    mocks.outfits.mockReturnValue(query(undefined, true));
    render(<PendingLooksPanel />);
    expect(
      screen.queryByText("overview.pendingEmptyTitle"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "refresh" }));
    expect(mocks.retry).toHaveBeenCalledOnce();
  });
  it("shows at most two genuine previews with correct detail and decision actions", async () => {
    mocks.outfits.mockReturnValue(
      query({
        outfits: ["a", "b", "c"].map((id) => ({
          id,
          name: `Look ${id}`,
          occasion: "casual",
          scheduled_for: "2026-10-17",
          items: [
            {
              id: `item-${id}`,
              type: "shirt",
              name: `Shirt ${id}`,
              thumbnail_url: `/image-${id}.jpg`,
            },
          ],
        })),
        total: 13,
      }),
    );
    render(<PendingLooksPanel />);
    expect(screen.getByText("13")).toBeInTheDocument();
    expect(screen.queryByText("Look c")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /overview.viewOutfit: Look [ab]/ }),
    ).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: "overview.viewOutfit: Look a" }),
    ).toHaveAttribute("href", "/dashboard/outfits/a");
    fireEvent.click(
      screen.getByRole("button", { name: "overview.acceptLabel: Look a" }),
    );
    await waitFor(() => expect(mocks.accept).toHaveBeenCalledWith("a"));
    fireEvent.click(
      screen.getByRole("button", {
        name: "pendingOutfits.dismissLabel: Look b",
      }),
    );
    await waitFor(() => expect(mocks.reject).toHaveBeenCalledWith("b"));
  });
});

describe("care and weather state accuracy", () => {
  it("shows real wash and processing counts and a valid wash deep link", () => {
    render(
      <CarePanel
        washingTotal={24}
        washingLoading={false}
        washingError={false}
        onRetryWashing={mocks.retry}
        tagging={{ processing: 7, failed: 2 } as TaggingProgress}
        taggingLoading={false}
        taggingError={false}
        onRetryTagging={mocks.retry}
      />,
    );
    expect(screen.getByText('washCount:{"count":24}')).toBeInTheDocument();
    expect(screen.getByText('processingCount:{"count":7}')).toBeInTheDocument();
    expect(screen.getByText('failedCount:{"count":2}')).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /washTitle/ })).toHaveAttribute(
      "href",
      "/dashboard/wardrobe?needsWash=true",
    );
  });
  it("never calls failed loads healthy empty states", () => {
    render(
      <CarePanel
        washingTotal={0}
        washingLoading={false}
        washingError={true}
        onRetryWashing={mocks.retry}
        tagging={{ processing: 0, failed: 0 } as TaggingProgress}
        taggingLoading={false}
        taggingError={true}
        onRetryTagging={mocks.retry}
      />,
    );
    expect(screen.queryByText("washClear")).not.toBeInTheDocument();
    expect(screen.queryByText("taggingClear")).not.toBeInTheDocument();
    expect(screen.getAllByText("dataError")).toHaveLength(2);
  });
  it("distinguishes missing location from a weather outage", () => {
    const { rerender } = render(<WeatherPanel />);
    expect(
      screen.getByRole("link", { name: /weather.setLocation/ }),
    ).toHaveAttribute("href", "/dashboard/settings#settings-location");
    mocks.weather.mockReturnValue({
      ...query(undefined, true),
      error: new ApiError("upstream unavailable", 503, undefined),
    });
    rerender(<WeatherPanel />);
    expect(screen.getByText("overview.weatherUnavailable")).toBeInTheDocument();
    expect(
      screen.queryByText("weather.locationNotSet"),
    ).not.toBeInTheDocument();
  });
});

describe("optional family integration", () => {
  it("hides missing-family state but offers retry for service errors", () => {
    mocks.family.mockReturnValue({
      ...query(undefined, true),
      error: new ApiError("missing family", 404, undefined),
    });
    const { rerender } = render(<FamilyPanel />);
    expect(screen.queryByText("familyFeed.title")).not.toBeInTheDocument();
    mocks.family.mockReturnValue({
      ...query(undefined, true),
      error: new ApiError("unavailable", 503, undefined),
    });
    rerender(<FamilyPanel />);
    expect(screen.getByText("familyFeed.title")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "refresh" }));
    expect(mocks.retry).toHaveBeenCalledOnce();
  });
});
