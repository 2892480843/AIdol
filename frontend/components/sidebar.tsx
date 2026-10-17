"use client";

import { AppNavigation, BrandLink } from "@/components/app-navigation";

export function Sidebar() {
  return (
    <aside className="app-sidebar" data-ui="sidebar">
      <div className="app-sidebar-inner">
        <BrandLink />
        <AppNavigation />
      </div>
    </aside>
  );
}
