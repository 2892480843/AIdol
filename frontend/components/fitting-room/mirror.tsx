"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { UserRound, Camera, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { TryOnTaskPreview } from "@/lib/looks/tryon-types";
import styles from "./workspace.module.css";

export function FittingMirror({
  photo,
  task,
  canCompare,
  stream,
  cameraPending,
  generating,
  onCapture,
  onStop,
}: {
  photo: string | null;
  task: TryOnTaskPreview | undefined;
  canCompare: boolean;
  stream: MediaStream | null;
  cameraPending: boolean;
  generating: boolean;
  onCapture(video: HTMLVideoElement): void;
  onStop(): void;
}) {
  const t = useTranslations("wardrobe.fitting");
  const [view, setView] = useState<"result" | "photo" | "compare">("result");
  const [split, setSplit] = useState(50);
  useEffect(() => {
    if (!canCompare) setView("result");
  }, [canCompare]);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = video.current;
    if (el) {
      el.srcObject = stream;
      if (stream) void el.play().catch(() => {});
    }
    return () => {
      if (el) el.srcObject = null;
    };
  }, [stream]);
  const result = task?.resultImageUrl;
  const shown = view === "photo" ? photo : result || photo;
  return (
    <section className={styles.mirrorPanel} aria-label={t("mirrorTitle")}>
      <div className={styles.mirrorHeading}>
        <h2>{t("mirrorTitle")}</h2>
        {generating && (
          <span role="status">
            <Loader2 size={14} className="animate-spin" />
            {t("generating")}
          </span>
        )}
      </div>
      <div
        className={styles.viewTabs}
        role="group"
        aria-label={t("mirrorTitle")}
      >
        <button
          type="button"
          aria-pressed={view === "result"}
          onClick={() => setView("result")}
        >
          {t("resultTab")}
        </button>
        <button
          type="button"
          aria-pressed={view === "photo"}
          disabled={!photo}
          onClick={() => setView("photo")}
        >
          {t("photoTab")}
        </button>
        <button
          type="button"
          aria-pressed={view === "compare"}
          disabled={!canCompare || !photo || !result}
          onClick={() => setView("compare")}
        >
          {t("compareTab")}
        </button>
      </div>
      <div className={styles.mirror}>
        {stream ? (
          <video
            ref={video}
            autoPlay
            muted
            playsInline
            className={styles.camera}
            aria-label={t("mirrorTitle")}
          />
        ) : view === "compare" && canCompare && photo && result ? (
          <>
            <Image
              fill
              unoptimized
              src={photo}
              alt={t("photoTab")}
              sizes="(max-width:760px) 100vw,50vw"
            />
            <div
              className={styles.afterImage}
              style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
            >
              <Image
                fill
                unoptimized
                src={result}
                alt={t("resultTab")}
                sizes="(max-width:760px) 100vw,50vw"
              />
            </div>
            <span
              className={styles.splitLine}
              style={{ left: `${split}%` }}
              aria-hidden="true"
            />
          </>
        ) : shown ? (
          <Image
            fill
            unoptimized
            src={shown}
            alt={t(view === "photo" || !result ? "photoTab" : "resultTab")}
            sizes="(max-width:760px) 100vw,50vw"
          />
        ) : (
          <div className={styles.emptyMirror}>
            <UserRound size={92} strokeWidth={0.8} aria-hidden="true" />
            <h3>{t("emptyTitle")}</h3>
            <p>{t("emptyHint")}</p>
          </div>
        )}
        {cameraPending && (
          <div className={styles.mirrorOverlay} role="status">
            <Loader2 className="animate-spin" />
            {t("cameraStarting")}
          </div>
        )}
        {task?.status === "succeeded" && !result && !stream && (
          <p className={styles.mirrorStatus} role="status">
            {t(task.resultImageError ? "resultError" : "resultLoading")}
          </p>
        )}
        {stream && (
          <div className={styles.cameraControls}>
            <Button
              onClick={() => {
                if (video.current) onCapture(video.current);
              }}
            >
              <Camera size={16} />
              {t("capture")}
            </Button>
            <Button variant="outline" onClick={onStop}>
              {t("closeCamera")}
            </Button>
          </div>
        )}
      </div>
      {view === "compare" && canCompare && photo && result && !stream && (
        <label className={styles.compareSlider}>
          <span>{t("compareLabel")}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={split}
            onChange={(event) => setSplit(Number(event.target.value))}
          />
        </label>
      )}
      <p className={styles.hint}>{t("latencyNotice")}</p>
      <p className={styles.hint}>{t("generatedNotice")}</p>
      {result && (
        <a href={result} download="dada-tryon.jpg" className={styles.download}>
          {t("download")}
        </a>
      )}
    </section>
  );
}
