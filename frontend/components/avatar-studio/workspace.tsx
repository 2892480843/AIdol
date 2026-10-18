"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useReducedMotion } from "@mantine/hooks";
import { Button as MantineButton, Modal } from "@mantine/core";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Download,
  Heart,
  Loader2,
  Pause,
  RotateCcw,
  RotateCw,
  Sparkles,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { useLooksOwnerScope } from "@/lib/looks/use-owner-scope";
import { useInspirationWardrobe } from "@/lib/hooks/use-inspiration-wardrobe";
import { useWardrobeDraftItems } from "@/lib/hooks/use-wardrobe-draft";
import { useTypeLabel } from "@/lib/hooks/use-translated-constants";
import { useAvatarJournal } from "@/lib/hooks/use-avatar-journal";
import { useSaveAvatarOutfit } from "@/lib/hooks/use-avatar-outfit";
import {
  AVATAR_PRESETS,
  DEFAULT_AVATAR_CONFIG,
  avatarFittingHref,
  avatarLocalDate,
  avatarPaletteForItems,
  clampAvatarZoom,
  isValidAvatarDate,
  normalizeAvatarConfig,
  AVATAR_PRESET_ORDER,
  stepAvatarPreset,
  type AvatarConfig,
  type AvatarPalette,
  type AvatarPresetId,
} from "@/lib/avatar-studio";
import {
  FITTING_GROUPS,
  fittingGroupForType,
  toggleFittingItemPreservingUnknown,
} from "@/lib/fitting-room";
import { isInspirationItemEligible } from "@/lib/inspiration/matching";
import type { Item } from "@/lib/types";
import type { AvatarSavedLook } from "@/lib/avatar-journal";
import { RackItemPhoto } from "@/components/wardrobe-3d/item-photo";
import type { AvatarSceneController } from "./scene-types";
import styles from "./workspace.module.css";
import { fashionGarments } from "@/lib/avatar-fashion";
import { createAvatarThumbnail } from "@/lib/avatar-snapshot";
import { editorialLooks, avatarSceneIdentity, editorialLookKey, stepEditorialLook } from "@/lib/avatar-editorial";
import { FashionCuts, LookRail, EditorialLookRail, PRESET_KEYS } from "./fashion-controls";

const Scene = dynamic(() => import("./scene"), { ssr: false });
type Feedback =
  | "bookmarkSaved"
  | "bookmarkFailed"
  | "outfitSaved"
  | "saveOutfitError"
  | "exportSuccess"
  | "exportError"
  | "videoError"
  | "videoSuccess"
  | "deleteSuccess"
  | "deleteError"
  | null;

export function AvatarWorkspace({ initialIds }: { initialIds: string[]; }) {
  const { ownerId, epoch } = useLooksOwnerScope();
  const t = useTranslations("wardrobe.avatar");
  return ownerId ? (
    <AvatarWorkspaceBody
      key={`${ownerId}:${epoch}`}
      owner={ownerId}
      initialIds={initialIds}
    />
  ) : (
    <p role="status">{t("loadingWardrobe")}</p>
  );
}

