"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Select, TextInput } from "@mantine/core";
import {
  ArrowDown,
  ArrowRight,
  Bookmark,
  ExternalLink,
  RotateCcw,
  Search,
  Shirt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useOccasionLabel,
  useTypeLabel,
} from "@/lib/hooks/use-translated-constants";
import { useInspirationWardrobe } from "@/lib/hooks/use-inspiration-wardrobe";
import { useSavedInspirations } from "@/lib/hooks/use-saved-inspirations";
import {
  STYLE_CREATORS,
  STYLE_FORMULAS,
  getFormula,
} from "@/lib/inspiration/catalog";
import { matchFormula } from "@/lib/inspiration/matching";
import { buildInspirationStudioUrl } from "@/lib/studio/inspiration-seed";
import type { Item } from "@/lib/types";
import styles from "./inspiration.module.css";

function GarmentImage({ item, fallback }: { item: Item; fallback: string }) {
  const [failed, setFailed] = useState(false);
  const typeLabel = useTypeLabel();
  const src = item.thumbnail_url || item.image_url;
  return src && !failed ? (
    <Image
      src={src}
      alt={item.name || typeLabel(item.type)}
      fill
      sizes="(min-width: 1200px) 220px, (min-width: 600px) 30vw, 45vw"
      className={styles.itemImage}
      onError={() => setFailed(true)}
    />
  ) : (
    <div className={styles.imageFallback}>
      <Shirt size={28} aria-hidden="true" />
      <span>{fallback}</span>
    </div>
  );
}

