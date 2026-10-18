"use client";

import { useState } from "react";
import Image from "next/image";
import { Select } from "@mantine/core";
import { ArrowLeft, ArrowRight, Columns2, ImageOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import styles from "./look-switcher.module.css";

export type LookSlide = {
  id: string;
  name: string;
  src: string;
  frame?: { row: 0 | 1; column: 0 | 1 };
};

export function LookPhoto({ look }: { look: LookSlide }) {
  const t = useTranslations("dashboard.looks");
  const [failed, setFailed] = useState(false);
  return (
    <div className={styles.photo}>
      {failed ? (
        <div className={styles.fallback}>
          <ImageOff size={30} aria-hidden="true" />
          <p>{t("switcher.imageUnavailable")}</p>
        </div>
      ) : (
        <div
          className={styles.imageFrame}
          style={
            look.frame
              ? {
                  width: "200%",
                  height: "200%",
                  maxWidth: "none",
                  top: `${-look.frame.row * 100}%`,
                  left: `${-look.frame.column * 100}%`,
                  right: "auto",
                  bottom: "auto",
                }
              : undefined
          }
        >
          <Image
            src={look.src}
            alt={look.name}
            fill
            sizes="(min-width: 1000px) 480px, (min-width: 600px) 45vw, 90vw"
            unoptimized={look.src.startsWith("blob:")}
            className={styles.image}
            style={look.frame ? { objectFit: "fill" } : undefined}
            onError={() => setFailed(true)}
          />
        </div>
      )}
    </div>
  );
}

export function LookSwitcher({
  looks,
  compact = false,
  notice,
  initialLookId,
}: {
  looks: readonly LookSlide[];
  compact?: boolean;
  notice?: string;
  initialLookId?: string;
}) {
  const t = useTranslations("dashboard.looks");
  const [selectedId, setSelectedId] = useState<string | null>(
    initialLookId ?? null,
  );
  const [comparisonId, setComparisonId] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const selected = looks.find((look) => look.id === selectedId) ?? looks[0];
  if (!selected) return <p className={styles.empty}>{t("switcher.empty")}</p>;
  const index = looks.findIndex((look) => look.id === selected.id);
  const alternatives = looks.filter((look) => look.id !== selected.id);
  const comparison =
    alternatives.find((look) => look.id === comparisonId) ?? alternatives[0];
  const compareVisible = !compact && comparing && !!comparison;
  const move = (direction: number) => {
    setSelectedId(looks[(index + direction + looks.length) % looks.length].id);
  };

  return (
    <div
      className={styles.switcher}
      data-compact={compact || undefined}
      role="group"
      aria-label={t("switcher.position", {
        current: index + 1,
        total: looks.length,
      })}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          move(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}
    >
      <div className={styles.stage} data-compare={compareVisible || undefined}>
        <figure className={styles.figure}>
          <LookPhoto key={`${selected.id}:${selected.src}`} look={selected} />
          <figcaption>{selected.name}</figcaption>
        </figure>
        {compareVisible && (
          <figure className={styles.figure}>
            <LookPhoto
              key={`${comparison.id}:${comparison.src}`}
              look={comparison}
            />
            <figcaption>{comparison.name}</figcaption>
          </figure>
        )}
      </div>
      <div className={styles.controls}>
        <Button
          variant="outline"
          size="icon"
          aria-label={t("switcher.previous")}
          disabled={looks.length < 2}
          onClick={() => move(-1)}
        >
          <ArrowLeft size={17} aria-hidden="true" />
        </Button>
        <span className={styles.position} aria-live="polite">
          {t("switcher.position", { current: index + 1, total: looks.length })}
        </span>
        <Button
          variant="outline"
          size="icon"
          aria-label={t("switcher.next")}
          disabled={looks.length < 2}
          onClick={() => move(1)}
        >
          <ArrowRight size={17} aria-hidden="true" />
        </Button>
        {!compact && (
          <Button
            className={styles.compare}
            variant={comparing ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={compareVisible}
            disabled={looks.length < 2}
            onClick={() => setComparing((value) => !value)}
          >
            <Columns2 size={16} aria-hidden="true" />
            {t("switcher.compare")}
          </Button>
        )}
      </div>
      {!compact && looks.length > 1 && (
        <div className={styles.numbers}>
          {looks.map((look, position) => (
            <button
              key={look.id}
              type="button"
              aria-label={t("switcher.select", { index: position + 1 })}
              aria-pressed={look.id === selected.id}
              onClick={() => setSelectedId(look.id)}
            >
              {String(position + 1).padStart(2, "0")}
            </button>
          ))}
        </div>
      )}
      {compareVisible && (
        <Select
          label={t("switcher.compareWith")}
          value={comparison.id}
          allowDeselect={false}
          data={alternatives.map((look) => ({
            value: look.id,
            label: look.name,
          }))}
          onChange={setComparisonId}
        />
      )}
      {notice && <p className={styles.notice}>{notice}</p>}
    </div>
  );
}
