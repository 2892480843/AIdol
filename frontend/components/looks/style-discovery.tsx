"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Modal, TextInput } from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";
import {
  ArrowUpRight,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  STYLE_CATEGORIES,
  filterStyleLooks,
  parseStyleId,
  type StyleId,
  type StyleLook,
} from "@/lib/style-discovery";
import { LookPhoto, LookSwitcher, type LookSlide } from "./look-switcher";
import styles from "./style-discovery.module.css";

export function StyleDiscovery() {
  const t = useTranslations("dashboard.looks.discovery");
  const tl = useTranslations("dashboard.looks");
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const styleParam = params.get("style");
  const [styleId, setStyleId] = useState<"all" | StyleId>(() =>
    parseStyleId(styleParam),
  );
  const activeStyle = useRef(styleId);
  const [search, setSearch] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const featureTitleId = useId();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const next = parseStyleId(styleParam);
    // The URL may confirm a local selection after its preview has opened.
    if (next === activeStyle.current) return;
    activeStyle.current = next;
    setStyleId(next);
    setPreviewId(null);
  }, [styleParam]);

  const filtered = filterStyleLooks(styleId, search, (look) =>
    [
      t(`lookNames.${look.key}`),
      t(`styles.${look.styleId}.name`),
      t(`styles.${look.styleId}.description`),
      t(`styles.${look.styleId}.keywords`),
    ].join(" "),
  );
  const featured =
    (styleId === "all"
      ? filtered.find((look) => look.key === "streetBomber")
      : undefined) ?? filtered[0];
  const category = STYLE_CATEGORIES.find(
    (entry) => entry.id === featured?.styleId,
  );
  const slides: LookSlide[] = filtered.map((look) => ({
    ...look,
    name: t(`lookNames.${look.key}`),
  }));
  const preview = slides.find((look) => look.id === previewId);
  const slideFor = (look: StyleLook): LookSlide => ({
    ...look,
    name: t(`lookNames.${look.key}`),
  });
  const chooseStyle = (next: "all" | StyleId) => {
    activeStyle.current = next;
    setStyleId(next);
    setPreviewId(null);
    const nextParams = new URLSearchParams(params.toString());
    if (next === "all") nextParams.delete("style");
    else nextParams.set("style", next);
    const query = nextParams.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  };
  const reset = () => {
    setSearch("");
    chooseStyle("all");
  };

  return (
    <section className={styles.discovery}>
      <div className={styles.filterBar}>
        <div
          className={styles.chips}
          role="group"
          aria-label={t("filtersLabel")}
        >
          <button
            type="button"
            aria-pressed={styleId === "all"}
            onClick={() => chooseStyle("all")}
          >
            <SlidersHorizontal size={15} aria-hidden="true" />
            {t("all")}
          </button>
          {STYLE_CATEGORIES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={styleId === entry.id}
              onClick={() => chooseStyle(entry.id)}
            >
              {t(`styles.${entry.id}.name`)}
            </button>
          ))}
        </div>
        <TextInput
          label={t("searchLabel")}
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(event) => {
            setSearch(event.currentTarget.value);
            setPreviewId(null);
          }}
          leftSection={<Search size={17} aria-hidden="true" />}
          rightSectionPointerEvents="auto"
          rightSection={
            search ? (
              <button
                className={styles.clear}
                type="button"
                aria-label={t("clearSearch")}
                onClick={() => {
                  setSearch("");
                  setPreviewId(null);
                }}
              >
                <X size={15} aria-hidden="true" />
              </button>
            ) : undefined
          }
          classNames={{
            root: styles.search,
            label: styles.searchLabel,
            input: styles.searchInput,
          }}
        />
      </div>

      <div className={styles.meta}>
        <span className={styles.styleCount}>
          {t("styleCount", { count: STYLE_CATEGORIES.length })}
        </span>
        <span role="status" aria-live="polite" aria-atomic="true">
          {t("count", { count: filtered.length })}
        </span>
      </div>
      <p className={styles.notice}>{tl("modelNotice")}</p>

      {featured && category ? (
        <>
          <section className={styles.hero} aria-labelledby={featureTitleId}>
            <div className={styles.heroVisual}>
              <span className={styles.visualLabel}>
                {t(`styles.${category.id}.name`)}
              </span>
              <div className={styles.featuredPhoto}>
                <LookPhoto key={featured.id} look={slideFor(featured)} />
              </div>
              <span className={styles.visualIndex} aria-hidden="true">
                {String(
                  filtered.findIndex((look) => look.id === featured.id) + 1,
                ).padStart(2, "0")}{" "}
                / {String(filtered.length).padStart(2, "0")}
              </span>
            </div>
            <div className={styles.heroCopy}>
              <span className={styles.kicker}>{t("eyebrow")}</span>
              <h2 id={featureTitleId}>
                {styleId === "all"
                  ? t("allTitle")
                  : t(`styles.${styleId}.name`)}
              </h2>
              <p className={styles.intro}>
                {styleId === "all"
                  ? t("allDescription")
                  : t(`styles.${styleId}.description`)}
              </p>
              <dl className={styles.recipe}>
                <div>
                  <dt>{t("paletteTitle")}</dt>
                  <dd
                    className={styles.palette}
                    role="img"
                    aria-label={`${t("paletteTitle")}: ${category.palette.join(", ")}`}
                  >
                    {category.palette.map((color) => (
                      <span key={color} style={{ backgroundColor: color }} />
                    ))}
                  </dd>
                </div>
                <div>
                  <dt>{t("formulaTitle")}</dt>
                  <dd>{t(`styles.${category.id}.formula`)}</dd>
                </div>
                <div>
                  <dt>{t("tipTitle")}</dt>
                  <dd className={styles.tip}>
                    {t(`styles.${category.id}.tip`)}
                  </dd>
                </div>
              </dl>
              <div className={styles.heroActions}>
                <Link
                  className={styles.practice}
                  href={`/dashboard/inspiration?formula=${category.formulaId}`}
                >
                  {t("practice")}
                  <ArrowUpRight size={19} aria-hidden="true" />
                </Link>
                <Button
                  variant="ghost"
                  onClick={(event) => {
                    event.currentTarget.focus();
                    setPreviewId(featured.id);
                  }}
                >
                  {t("preview")}
                  <ArrowUpRight size={17} aria-hidden="true" />
                </Button>
              </div>
            </div>
          </section>
          <ul className={styles.gallery}>
            {filtered.map((look, index) => (
              <li key={look.id}>
                <button
                  type="button"
                  className={styles.lookCard}
                  aria-label={`${t("preview")}: ${t(`lookNames.${look.key}`)}`}
                  aria-haspopup="dialog"
                  onClick={(event) => {
                    event.currentTarget.focus();
                    setPreviewId(look.id);
                  }}
                >
                  <div className={styles.cardPhoto}>
                    <LookPhoto look={slideFor(look)} />
                    <span className={styles.cardIndex} aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className={styles.cardOpen} aria-hidden="true">
                      <ArrowUpRight size={18} />
                    </span>
                  </div>
                  <span className={styles.cardText}>
                    <span className={styles.cardStyle}>
                      {t(`styles.${look.styleId}.name`)}
                    </span>
                    <strong>{t(`lookNames.${look.key}`)}</strong>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className={styles.empty}>
          <Search size={28} aria-hidden="true" />
          <h2>{t("emptyTitle")}</h2>
          <p>{t("emptyDescription")}</p>
          <Button variant="outline" onClick={reset}>
            <RotateCcw size={16} aria-hidden="true" />
            {t("reset")}
          </Button>
        </div>
      )}
      <Modal
        opened={!!preview}
        onClose={() => setPreviewId(null)}
        title={t("previewTitle")}
        closeButtonProps={{ "aria-label": t("close") }}
        size="xl"
        radius={20}
        centered
        returnFocus
        transitionProps={{ duration: reducedMotion ? 0 : 150 }}
        classNames={{
          content: styles.modal,
          header: styles.modalHeader,
          title: styles.modalTitle,
        }}
      >
        {preview && (
          <LookSwitcher
            key={`${styleId}:${search}:${preview.id}`}
            looks={slides}
            initialLookId={preview.id}
            notice={tl("modelNotice")}
          />
        )}
      </Modal>
    </section>
  );
}
