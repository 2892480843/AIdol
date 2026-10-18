"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import {
  AVATAR_PRESET_ORDER,
  type AvatarConfig,
  type AvatarGarments,
  type AvatarPalette,
  type AvatarPresetId,
} from "@/lib/avatar-studio";
import { FASHION_GARMENTS, fashionThumbnail } from "@/lib/avatar-fashion";
import styles from "./workspace.module.css";
import { editorialLooks, editorialLookKey, editorialThumbnail } from "@/lib/avatar-editorial";

export const PRESET_KEYS = {
  sweet: "presetSweet",
  minimal: "presetMinimal",
  street: "presetStreet",
  relaxed: "presetRelaxed",
  elegant: "presetElegant",
  sport: "presetSport",
} as const;

export function LookRail({
  config,
  choose,
}: {
  config: AvatarConfig;
  choose: (preset: AvatarPresetId) => void;
}) {
  const t = useTranslations("wardrobe.avatar");
  return (
    <div className={styles.lookRail} aria-label={t("presetsTitle")}>
      {AVATAR_PRESET_ORDER.map((preset, index) => (
        <button
          type="button"
          key={preset}
          aria-label={t(PRESET_KEYS[preset])}
          aria-pressed={config.preset === preset}
          onClick={() => choose(preset)}
        >
          <span className={styles.lookThumbnail}>
            <Image
              src={fashionThumbnail(config.model, preset)}
              alt=""
              width={160}
              height={220}
              sizes="100px"
            />
            <span className={styles.lookNumber}>
              {String(index + 1).padStart(2, "0")}
            </span>
            {config.preset === preset && (
              <Check size={13} className={styles.lookCheck} />
            )}
          </span>
          <span>{t(PRESET_KEYS[preset])}</span>
        </button>
      ))}
    </div>
  );
}

export function EditorialLookRail({ config, choose }: {
  config: AvatarConfig;
  choose: (look: AvatarConfig["editorialLook"]) => void;
}) {
  const t = useTranslations("wardrobe.avatar");
  return <div className={`${styles.lookRail} ${styles.editorialRail}`} role="group" aria-label={t("editorialCollection")}>
    {editorialLooks(config.model).map((look, index) => <button type="button" key={look ?? "original"}
      aria-label={t(editorialLookKey(config.model, look))}
      aria-pressed={config.editorialLook === look} onClick={() => choose(look)}>
      <span className={styles.lookThumbnail}>
        <Image src={editorialThumbnail({ ...config, editorialLook: look })} alt="" width={160} height={220} sizes="96px" />
        <span className={styles.lookNumber}>{String(index + 1).padStart(2, "0")}</span>
        {config.editorialLook === look && <Check size={13} className={styles.lookCheck} />}
      </span>
      <span>{t(editorialLookKey(config.model, look))}</span>
    </button>)}
  </div>;
}

export function FashionCuts({
  config,
  choices,
  locked,
  dressMode,
  showOuterwear,
  onChange,
}: {
  config: AvatarConfig;
  choices: AvatarGarments;
  locked: (string | null)[];
  dressMode: boolean;
  showOuterwear: boolean;
  onChange: (slot: keyof AvatarPalette, variant: string) => void;
}) {
  const t = useTranslations("wardrobe.avatar");
  const options = FASHION_GARMENTS[config.model];
  const slots = (Object.keys(options) as (keyof AvatarPalette)[]).filter(
    (slot) => {
      if (slot === "outerwear") return showOuterwear;
      if (slot === "dresses") return dressMode;
      if (slot === "tops" || slot === "bottoms") return !dressMode;
      return true;
    },
  );
  return (
    <div className={styles.cutList}>
      {slots.map((slot) => (
        <label key={slot}>
          <span>{t(slot)}</span>
          <select
            aria-label={t("sampleCut", { name: t(slot) })}
            value={choices[slot] || options[slot][0] || ""}
            disabled={locked.includes(slot) || options[slot].length < 2}
            onChange={(event) => onChange(slot, event.target.value)}
          >
            {options[slot].map((id) => (
              <option key={id} value={id}>
                {t(`garmentNames.${id}`)}
              </option>
            ))}
          </select>
          {locked.includes(slot) && <small>{t("inventoryCut")}</small>}
        </label>
      ))}
    </div>
  );
}