export function InspirationWorkspace() {
  const t = useTranslations("dashboard.inspiration");
  const ti = useTranslations("dashboard.overview");
  const locale = useLocale();
  const occasionLabel = useOccasionLabel();
  const typeLabel = useTypeLabel();
  const router = useRouter();
  const params = useSearchParams();
  const formulaParam = params.get("formula");
  const [selectedId, setSelectedId] = useState(
    () => getFormula(formulaParam).id,
  );
  const selectedIdRef = useRef(selectedId);
  const practiceRef = useRef<HTMLElement>(null);
  const [search, setSearch] = useState("");
  const [occasion, setOccasion] = useState("all");
  const [savedOnly, setSavedOnly] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const wardrobe = useInspirationWardrobe();
  const bookmarks = useSavedInspirations();
  useEffect(() => {
    const nextId = getFormula(formulaParam).id;
    // Our own URL update may arrive after the user has already swapped a piece.
    if (selectedIdRef.current !== nextId) {
      selectedIdRef.current = nextId;
      setSelectedId(nextId);
      setOverrides({});
    }
  }, [formulaParam]);
  const normalizedSearch = search.trim().toLocaleLowerCase(locale);
  const visibleFormulas = STYLE_FORMULAS.filter((f) => {
    const author = STYLE_CREATORS.find((c) => c.id === f.creatorId)!;
    return (
      (!savedOnly || bookmarks.savedIds.includes(f.id)) &&
      (occasion === "all" || f.occasion === occasion) &&
      (!normalizedSearch ||
        `${t(`formulas.${f.key}.title`)} ${t(`formulas.${f.key}.summary`)} ${author.name} ${author.publication}`
          .toLocaleLowerCase(locale)
          .includes(normalizedSearch))
    );
  });
  const formula =
    visibleFormulas.find((f) => f.id === selectedId) ??
    visibleFormulas[0] ??
    getFormula(selectedId);
  const creator = STYLE_CREATORS.find((c) => c.id === formula.creatorId)!;
  const match = useMemo(
    () => matchFormula(formula, wardrobe.items, overrides),
    [formula, wardrobe.items, overrides],
  );
  const selectedItems = match.slots.flatMap((slot) =>
    slot.item ? [slot.item] : [],
  );
  const selectFormula = (id: string) => {
    selectedIdRef.current = id;
    setSelectedId(id);
    setOverrides({});
    router.replace(
      `/dashboard/inspiration?${new URLSearchParams({ formula: id })}`,
      { scroll: false },
    );
    practiceRef.current?.scrollIntoView?.({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };
  const studioHref = selectedItems.length
    ? buildInspirationStudioUrl(
        selectedItems.map((item) => item.id),
        formula.occasion,
        t(`formulas.${formula.key}.title`),
      )
    : null;
  const activeSaved = bookmarks.savedIds.includes(formula.id);
  return (
    <div className={styles.page}>
      <header className={styles.pageHeading}>
        <div>
          <p className={styles.eyebrow}>{t("eyebrow")}</p>
          <h1>{t("title")}</h1>
          <p className={styles.intro}>{t("description")}</p>
        </div>
        <a href="#style-creators" className={styles.sourceJump}>
          {t("creatorsTitle")}
          <ArrowDown size={15} aria-hidden="true" />
        </a>
      </header>
      <div className={styles.filterBar}>
        <TextInput
          className={styles.search}
          leftSection={<Search size={16} aria-hidden="true" />}
          placeholder={t("search")}
          aria-label={t("search")}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <div className={styles.scopeFilters}>
          <button
            type="button"
            aria-pressed={!savedOnly}
            onClick={() => setSavedOnly(false)}
          >
            {t("all")}
          </button>
          <button
            type="button"
            aria-pressed={savedOnly}
            onClick={() => setSavedOnly(true)}
          >
            <Bookmark size={14} aria-hidden="true" />
            {t("savedOnly")}
          </button>
        </div>
        <Select
          className={styles.occasionFilter}
          aria-label={t("allOccasions")}
          value={occasion}
          onChange={(value) => setOccasion(value || "all")}
          allowDeselect={false}
          data={["all", "casual", "office", "date"].map((value) => ({
            value,
            label: value === "all" ? t("allOccasions") : occasionLabel(value),
          }))}
        />
      </div>
      <div className={styles.workspace}>
        <aside className={styles.formulaIndex} aria-label={t("all")}>
          {visibleFormulas.length ? (
            visibleFormulas.map((f) => {
              const author = STYLE_CREATORS.find((c) => c.id === f.creatorId)!;
              const index =
                STYLE_FORMULAS.findIndex((entry) => entry.id === f.id) + 1;
              const preview = matchFormula(f, wardrobe.items)
                .slots.filter((entry) => entry.item)
                .slice(0, 3);
              return (
                <div
                  key={f.id}
                  className={styles.indexRow}
                  data-active={formula.id === f.id}
                >
                  <button
                    type="button"
                    className={styles.formulaChoice}
                    aria-pressed={formula.id === f.id}
                    aria-controls="practice-panel"
                    onClick={() => selectFormula(f.id)}
                  >
                    <span className={styles.formulaPreview} aria-hidden="true">
                      {preview.length ? (
                        preview.map(({ item }) => (
                          <span key={item!.id}>
                            {item!.thumbnail_url || item!.image_url ? (
                              <Image
                                src={(item!.thumbnail_url || item!.image_url)!}
                                alt=""
                                fill
                                sizes="(max-width: 600px) 25vw, 100px"
                                className={styles.previewImage}
                              />
                            ) : (
                              <Shirt size={25} />
                            )}
                          </span>
                        ))
                      ) : (
                        <span>
                          <Shirt size={32} />
                        </span>
                      )}
                    </span>
                    <span className={styles.number}>
                      {String(index).padStart(2, "0")}
                    </span>
                    <span>
                      <strong>{t(`formulas.${f.key}.title`)}</strong>
                      <small>{author.name}</small>
                      <span className={styles.formulaCTA}>
                        {t("practice")}
                        <ArrowRight size={13} aria-hidden="true" />
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.bookmark}
                    aria-label={t(
                      bookmarks.savedIds.includes(f.id) ? "unsave" : "save",
                      { name: t(`formulas.${f.key}.title`) },
                    )}
                    aria-pressed={bookmarks.savedIds.includes(f.id)}
                    onClick={() => bookmarks.toggle(f.id)}
                  >
                    <Bookmark
                      size={16}
                      fill={
                        bookmarks.savedIds.includes(f.id)
                          ? "currentColor"
                          : "none"
                      }
                      aria-hidden="true"
                    />
                  </button>
                </div>
              );
            })
          ) : (
            <div className={styles.noResults}>
              <p>{t("noResults")}</p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSearch("");
                  setSavedOnly(false);
                  setOccasion("all");
                }}
              >
                {t("clearFilters")}
              </Button>
            </div>
          )}
          <p className={styles.localNote}>{t("bookmarksLocal")}</p>
          {bookmarks.storageError && (
            <p role="status" className={styles.storageError}>
              {t("bookmarkError")}
            </p>
          )}
        </aside>
        {visibleFormulas.length > 0 && (
          <section
            id="practice-panel"
            ref={practiceRef}
            className={styles.practice}
            aria-labelledby="practice-title"
          >
            <div className={styles.practiceHeader}>
              <div>
                <p className={styles.eyebrow}>
                  {t("method")} · {occasionLabel(formula.occasion)}
                </p>
                <h2 id="practice-title">
                  {t(`formulas.${formula.key}.title`)}
                </h2>
                <p>{t(`formulas.${formula.key}.summary`)}</p>
              </div>
              <button
                type="button"
                className={styles.bookmarkLarge}
                aria-label={t(activeSaved ? "unsave" : "save", {
                  name: t(`formulas.${formula.key}.title`),
                })}
                aria-pressed={activeSaved}
                onClick={() => bookmarks.toggle(formula.id)}
              >
                <Bookmark
                  size={20}
                  fill={activeSaved ? "currentColor" : "none"}
                  aria-hidden="true"
                />
              </button>
            </div>
            <div className={styles.methodNote}>
              <div className={styles.palette} aria-hidden="true">
                {formula.palette.map((color) => (
                  <span key={color} style={{ backgroundColor: color }} />
                ))}
              </div>
              <p>{t(`formulas.${formula.key}.tip`)}</p>
              <a href={creator.url} target="_blank" rel="noopener noreferrer">
                {t("reference")} · {creator.name}
                <ExternalLink size={12} aria-hidden="true" />
              </a>
            </div>
            <div className={styles.wardrobeHeading}>
              <h3>{t("practice")}</h3>
              <span>{t("count", { count: wardrobe.items.length })}</span>
            </div>
            {wardrobe.isError ? (
              <div className={styles.feedback} role="status">
                <p>{t("inventoryError")}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void wardrobe.refetch();
                  }}
                >
                  {t("retry")}
                </Button>
              </div>
            ) : wardrobe.isLoading ? (
              <div className={styles.garments}>
                {[0, 1, 2].map((key) => (
                  <Skeleton key={key} className="h-64" />
                ))}
              </div>
            ) : (
              <>
                <p className={styles.coverage}>
                  {t("coverage", {
                    matched: match.matched,
                    required: match.required,
                  })}
                </p>
                <div className={styles.garments}>
                  {match.slots.map(
                    ({ slot, item, candidates, colorSatisfied }) => (
                      <div className={styles.garment} key={slot.id}>
                        <div className={styles.slotLabel}>
                          <span>{t(`slots.${slot.id}`)}</span>
                          {slot.optional && <small>{t("optional")}</small>}
                        </div>
                        <div className={styles.photo}>
                          {item ? (
                            <Link
                              href={`/dashboard/wardrobe?${new URLSearchParams({ item: item.id })}`}
                              aria-label={item.name || typeLabel(item.type)}
                            >
                              <GarmentImage
                                key={`${item.id}:${item.thumbnail_url || item.image_url}`}
                                item={item}
                                fallback={ti("imageUnavailable")}
                              />
                            </Link>
                          ) : (
                            <div className={styles.missing}>
                              <Shirt size={27} aria-hidden="true" />
                              <p>{t("missing")}</p>
                              <Link href="/dashboard/wardrobe">
                                {t("manageWardrobe")}
                                <ArrowRight size={13} aria-hidden="true" />
                              </Link>
                            </div>
                          )}
                        </div>
                        {item && (
                          <>
                            <p className={styles.itemName}>
                              {item.name || typeLabel(item.type)}
                            </p>
                            <Select
                              aria-label={`${t("swap")} · ${t(`slots.${slot.id}`)}`}
                              placeholder={t("chooseItem")}
                              value={item.id}
                              allowDeselect={false}
                              searchable={candidates.length > 6}
                              disabled={candidates.length <= 1}
                              data={candidates.map((candidate) => ({
                                value: candidate.id,
                                label:
                                  candidate.name || typeLabel(candidate.type),
                              }))}
                              onChange={(value) => {
                                if (value)
                                  setOverrides((old) => ({
                                    ...old,
                                    [slot.id]: value,
                                  }));
                              }}
                            />
                            {slot.color && colorSatisfied !== true && (
                              <small className={styles.colorHint}>
                                {t("colorHint")}
                              </small>
                            )}
                          </>
                        )}
                      </div>
                    ),
                  )}
                </div>
                {wardrobe.hasMore && (
                  <div className={styles.loadMore}>
                    <p>
                      {t("partial", {
                        loaded: wardrobe.items.length,
                        total: wardrobe.total,
                      })}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={wardrobe.isFetchingMore}
                      onClick={() => {
                        void wardrobe.loadMore();
                      }}
                    >
                      {t(wardrobe.isFetchingMore ? "loadingMore" : "loadMore")}
                    </Button>
                  </div>
                )}
                <p className={styles.matchNote}>{t("matchNote")}</p>
                <div className={styles.actions}>
                  <div>
                    <strong>
                      {t("selectedCount", { count: selectedItems.length })}
                    </strong>
                    <p>{!selectedItems.length && t("noPieces")}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setOverrides({})}
                  >
                    <RotateCcw size={14} className="mr-2" aria-hidden="true" />
                    {t("resetSelections")}
                  </Button>
                  {studioHref ? (
                    <Button asChild>
                      <Link href={studioHref}>
                        {t("openStudio")}
                        <ArrowRight
                          size={15}
                          className="ml-2"
                          aria-hidden="true"
                        />
                      </Link>
                    </Button>
                  ) : (
                    <Button disabled>{t("openStudio")}</Button>
                  )}
                </div>
              </>
            )}
          </section>
        )}
      </div>
      <section
        id="style-creators"
        className={styles.creators}
        aria-labelledby="creators-title"
      >
        <div className={styles.creatorsHeading}>
          <p className={styles.eyebrow}>{t("reference")}</p>
          <h2 id="creators-title">{t("creatorsTitle")}</h2>
          <p>{t("sourcesNote")}</p>
        </div>
        <div className={styles.creatorList}>
          {STYLE_CREATORS.map((author, index) => (
            <a
              key={author.id}
              href={author.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.creator}
            >
              <span className={styles.creatorNumber}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3>{author.name}</h3>
                <small>{author.publication}</small>
                <p>{t(`creators.${author.id}`)}</p>
              </div>
              <ExternalLink size={16} aria-label={t("viewSource")} />
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
