"use client";

import { Menu, Moon, Sun, LogOut } from "lucide-react";
import { useTheme } from "next-themes";
import { signOut } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/hooks/use-auth";
import { useAuthConfig } from "@/lib/hooks/use-auth-config";
import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { usePathname } from "next/navigation";
import { currentNavigation } from "@/components/app-navigation";
import Image from "next/image";
import { BRAND_LOGO_URL } from "@/lib/brand";

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { user } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const pathname = usePathname();
  const current = currentNavigation(pathname);
  const authConfig = useAuthConfig();
  const t = useTranslations("nav");

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  const handleLogout = () => {
    // The proxy session outlives the NextAuth one, so /auth/logout has to end it too or /login
    // would sign the user straight back in. A config that failed to load takes this path as
    // well, because /auth/logout also works without a proxy. The route clears the session
    // cookies itself; a client signOut first would tell every tab, and one of them could sign
    // back in through the still-live proxy session before the proxy logout.
    if (authConfig.data?.forward_auth !== false) {
      window.location.assign("/auth/logout");
      return;
    }
    signOut({ callbackUrl: "/login" });
  };

  const getInitials = (name?: string | null) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <header className="app-header">
      <div className="app-header-context">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="app-mobile-menu"
          onClick={onMenuClick}
          aria-label={t("openSidebar")}
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </Button>
        <div className="app-header-path">
          <span className="app-header-brand">
            <Image
              src={BRAND_LOGO_URL}
              alt=""
              width={26}
              height={26}
              priority
            />
            <span>{t("brandName")}</span>
          </span>
          <span className="app-header-divider" aria-hidden="true" />
          <span className="app-header-current">
            {t(current?.key ?? "dashboard")}
          </span>
        </div>
      </div>
      <div className="app-header-actions">
        <Button
          variant="ghost"
          size="icon"
          className="app-utility-button"
          onClick={toggleTheme}
          aria-label={t("toggleTheme")}
        >
          {resolvedTheme === "dark" ? (
            <Sun className="h-[18px] w-[18px]" aria-hidden="true" />
          ) : (
            <Moon className="h-[18px] w-[18px]" aria-hidden="true" />
          )}
        </Button>
        <LocaleSwitcher />
        <span className="app-account-divider" aria-hidden="true" />
        <Avatar className="h-8 w-8">
          <AvatarImage
            src={user?.avatar_url || ""}
            alt={user?.display_name || ""}
          />
          <AvatarFallback>{getInitials(user?.display_name)}</AvatarFallback>
        </Avatar>
        <span className="app-account-name">
          {user?.display_name || t("userFallback")}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="app-utility-button"
          onClick={handleLogout}
          aria-label={t("signOut")}
        >
          <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
        </Button>
      </div>
    </header>
  );
}
