import Image from "next/image";
import type { ReactNode } from "react";
import { BrandLink } from "@/components/app-navigation";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { BRAND_NAME, BRAND_LOGO_URL } from "@/lib/brand";

export function AuthFrame({
  title,
  subtitle,
  caption,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  caption: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="auth-layout">
      <section className="auth-visual" aria-hidden="true">
        <Image
          src="/images/wardrobe-editorial.webp"
          alt=""
          fill
          priority
          sizes="(min-width: 768px) 50vw, 100vw"
        />
        <div className="auth-visual-overlay">
          <div className="flex items-center gap-3 text-2xl font-bold tracking-tight text-[#193c2d]">
            <Image
              src={BRAND_LOGO_URL}
              alt=""
              width={34}
              height={34}
              priority
            />
            <span>{BRAND_NAME}</span>
          </div>
          <p className="auth-visual-caption">{caption}</p>
        </div>
      </section>
      <section className="auth-content">
        <div className="auth-form">
          <div className="mb-10 flex items-center justify-between gap-4">
            <BrandLink />
            <LocaleSwitcher />
          </div>
          <h1 className="auth-title">{title}</h1>
          {subtitle && (
            <p className="mb-8 mt-3 text-sm leading-7 text-muted-foreground">
              {subtitle}
            </p>
          )}
          {children}
        </div>
      </section>
    </main>
  );
}
