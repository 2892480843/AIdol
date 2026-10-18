import type { AvatarConfig, AvatarModelId } from "./avatar-studio";

export const EDITORIAL_LOOKS = [undefined, "street", "refined", "dopamine"] as const;

export function editorialLooks(model: AvatarModelId): readonly AvatarConfig["editorialLook"][] {
  return model === "female" ? EDITORIAL_LOOKS : EDITORIAL_LOOKS.slice(0, -1);
}

export function editorialLookKey(model: AvatarModelId, look?: AvatarConfig["editorialLook"]) {
  if (look === "dopamine") return model === "female" ? "editorialFemaleDopamine" : "editorialMaleRefined";
  if (look === "refined") return model === "female" ? "editorialFemaleRefined" : "editorialMaleRefined";
  return look === "street"
    ? model === "female" ? "editorialFemaleStreet" : "editorialMaleStreet"
    : model === "female" ? "editorialFemaleLook" : "editorialMaleLook";
}

export function stepEditorialLook(current: AvatarConfig["editorialLook"], direction: -1 | 1, model: AvatarModelId = "female"): AvatarConfig["editorialLook"] {
  const looks = editorialLooks(model);
  const index = Math.max(0, looks.indexOf(current));
  return looks[(index + direction + looks.length) % looks.length];
}

/** Complete generated outfits must keep a distinct loader identity and wardrobe contract. */
export function avatarSceneIdentity(config: AvatarConfig): string {
  const look = availableLook(config);
  return config.renderMode === "editorial"
    ? `editorial:${config.model}:${look ?? "original"}`
    : `sample:${config.model}`;
}

export function avatarSceneAsset(config: AvatarConfig, compact: boolean): string {
  const look = availableLook(config);
  if (config.renderMode === "editorial" && look === "dopamine")
    return `/models/avatar/dopamine-v1/female${compact ? "-mobile" : ""}.glb`;
  if (config.renderMode === "editorial" && look === "refined")
    return `/models/avatar/beauty-v2/${config.model}${compact ? "-mobile" : ""}.glb`;
  return config.renderMode === "editorial"
    ? `/models/avatar/editorial-v1/${config.model}${look === "street" ? "-street" : ""}${compact ? "-mobile" : ""}.glb`
    : `/models/avatar/v2/${config.model}.glb`;
}

export function editorialThumbnail(config: AvatarConfig): string {
  const look = availableLook(config);
  if (look === "dopamine") return "/models/avatar/dopamine-v1/female.webp";
  if (look === "refined") return `/models/avatar/beauty-v2/${config.model}.webp`;
  return `/models/avatar/editorial-v1/${config.model}${look === "street" ? "-street" : ""}.webp`;
}

function availableLook(config: AvatarConfig): AvatarConfig["editorialLook"] {
  return config.model === "male" && config.editorialLook === "dopamine" ? "refined" : config.editorialLook;
}

/** Cache transfer bytes only; model selection, parsing and renderer fidelity are unchanged. */
export function avatarSceneUrl(config: AvatarConfig, compact: boolean): string {
  const path = avatarSceneAsset(config, compact);
  const revision = process.env.NEXT_PUBLIC_AVATAR_ASSET_REVISION;
  return revision ? `${path}?v=${revision}` : path;
}
