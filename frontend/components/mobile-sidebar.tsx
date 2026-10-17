"use client";

import { Drawer } from "@mantine/core";
import { useTranslations } from "next-intl";
import { AppNavigation, BrandLink } from "@/components/app-navigation";

interface MobileSidebarProps {
  open: boolean;
  onClose: () => void;
}

export function MobileSidebar({ open, onClose }: MobileSidebarProps) {
  const t = useTranslations("nav");
  return (
    <Drawer
      opened={open}
      onClose={onClose}
      title={<BrandLink onNavigate={onClose} />}
      closeButtonProps={{ "aria-label": t("closeSidebar") }}
      size={304}
      position="left"
      zIndex={210}
      classNames={{
        content: "mobile-navigation-panel",
        header: "mobile-navigation-header",
        body: "mobile-navigation-body",
      }}
    >
      <AppNavigation onNavigate={onClose} />
    </Drawer>
  );
}
