import type {
  AvatarConfig,
  AvatarGarments,
  AvatarModelId,
  AvatarPalette,
  AvatarPresetId,
} from "./avatar-studio";
import type { Item } from "./types";
import { fittingGroupForType } from "./fitting-room";

export const FASHION_GARMENTS = {
  female: {
    tops: ["camisole", "cropped-tee", "knit"],
    bottoms: ["tailored", "cargo", "mini-skirt"],
    dresses: ["halter", "shift"],
    outerwear: ["blazer"],
    shoes: ["sneakers", "ankle-boots", "ballet-flats"],
  },
  male: {
    tops: ["knit", "tee", "polo"],
    bottoms: ["tailored", "cargo"],
    dresses: [],
    outerwear: ["blazer"],
    shoes: ["sneakers", "ankle-boots"],
  },
} as const;

export const FASHION_LOOKS: Record<
  AvatarModelId,
  Record<AvatarPresetId, AvatarGarments>
> = {
  female: {
    sweet: {
      tops: "cropped-tee",
      bottoms: "mini-skirt",
      dresses: "shift",
      shoes: "ballet-flats",
      outerwear: "blazer",
    },
    minimal: {
      tops: "camisole",
      bottoms: "tailored",
      dresses: "shift",
      shoes: "ballet-flats",
      outerwear: "blazer",
    },
    street: {
      tops: "cropped-tee",
      bottoms: "cargo",
      dresses: "shift",
      shoes: "ankle-boots",
      outerwear: "blazer",
    },
    relaxed: {
      tops: "knit",
      bottoms: "tailored",
      dresses: "shift",
      shoes: "sneakers",
      outerwear: "blazer",
    },
    elegant: {
      tops: "camisole",
      bottoms: "tailored",
      dresses: "halter",
      shoes: "ballet-flats",
      outerwear: "blazer",
    },
    sport: {
      tops: "cropped-tee",
      bottoms: "cargo",
      dresses: "shift",
      shoes: "sneakers",
      outerwear: "blazer",
    },
  },
  male: {
    sweet: {
      tops: "polo",
      bottoms: "tailored",
      shoes: "sneakers",
      outerwear: "blazer",
    },
    minimal: {
      tops: "polo",
      bottoms: "tailored",
      shoes: "ankle-boots",
      outerwear: "blazer",
    },
    street: {
      tops: "tee",
      bottoms: "cargo",
      shoes: "ankle-boots",
      outerwear: "blazer",
    },
    relaxed: {
      tops: "knit",
      bottoms: "tailored",
      shoes: "sneakers",
      outerwear: "blazer",
    },
    elegant: {
      tops: "polo",
      bottoms: "tailored",
      shoes: "ankle-boots",
      outerwear: "blazer",
    },
    sport: {
      tops: "tee",
      bottoms: "cargo",
      shoes: "sneakers",
      outerwear: "blazer",
    },
  },
};

/** Real inventory overrides a sample slot's cut; this is still a sample, not a garment scan. */
export function fashionGarments(
  config: AvatarConfig,
  items: Item[] = [],
): AvatarGarments {
  const available = FASHION_GARMENTS[config.model];
  const result: AvatarGarments = {
    ...FASHION_LOOKS[config.model][config.preset],
  };
  for (const slot of Object.keys(available) as (keyof AvatarPalette)[]) {
    const chosen = config.garments?.[slot];
    if (chosen && (available[slot] as readonly string[]).includes(chosen))
      result[slot] = chosen;
  }
  for (const item of items) {
    const slot = fittingGroupForType(item.type);
    const type = item.type.normalize("NFKC").trim().toLowerCase();
    if (!slot) continue;
    if (slot === "tops") {
      result.tops = ["sweater", "hoodie", "cardigan"].includes(type)
        ? "knit"
        : config.model === "female"
          ? type === "tank-top"
            ? "camisole"
            : "cropped-tee"
          : ["shirt", "polo"].includes(type)
            ? "polo"
            : "tee";
    } else if (slot === "bottoms")
      result.bottoms =
        type === "skirt" && config.model === "female"
          ? "mini-skirt"
          : "tailored";
    else if (slot === "shoes")
      result.shoes = type === "boots" ? "ankle-boots" : "sneakers";
  }
  return result;
}

export function fashionThumbnail(model: AvatarModelId, preset: AvatarPresetId) {
  return `/models/avatar/v2/thumbs/${model}-${preset}.webp`;
}
