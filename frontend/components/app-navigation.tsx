"use client";

import Link from "next/link";
import Image from "next/image";
import { NavLink } from "@mantine/core";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { BRAND_LOGO_URL } from "@/lib/brand";
import {
  Home,
  Shirt,
  Sparkles,
  Layers,
  LayoutGrid,
  History,
  BarChart3,
  Brain,
  Settings,
  Users,
  Bell,
  HeartHandshake,
  Compass,
} from "lucide-react";

export const appNavigation = [
  { key: "dashboard", href: "/dashboard", icon: Home },
  { key: "wardrobe", href: "/dashboard/wardrobe", icon: Shirt },
  { key: "suggestOutfit", href: "/dashboard/suggest", icon: Sparkles },
  { key: "outfits", href: "/dashboard/outfits", icon: LayoutGrid },
  { key: "inspiration", href: "/dashboard/inspiration", icon: Compass },
  { key: "pairings", href: "/dashboard/pairings", icon: Layers },
  { key: "history", href: "/dashboard/history", icon: History },
  { key: "familyFeed", href: "/dashboard/family/feed", icon: HeartHandshake },
  { key: "analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { key: "aiLearning", href: "/dashboard/learning", icon: Brain },
] as const;
export const settingsNavigation = [
  { key: "family", href: "/dashboard/family", icon: Users },
  { key: "notifications", href: "/dashboard/notifications", icon: Bell },
  { key: "settings", href: "/dashboard/settings", icon: Settings },
] as const;

export function currentNavigation(pathname: string) {
  return [...appNavigation, ...settingsNavigation]
    .filter(
      (item) =>
        pathname === item.href ||
        (item.href !== "/dashboard" && pathname.startsWith(item.href + "/")),
    )
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export function BrandLink({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("nav");
  return (
    <Link href="/dashboard" className="app-brand" onClick={onNavigate}>
      <span className="app-brand-mark" aria-hidden="true">
        <Image src={BRAND_LOGO_URL} alt="" width={34} height={34} priority />
      </span>
      <span>{t("brandName")}</span>
    </Link>
  );
}

export function AppNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const active = currentNavigation(pathname)?.href;
  const renderLinks = (
    items: readonly (
      (typeof appNavigation)[number] | (typeof settingsNavigation)[number]
    )[],
  ) =>
    items.map((item) => (
      <NavLink
        key={item.href}
        component={Link}
        href={item.href}
        label={t(item.key)}
        leftSection={
          <span className="app-nav-icon" aria-hidden="true">
            <item.icon />
          </span>
        }
        active={active === item.href}
        aria-current={active === item.href ? "page" : undefined}
        className="app-nav-link"
        variant="subtle"
        onClick={onNavigate}
      />
    ));
  return (
    <nav className="app-navigation" aria-label={t("brandName")}>
      <div className="app-nav-group">
        {renderLinks(appNavigation.slice(0, 5))}
      </div>
      <div className="app-nav-group">{renderLinks(appNavigation.slice(5))}</div>
      <div className="app-nav-footer">
        <div className="app-nav-section">{t("settingsSection")}</div>
        {renderLinks(settingsNavigation)}
      </div>
    </nav>
  );
}