function AvatarWorkspaceBody({
  owner,
  initialIds,
}: {
  owner: string;
  initialIds: string[];
}) {
  const t = useTranslations("wardrobe.avatar");
  const tf = useTranslations("wardrobe.fitting");
  const te = useTranslations("wardrobe.extraction");
  const tc = useTranslations("common");
  const wardrobe = useInspirationWardrobe();
  const scope = useLooksOwnerScope();
  const journal = useAvatarJournal();
  const journalOrder = useMemo(
    () =>
      [...journal.entries].sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
      ),
    [journal.entries],
  );
  const saveOutfit = useSaveAvatarOutfit();
  const typeLabel = useTypeLabel();
  const reducedMotion = !!useReducedMotion();
  const [config, setConfig] = useState<AvatarConfig>(() =>
    normalizeAvatarConfig({
      ...DEFAULT_AVATAR_CONFIG,
      renderMode: initialIds.length ? undefined : "editorial",
      editorialLook: initialIds.length ? undefined : "dopamine",
      preset: "elegant",
      palette: AVATAR_PRESETS.elegant,
      pose: "editorial",
    }),
  );
  const [ids, setIds] = useState(initialIds);
  const [sampleDress, setSampleDress] = useState(true);
  const [sampleOuterwear, setSampleOuterwear] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [framing, setFraming] = useState<"full" | "portrait">("full");
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<string>("all");
  const [date, setDate] = useState(() => avatarLocalDate());
  const [name, setName] = useState("");
  const [activeSaved, setActiveSaved] = useState<string | null>(null);
  const savedIndex = journalOrder.findIndex((look) => look.id === activeSaved);
  const previousSaved =
    savedIndex < 0 ? journalOrder.at(-1) : journalOrder[savedIndex - 1];
  const nextSaved = savedIndex < 0 ? undefined : journalOrder[savedIndex + 1];
  const [deleteTarget, setDeleteTarget] = useState<AvatarSavedLook | null>(
    null,
  );
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [exporting, setExporting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [exported, setExported] = useState<{
    url: string;
    filename: string;
    kind?: "video";
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const [readyKey, setReadyKey] = useState("");
  const [sceneError, setSceneError] = useState<{
    key: string;
    kind: string;
  } | null>(null);
  const controller = useRef<AvatarSceneController | null>(null);
  const downloads = useRef<string[]>([]);
  const editorial = config.renderMode === "editorial";
  const modelKey = `${avatarSceneIdentity(config)}:${retry}`;
  const editorialLook = t(editorialLookKey(config.model, config.editorialLook));
  const sourceNotice = editorial ? `/models/avatar/${config.editorialLook === "dopamine" ? "dopamine-v1" : config.editorialLook === "refined" ? "beauty-v2" : "editorial-v1"}/NOTICE.txt` : "/models/avatar/v2/NOTICE.txt";
  const ready = readyKey === modelKey && sceneError?.key !== modelKey;
  const resolved = useWardrobeDraftItems(owner, ids);
  const items = useMemo(
    () =>
      wardrobe.items.filter(
        (item) =>
          item.user_id === owner &&
          isInspirationItemEligible(item) &&
          fittingGroupForType(item.type),
      ),
    [wardrobe.items, owner],
  );
  const selected = resolved.entries.flatMap((entry) =>
    entry.state === "ready" &&
      entry.item?.user_id === owner &&
      isInspirationItemEligible(entry.item) &&
      fittingGroupForType(entry.item.type)
      ? [entry.item]
      : [],
  );
  const selectionLoading = resolved.isLoading;
  const selectedHref = avatarFittingHref(selected);
  const selectedGroups = selected.map((item) => fittingGroupForType(item.type));
  const invalidSelection =
    !selectionLoading &&
    (selected.length !== ids.length ||
      (selected.length > 0 && !selectedHref) ||
      (config.model === "male" && selectedGroups.includes("dresses")));
  const palette = avatarPaletteForItems(selected, config.palette);
  const garments = fashionGarments(config, selected);
  const dressMode =
    config.model === "female" &&
    (selectedGroups.includes("dresses") ||
      (!selectedGroups.includes("tops") &&
        !selectedGroups.includes("bottoms") &&
        sampleDress));
  const showOuterwear = selectedGroups.includes("outerwear") || sampleOuterwear;
  const fittingHref =
    !invalidSelection && !selectionLoading ? selectedHref : null;
  const label = (item: Item) => item.name || typeLabel(item.type);
  const filtered = items.filter(
    (item) =>
      (group === "all" || fittingGroupForType(item.type) === group) &&
      `${label(item)} ${(item.colors ?? []).join(" ")} ${(item.tags?.style ?? []).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const currentTitle = name.trim() || (editorial ? editorialLook : t(PRESET_KEYS[config.preset]));
  const validForm = isValidAvatarDate(date) && currentTitle.length <= 80;
  const canSave =
    selected.length > 0 &&
    !invalidSelection &&
    !selectionLoading &&
    validForm &&
    !saveOutfit.isSaving;
  const onController = useCallback((value: AvatarSceneController | null) => {
    controller.current = value;
  }, []);
  const onReady = useCallback(() => {
    setReadyKey(modelKey);
    setSceneError(null);
  }, [modelKey]);
  const onError = useCallback(
    (kind: string) => {
      if (kind === "export") setFeedback("exportError");
      else setSceneError({ key: modelKey, kind });
    },
    [modelKey],
  );
  const onRotationChange = useCallback(
    (rotation: number) => setConfig((previous) => ({ ...previous, rotation })),
    [],
  );
  const onZoomChange = useCallback(
    (zoom: number) =>
      setConfig((previous) => ({ ...previous, zoom: clampAvatarZoom(zoom) })),
    [],
  );
  useEffect(
    () => () => downloads.current.forEach((url) => URL.revokeObjectURL(url)),
    [],
  );
  const rotate = (amount: number) => {
    setAutoRotate(false);
    setConfig((previous) => ({
      ...previous,
      rotation: ((previous.rotation + amount + 540) % 360) - 180,
    }));
  };
  const setView = (rotation: number) => {
    setAutoRotate(false);
    setConfig((previous) => ({ ...previous, rotation }));
  };
  const chooseEditorialLook = (editorialLook: AvatarConfig["editorialLook"]) => {
    setAutoRotate(false);
    setConfig((previous) => ({ ...previous, renderMode: "editorial", editorialLook }));
    setFeedback(null);
  };
  const choosePreset = (preset: AvatarPresetId) => {
    setConfig((previous) => ({
      ...previous,
      renderMode: undefined,
      preset,
      palette: { ...AVATAR_PRESETS[preset] },
      garments: undefined,
    }));
    setSampleDress(config.model === "female" && preset === "elegant");
    setSampleOuterwear(
      preset === "minimal" || (config.model === "male" && preset === "elegant"),
    );
    setFeedback(null);
  };
  const chooseItem = (item: Item) => {
    setConfig((previous) => ({ ...previous, renderMode: undefined }));
    const complete = new Map(
      [...items, ...selected].map((value) => [value.id, value]),
    );
    setIds((previous) =>
      toggleFittingItemPreservingUnknown(
        previous,
        item,
        Array.from(complete.values()),
      ),
    );
    setFeedback(null);
  };
  const bookmark = () => {
    try {
      const input: AvatarSavedLook = {
        id: crypto.randomUUID(),
        name: currentTitle,
        date,
        config: { ...config, palette },
        itemIds: ids,
        favorite: true,
        dressMode,
        showOuterwear,
        createdAt: new Date().toISOString(),
      };
      const saved = journal.save(input);
      setFeedback(saved ? "bookmarkSaved" : "bookmarkFailed");
      // Persist scene settings first. An optional render never resurrects a deleted look.
      const capture = controller.current?.capture;
      if (
        saved &&
        ready &&
        capture &&
        typeof createImageBitmap === "function"
      ) {
        const fence = scope.capture();
        const attach = journal.saveThumbnail;
        void capture({ reportError: false })
          .then(createAvatarThumbnail)
          .then((thumbnail) => {
            fence.assert();
            attach(input, thumbnail);
          })
          .catch(() => {
            /* The saved, restorable scene remains available without a thumbnail. */
          });
      }
    } catch {
      setFeedback("bookmarkFailed");
    }
  };
  const restore = (look: AvatarSavedLook) => {
    setAutoRotate(false);
    setConfig(normalizeAvatarConfig(look.config));
    setIds(look.itemIds);
    setDate(look.date);
    setName(look.name);
    setActiveSaved(look.id);
    setSampleDress(look.dressMode);
    setSampleOuterwear(look.showOuterwear);
    setFeedback(null);
  };
  const save = async () => {
    if (!canSave) return;
    setFeedback(null);
    try {
      await saveOutfit.save({
        items: selected,
        name: currentTitle,
        scheduledFor: date,
      });
      setFeedback("outfitSaved");
    } catch {
      setFeedback("saveOutfitError");
    }
  };
  const exportImage = async () => {
    if (!controller.current || !ready || exporting) return;
    const fence = scope.capture();
    setExporting(true);
    setFeedback(null);
    try {
      const blob = await controller.current.capture();
      fence.assert();
      const url = URL.createObjectURL(blob);
      downloads.current.forEach((previous) => URL.revokeObjectURL(previous));
      downloads.current = [url];
      setExported({
        url,
        filename: `dada-3d-${date || avatarLocalDate()}.png`,
      });
      setFeedback("exportSuccess");
    } catch {
      if (fence.isCurrent()) setFeedback("exportError");
    } finally {
      if (fence.isCurrent()) setExporting(false);
    }
  };
  const exportVideo = async () => {
    if (!controller.current?.captureTurntable || !ready || exporting || recording) return;
    const fence = scope.capture();
    setRecording(true);
    setAutoRotate(false);
    setFeedback(null);
    try {
      const blob = await controller.current.captureTurntable();
      fence.assert();
      const url = URL.createObjectURL(blob);
      downloads.current.forEach(previous => URL.revokeObjectURL(previous));
      downloads.current = [url];
      setExported({ url, filename: `dada-360-${date || avatarLocalDate()}.${blob.type.startsWith("video/mp4") ? "mp4" : "webm"}`, kind: "video" });
      setFeedback("videoSuccess");
    } catch {
      if (fence.isCurrent()) setFeedback("videoError");
    } finally {
      if (fence.isCurrent()) setRecording(false);
    }
  };
  return (
    <fieldset className={styles.workspace} disabled={recording}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{t("eyebrow")}</p>
          <h1>{t("title")}</h1>
          <p>{t("description")}</p>
        </div>
        <div className={styles.headerLinks}>
          <Link href="/dashboard/wardrobe/extract">
            <Sparkles size={16} />
            {te("title")}
          </Link>
          <Link href="/dashboard/wardrobe/3d">
            <ArrowLeft size={16} />
            {t("backToRack")}
          </Link>
          <Link
            className={styles.primaryLink}
            href={fittingHref || "/dashboard/wardrobe/tryon"}
          >
            <Camera size={17} />
            {t("tryOn")}
          </Link>
        </div>
      </header>
      <div className={styles.layout}>
        <section className={styles.showroom} aria-label={t("previewTitle")}>
          <div className={styles.stageTop}>
            <h2>{t("previewTitle")}</h2>
            <div className={styles.segment} aria-label={t("modelLabel")}>
              {(["female", "male"] as const).map((model) => (
                <button
                  key={model}
                  type="button"
                  aria-pressed={config.model === model}
                  disabled={
                    model === "male" && selectedGroups.includes("dresses")
                  }
                  onClick={() => {
                    setAutoRotate(false);
                    if (model === "male") setSampleDress(false);
                    setConfig((previous) => normalizeAvatarConfig({ ...previous, model }));
                  }}
                >
                  {t(model === "female" ? "modelFemale" : "modelMale")}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.presentationModes} role="group" aria-label={t("modelModeLabel")}>
            <button type="button" aria-pressed={editorial} disabled={ids.length > 0} onClick={() => setConfig((previous) => ({ ...previous, renderMode: "editorial" }))}>
              <Sparkles size={15} />{t("editorialMode")}
            </button>
            <button type="button" aria-pressed={!editorial} onClick={() => setConfig((previous) => ({ ...previous, renderMode: undefined }))}>
              {t("sampleMode")}
            </button>
          </div>
          {ids.length > 0 && <p className={styles.notice}>{t("editorialSelectionHint")}</p>}
          <div className={`${styles.stage} ${styles[config.light]}`}>
            <div className={styles.stageEdition} aria-hidden="true">
              <span>{t("dailyEdit")}</span>
              <strong>
                {editorial ? String(editorialLooks(config.model).indexOf(config.editorialLook) + 1).padStart(2, "0") : String(
                  AVATAR_PRESET_ORDER.indexOf(config.preset) + 1,
                ).padStart(2, "0")}
                <i> / {editorial ? String(editorialLooks(config.model).length).padStart(2, "0") : "06"}</i>
              </strong>
            </div>
            <span className={styles.stageWord} aria-hidden="true">
              DADA
            </span>
            <div className={styles.scene}>
              <Scene
                key={`${config.renderMode ?? "sample"}:${config.model}:${retry}`}
                config={{ ...config, palette, garments }}
                framing={framing}
                dressMode={dressMode}
                showOuterwear={showOuterwear}
                autoRotate={autoRotate && !reducedMotion}
                reducedMotion={reducedMotion}
                ariaLabel={t("previewTitle")}
                onRotationChange={onRotationChange}
                onZoomChange={onZoomChange}
                onReady={onReady}
                onError={onError}
                onController={onController}
              />
            </div>
            {<button
              className={`${styles.lookArrow} ${styles.lookPrevious}`}
              type="button"
              aria-label={t("previousLook")}
              onClick={() => editorial ? chooseEditorialLook(stepEditorialLook(config.editorialLook, -1, config.model)) : choosePreset(stepAvatarPreset(config.preset, -1))}
            >
              <ArrowLeft size={20} />
            </button>}
            {<button
              className={`${styles.lookArrow} ${styles.lookNext}`}
              type="button"
              aria-label={t("nextLook")}
              onClick={() => editorial ? chooseEditorialLook(stepEditorialLook(config.editorialLook, 1, config.model)) : choosePreset(stepAvatarPreset(config.preset, 1))}
            >
              <ArrowRight size={20} />
            </button>}
            {!ready && (
              <div
                className={styles.overlay}
                role={sceneError?.key === modelKey ? "alert" : "status"}
              >
                {sceneError?.key === modelKey ? (
                  <>
                    <p>
                      {t(
                        sceneError.kind === "webgl"
                          ? "webglError"
                          : "modelError",
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => setRetry((value) => value + 1)}
                    >
                      {t("retry")}
                    </button>
                  </>
                ) : (
                  <>
                    <Loader2 className={styles.spinner} size={26} />
                    <p>{t("loadingModel")}</p>
                  </>
                )}
              </div>
            )}
            <div className={styles.stageBadge}>
              <span />
              {editorial ? editorialLook : t(PRESET_KEYS[config.preset])}
            </div>
            <div className={styles.orbitButtons}>
              <button
                type="button"
                aria-label={t("rotateLeft")}
                onClick={() => rotate(-30)}
              >
                <RotateCcw size={19} />
              </button>
              <button
                type="button"
                aria-label={t(autoRotate ? "pauseRotation" : "autoRotate")}
                aria-pressed={autoRotate}
                disabled={reducedMotion}
                onClick={() => setAutoRotate((value) => !value)}
              >
                {autoRotate ? <Pause size={19} /> : <RotateCw size={19} />}
              </button>
              <button
                type="button"
                aria-label={t("rotateRight")}
                onClick={() => rotate(30)}
              >
                <RotateCw size={19} />
              </button>
            </div>
          </div>
          {editorial ? <EditorialLookRail config={config} choose={chooseEditorialLook} /> : <LookRail config={config} choose={choosePreset} />}
          <div className={styles.viewBar}>
            <div className={styles.segment}>
              {(["full", "portrait"] as const).map((view) => <button
                type="button" key={view} aria-pressed={framing === view}
                onClick={() => setFraming(view)}>
                {t(view === "full" ? "fullBodyView" : "portraitView")}
              </button>)}
            </div>
            <div className={styles.segment}>
              {[
                ["front", 0],
                ["side", 90],
                ["back", 180],
              ].map(([key, angle]) => (
                <button
                  type="button"
                  key={key}
                  aria-pressed={Math.abs(config.rotation) === angle}
                  onClick={() => setView(Number(angle))}
                >
                  {t(String(key))}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={styles.textButton}
              onClick={() => {
                setAutoRotate(false);
                setFraming("full");
                setConfig((previous) => ({
                  ...previous,
                  rotation: 0,
                  zoom: 1,
                }));
              }}
            >
              <RotateCcw size={14} />
              {t("resetView")}
            </button>
            <label className={styles.zoom}>
              {t("zoomLabel")}
              <input
                type="range"
                min="0.75"
                max="1.5"
                step="0.05"
                value={config.zoom}
                onChange={(event) => onZoomChange(Number(event.target.value))}
              />
            </label>
          </div>
          <div className={styles.stageOptions}>
            {!editorial && <fieldset>
              <legend>{t("poseLabel")}</legend>
              {(["relaxed", "editorial"] as const).map((pose) => (
                <button
                  type="button"
                  key={pose}
                  aria-pressed={config.pose === pose}
                  onClick={() =>
                    setConfig((previous) => ({ ...previous, pose }))
                  }
                >
                  {t(pose === "relaxed" ? "poseRelaxed" : "poseEditorial")}
                </button>
              ))}
            </fieldset>}
            <fieldset>
              <legend>{t("lightLabel")}</legend>
              {(["daylight", "warm", "night"] as const).map((light) => (
                <button
                  type="button"
                  key={light}
                  aria-pressed={config.light === light}
                  onClick={() =>
                    setConfig((previous) => ({ ...previous, light }))
                  }
                >
                  {t(
                    light === "daylight"
                      ? "lightDaylight"
                      : light === "warm"
                        ? "lightWarm"
                        : "lightNight",
                  )}
                </button>
              ))}
            </fieldset>
          </div>
          <p className={styles.notice}>{t(editorial ? "editorialNotice" : "sampleNotice")}</p>
          {recording && <p role="status" className={styles.notice}>{t("videoRecording")}</p>}
          <div className={styles.exportBar}>
            <button
              type="button"
              className={styles.outlineButton}
              disabled={!ready || exporting}
              onClick={() => void exportImage()}
            >
              {exporting ? <Loader2 size={16} /> : <Download size={16} />}{" "}
              {t(exporting ? "exporting" : "export")}
            </button>
            <button type="button" className={styles.outlineButton} disabled={!ready || exporting || recording || !controller.current?.captureTurntable} onClick={() => void exportVideo()}>
              {recording ? <Loader2 size={16} /> : <Video size={16} />} {t("exportVideo")}
            </button>
            <a
              href={sourceNotice}
              target="_blank"
              rel="noreferrer"
            >
              {t("sourceLink")}
            </a>
          </div>
          {exported && (
            <div className={styles.exportPreview}>
              {exported.kind === "video" ? <video src={exported.url} controls playsInline preload="metadata" aria-label={t("videoPreview")} className={styles.videoPreview} /> : <Image
                src={exported.url}
                alt={t("export")}
                width={120}
                height={160}
                unoptimized
              />}
              <div>
                <p>{t(exported.kind === "video" ? "videoSuccess" : "exportSuccess")}</p>
                <a href={exported.url} download={exported.filename}>
                  {t(exported.kind === "video" ? "exportVideo" : "export")} <Download size={14} />
                </a>
              </div>
            </div>
          )}
        </section>
        <aside className={styles.sidebar}>
          {editorial ? <section className={styles.panel}>
            <h2><Sparkles size={18} />{t("editorialTitle")}</h2>
            <p className={styles.cutsHint}>{t("editorialHint")}</p>
            <button type="button" className={styles.outlineButton} onClick={() => setConfig((previous) => ({ ...previous, renderMode: undefined }))}>{t("cutsTitle")}</button>
          </section> : <section className={styles.panel}>
            <h2>
              <Sparkles size={18} />
              {t("cutsTitle")}
            </h2>
            <p className={styles.cutsHint}>{t("cutsHint")}</p>
            <FashionCuts
              config={config}
              choices={garments}
              locked={selectedGroups}
              dressMode={dressMode}
              showOuterwear={showOuterwear}
              onChange={(slot, variant) =>
                setConfig((previous) => ({
                  ...previous,
                  garments: { ...previous.garments, [slot]: variant },
                }))
              }
            />
            <div className={styles.toggles}>
              <label>
                <input
                  type="checkbox"
                  checked={dressMode}
                  disabled={
                    config.model === "male" ||
                    selectedGroups.some(
                      (slot) =>
                        slot === "tops" ||
                        slot === "bottoms" ||
                        slot === "dresses",
                    )
                  }
                  onChange={(event) => setSampleDress(event.target.checked)}
                />
                {t("showDress")}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showOuterwear}
                  disabled={selectedGroups.includes("outerwear")}
                  onChange={(event) => setSampleOuterwear(event.target.checked)}
                />
                {t("showOuterwear")}
              </label>
            </div>
            {config.model === "male" && (
              <p className={styles.notice}>{t("maleDressNotice")}</p>
            )}
            <div className={styles.palette} aria-label={t("paletteTitle")}>
              {(Object.keys(palette) as (keyof AvatarPalette)[])
                .filter((slot) =>
                  dressMode
                    ? slot !== "tops" && slot !== "bottoms"
                    : slot !== "dresses",
                )
                .map((slot) => (
                  <label key={slot}>
                    <input
                      type="color"
                      aria-label={t(slot)}
                      value={palette[slot]}
                      disabled={selectedGroups.includes(slot)}
                      onChange={(event) =>
                        setConfig((previous) => ({
                          ...previous,
                          palette: {
                            ...previous.palette,
                            [slot]: event.target.value,
                          },
                        }))
                      }
                    />
                    <span>{t(slot)}</span>
                  </label>
                ))}
            </div>
          </section>}
          <section className={styles.panel}>
            <h2>{t("wardrobeTitle")}</h2>
            <label className={styles.search}>
              {t("searchLabel")}
              <input
                value={search}
                placeholder={t("searchPlaceholder")}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div className={styles.categoryTabs}>
              <button
                type="button"
                aria-pressed={group === "all"}
                onClick={() => setGroup("all")}
              >
                {tf("all")}
              </button>
              {FITTING_GROUPS.map((slot) => (
                <button
                  type="button"
                  key={slot}
                  aria-pressed={group === slot}
                  onClick={() => setGroup(slot)}
                >
                  {t(slot)}
                </button>
              ))}
            </div>
            {wardrobe.isLoading ? (
              <p role="status">{t("loadingWardrobe")}</p>
            ) : wardrobe.isError ? (
              <div role="alert">
                <p>{t("wardrobeError")}</p>
                <button type="button" onClick={() => void wardrobe.refetch()}>
                  {t("retry")}
                </button>
              </div>
            ) : !items.length ? (
              <p className={styles.notice}>{t("emptyWardrobe")}</p>
            ) : (
              <div className={styles.garmentGrid}>
                {filtered.map((item) => (
                  <button
                    className={styles.garment}
                    type="button"
                    key={item.id}
                    aria-label={t("chooseItem", { name: label(item) })}
                    aria-pressed={ids.includes(item.id)}
                    disabled={
                      config.model === "male" &&
                      fittingGroupForType(item.type) === "dresses"
                    }
                    onClick={() => chooseItem(item)}
                  >
                    <span className={styles.itemImage}>
                      <RackItemPhoto item={item} name={label(item)} small />
                    </span>
                    <strong>{label(item)}</strong>
                    <small>{typeLabel(item.type)}</small>
                  </button>
                ))}
              </div>
            )}
            {wardrobe.hasMore && (
              <button
                type="button"
                className={styles.textButton}
                disabled={wardrobe.isFetchingMore}
                onClick={() => void wardrobe.loadMore()}
              >
                {t("loadMore")}
              </button>
            )}
            <section
              className={styles.selection}
              aria-label={t("chosenCount", { count: ids.length })}
            >
              <div>
                <strong>{t("chosenCount", { count: ids.length })}</strong>
                {ids.length > 0 && (
                  <button
                    className={styles.textButton}
                    type="button"
                    onClick={() => setIds([])}
                  >
                    {t("clearSelection")}
                  </button>
                )}
              </div>
              <div>
                {ids.map((id) => {
                  const item = selected.find((value) => value.id === id);
                  return (
                    <button
                      type="button"
                      key={id}
                      aria-label={t("removeItem", {
                        name: item ? label(item) : id.slice(0, 8),
                      })}
                      onClick={() =>
                        setIds((previous) =>
                          previous.filter((value) => value !== id),
                        )
                      }
                    >
                      {item ? label(item) : id.slice(0, 8)}
                      <X size={12} />
                    </button>
                  );
                })}
              </div>
            </section>
            {selectionLoading ? (
              <p role="status">{t("selectionLoading")}</p>
            ) : invalidSelection ? (
              <div role="alert" className={styles.error}>
                {t("invalidSelection")}
                {resolved.hasErrors && (
                  <button type="button" onClick={() => void resolved.retry()}>
                    {t("retry")}
                  </button>
                )}
              </div>
            ) : !ids.length ? (
              <p className={styles.notice}>{t("itemsRequired")}</p>
            ) : null}
          </section>
          <section className={styles.panel}>
            <h2>{t("saveTitle")}</h2>
            <label className={styles.formField} htmlFor="avatar-name">
              {t("nameLabel")}
              <input
                id="avatar-name"
                maxLength={80}
                value={name}
                placeholder={t("namePlaceholder")}
                onChange={(event) => {
                  setName(event.target.value);
                  setFeedback(null);
                }}
              />
            </label>
            <label className={styles.formField} htmlFor="avatar-date">
              {t("dateLabel")}
              <input
                id="avatar-date"
                type="date"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setFeedback(null);
                }}
              />
            </label>
            <div className={styles.saveActions}>
              <button
                type="button"
                className={styles.outlineButton}
                disabled={
                  !journal.hydrated ||
                  !validForm ||
                  invalidSelection ||
                  selectionLoading
                }
                onClick={bookmark}
              >
                <Heart size={16} />
                {t("bookmark")}
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={!canSave}
                onClick={() => void save()}
              >
                {saveOutfit.isSaving ? (
                  <Loader2 size={16} />
                ) : (
                  <Check size={16} />
                )}{" "}
                {t(saveOutfit.isSaving ? "savingOutfit" : "saveOutfit")}
              </button>
            </div>
            <Link className={styles.textLink} href="/dashboard/outfits">
              {t("viewOutfits")}
              <ArrowRight size={14} />
            </Link>
            <p className={styles.notice}>{t("localOnlyHint")}</p>
          </section>
        </aside>
      </div>
      {feedback && !(feedback === "deleteError" && deleteTarget) && (
        <p
          className={
            feedback.endsWith("Error") || feedback.endsWith("Failed")
              ? styles.error
              : styles.feedback
          }
          role={feedback.endsWith("Error") || feedback.endsWith("Failed") ? "alert" : "status"}
        >
          {t(feedback)}
        </p>
      )}
      {journal.error && (
        <p role="alert" className={styles.error}>
          {t("bookmarkFailed")}
        </p>
      )}
      <section className={styles.journal}>
        <div className={styles.journalHeading}>
          <div>
            <h2>{t("journalTitle")}</h2>
            <p>{t("journalHint")}</p>
          </div>
          <nav
            className={styles.journalNavigation}
            aria-label={t("journalTitle")}
          >
            <button
              type="button"
              aria-label={t("previousSavedLook")}
              disabled={!previousSaved}
              onClick={() => previousSaved && restore(previousSaved)}
            >
              <ArrowLeft size={17} />
            </button>
            <button
              type="button"
              aria-label={t("nextSavedLook")}
              disabled={!nextSaved}
              onClick={() => nextSaved && restore(nextSaved)}
            >
              <ArrowRight size={17} />
            </button>
          </nav>
        </div>
        {!journal.entries.length ? (
          <p className={styles.notice}>{t("journalEmpty")}</p>
        ) : (
          <div className={styles.journalGrid}>
            {journal.entries.map((look) => (
              <article key={look.id}>
                <button
                  type="button"
                  className={styles.restore}
                  aria-label={t("restoreLook", { name: look.name })}
                  onClick={() => restore(look)}
                >
                  {look.thumbnail ? (
                    <Image
                      className={styles.journalThumbnail}
                      src={look.thumbnail}
                      alt=""
                      width={160}
                      height={220}
                      unoptimized
                    />
                  ) : (
                    <div className={styles.journalColors}>
                      {Object.values(look.config.palette)
                        .slice(0, 3)
                        .map((color, index) => (
                          <span key={index} style={{ background: color }} />
                        ))}
                    </div>
                  )}
                  <time dateTime={look.date}>{look.date}</time>
                  <h3>{look.name}</h3>
                  <small>
                    {t(
                      look.config.model === "female"
                        ? "modelFemale"
                        : "modelMale",
                    )}
                  </small>
                </button>
                <button
                  type="button"
                  className={styles.favoriteButton}
                  aria-label={t(look.favorite ? "unfavorite" : "favorite")}
                  aria-pressed={look.favorite}
                  onClick={() => {
                    try {
                      journal.save({ ...look, favorite: !look.favorite });
                    } catch {
                      setFeedback("bookmarkFailed");
                    }
                  }}
                >
                  <Heart
                    size={17}
                    fill={look.favorite ? "currentColor" : "none"}
                  />
                </button>
                <button
                  type="button"
                  className={`${styles.favoriteButton} ${styles.deleteButton}`}
                  aria-label={t("deleteLook", { name: look.name })}
                  onClick={() => {
                    setDeleteTarget(look);
                    setFeedback(null);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
      <Modal
        opened={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t("deleteConfirmTitle")}
        closeButtonProps={{ "aria-label": tc("close") }}
        centered
      >
        <p>
          {t("deleteConfirmDescription", { name: deleteTarget?.name ?? "" })}
        </p>
        {feedback === "deleteError" && (
          <p className={styles.error} role="alert">
            {t("deleteError")}
          </p>
        )}
        <div className={styles.saveActions}>
          <MantineButton
            type="button"
            variant="default"
            onClick={() => {
              setDeleteTarget(null);
              if (feedback === "deleteError") setFeedback(null);
            }}
          >
            {t("deleteCancel")}
          </MantineButton>
          <MantineButton
            type="button"
            color="red"
            onClick={() => {
              if (!deleteTarget) return;
              try {
                if (!journal.remove(deleteTarget.id)) {
                  setFeedback("deleteError");
                  return;
                }
                if (activeSaved === deleteTarget.id) setActiveSaved(null);
                setDeleteTarget(null);
                setFeedback("deleteSuccess");
              } catch {
                setFeedback("deleteError");
              }
            }}
          >
            {t("deleteConfirm")}
          </MantineButton>
        </div>
      </Modal>
      <footer className={styles.footer}>
        <p>{t("reconstructionNotice")}</p>
        <p>
          {t(editorial ? "editorialPrivacyHint" : "sourceDescription")}{" "}
          <a
            href={sourceNotice}
            target="_blank"
            rel="noreferrer"
          >
            {editorial ? "Tripo Studio" : t("modelSource")}
          </a>
        </p>
      </footer>
    </fieldset>
  );
}
