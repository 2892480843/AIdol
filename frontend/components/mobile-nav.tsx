"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Shirt, Sparkles, LayoutGrid, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export function MobileNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  const navigation = [
    { name: t("dashboard"), href: "/dashboard", icon: Home },
    { name: t("wardrobe"), href: "/dashboard/wardrobe", icon: Shirt },
    { name: t("suggest"), href: "/dashboard/suggest", icon: Sparkles },
    { name: t("outfits"), href: "/dashboard/outfits", icon: LayoutGrid },
    { name: t("settings"), href: "/dashboard/settings", icon: Settings },
  ];

  return (
    <nav className="mobile-bottom-nav" aria-label={t("brandName")}>
      <div className="mobile-bottom-nav-inner">
        {navigation.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.name}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "mobile-nav-link",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <item.icon className="h-5 w-5" aria-hidden="true" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
