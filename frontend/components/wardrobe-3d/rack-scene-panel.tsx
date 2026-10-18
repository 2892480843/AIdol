"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useReducedMotion } from "@mantine/hooks";
import {
  ArrowLeft,
  ArrowRight,
  ImageIcon,
  Loader2,
  RotateCcw,
  Sun,
  Lightbulb,
  ZoomIn,
  ZoomOut,
  Focus,
} from "lucide-react";
import type { Item } from "@/lib/types";
import type { RackGarment } from "./scene-types";
import { PhotoRack } from "./photo-rack";
import styles from "./workspace.module.css";

const RackScene = dynamic(() => import("./scene"), { ssr: false });
export function RackScenePanel({
  items,
  photoItems,
  selected,
  name,
  activeIndex,
  total,
  onSelect,
  onMove,
}: {
  items: RackGarment[];
  photoItems: Item[];
  selected: Item;
  name: string;
  activeIndex: number;
  total: number;
  onSelect(id: string): void;
  onMove(direction: number): void;
}) {
  const t = useTranslations("wardrobe.rack");
  const reducedMotion = !!useReducedMotion();
  const [mode, setMode] = useState<"rack" | "focus">("rack");
  const [photoView, setPhotoView] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [rotation, setRotation] = useState(-16);
  const [zoom, setZoom] = useState(1);
  const [light, setLight] = useState<"day" | "studio">("day");
  const ready = useCallback(() => setSceneReady(true), []);
  const fail = useCallback(() => {
    setUnavailable(true);
    setPhotoView(true);
  }, []);
  return (
    <section className={styles.stageSection} aria-label={t("sceneTitle")}>
      <div className={styles.sceneHeading}>
        <span>{t("sceneTitle")}</span>
        <div className={styles.sceneModes}>
          {!photoView && (
            <button
              type="button"
              aria-pressed={mode === "focus"}
              onClick={() => {
                setMode((value) => (value === "rack" ? "focus" : "rack"));
                setZoom(1);
                setRotation(mode === "rack" ? 0 : -16);
              }}
            >
              <Focus size={15} aria-hidden="true" />
              {t(mode === "rack" ? "focusItem" : "backToRack")}
            </button>
          )}
          <button
            type="button"
            aria-pressed={photoView}
            onClick={() => {
              setPhotoView((value) => !value);
              setSceneReady(false);
            }}
            disabled={unavailable}
          >
            <ImageIcon size={15} aria-hidden="true" />
            {t("photoView")}
          </button>
        </div>
      </div>
      <div
        className={styles.stage}
        tabIndex={0}
        aria-label={t(mode === "focus" ? "focusHint" : "sceneHint")}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            onMove(event.key === "ArrowLeft" ? -1 : 1);
          }
        }}
      >
        {!photoView && (
          <RackScene
            mode={mode}
            items={items}
            selectedId={selected.id}
            rotation={rotation}
            zoom={zoom}
            light={light}
            reducedMotion={reducedMotion}
            onSelect={onSelect}
            onRotationChange={setRotation}
            onReady={ready}
            onUnavailable={fail}
            ariaLabel={t("sceneTitle")}
          />
        )}
        {!photoView && !sceneReady && (
          <div className={styles.rendering} role="status">
            <Loader2 size={20} className="animate-spin" aria-hidden="true" />
            {t("rendering")}
          </div>
        )}
        {photoView && (
          <PhotoRack
            items={photoItems}
            selectedId={selected.id}
            name={(item) =>
              item.id === selected.id ? name : item.name || t("unnamedItem")
            }
            onSelect={onSelect}
          />
        )}
        <div className={styles.sceneIndex} aria-live="polite">
          {String(activeIndex + 1).padStart(2, "0")} /{" "}
          {String(total).padStart(2, "0")}
        </div>
      </div>
      {unavailable && (
        <p className={styles.fallback} role="status">
          {t("unavailable")}
        </p>
      )}
      <div className={styles.sceneControls}>
        <div>
          <button
            type="button"
            aria-label={t("previous")}
            onClick={() => onMove(-1)}
            disabled={total < 2}
          >
            <ArrowLeft size={18} />
          </button>
          <button
            type="button"
            aria-label={t("next")}
            onClick={() => onMove(1)}
            disabled={total < 2}
          >
            <ArrowRight size={18} />
          </button>
        </div>
        {!photoView && (
          <>
            <div>
              <button type="button" onClick={() => setRotation(0)}>
                {t("frontView")}
              </button>
              <button type="button" onClick={() => setRotation(-28)}>
                {t("angleView")}
              </button>
            </div>
            <div>
              <button
                type="button"
                aria-label={t("zoomOut")}
                disabled={zoom <= 0.8}
                onClick={() => setZoom((v) => Math.max(0.8, v - 0.1))}
              >
                <ZoomOut size={17} />
              </button>
              <button
                type="button"
                aria-label={t("zoomIn")}
                disabled={zoom >= 1.4}
                onClick={() => setZoom((v) => Math.min(1.4, v + 0.1))}
              >
                <ZoomIn size={17} />
              </button>
              <button
                type="button"
                aria-label={t("resetView")}
                onClick={() => {
                  setZoom(1);
                  setRotation(mode === "focus" ? 0 : -16);
                }}
              >
                <RotateCcw size={16} />
              </button>
              <button
                type="button"
                aria-label={t(light === "day" ? "studioLight" : "dayLight")}
                onClick={() =>
                  setLight((v) => (v === "day" ? "studio" : "day"))
                }
              >
                {light === "day" ? <Lightbulb size={17} /> : <Sun size={17} />}
              </button>
            </div>
          </>
        )}
      </div>
      {!photoView && (
        <label className={styles.rotationControl}>
          <span>{t("rotateLabel")}</span>
          <input
            type="range"
            min={mode === "focus" ? -180 : -70}
            max={mode === "focus" ? 180 : 70}
            step={1}
            value={rotation}
            onChange={(event) => setRotation(Number(event.target.value))}
          />
          <span aria-hidden="true">{Math.round(rotation)}°</span>
        </label>
      )}
      <p className={styles.hint}>
        {t(
          photoView
            ? "photoRailHint"
            : mode === "focus"
              ? "focusHint"
              : "sceneHint",
        )}
      </p>
    </section>
  );
}
