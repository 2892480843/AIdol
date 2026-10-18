import type { AvatarConfig } from "@/lib/avatar-studio";

export type AvatarSceneController = {
  capture: (options?: { reportError?: boolean; }) => Promise<Blob>;
  captureTurntable?: () => Promise<Blob>;
};

export type AvatarSceneProps = {
  config: AvatarConfig;
  framing?: "full" | "portrait";
  dressMode: boolean;
  showOuterwear: boolean;
  autoRotate: boolean;
  reducedMotion: boolean;
  ariaLabel: string;
  onRotationChange: (degrees: number) => void;
  onZoomChange: (zoom: number) => void;
  onReady: () => void;
  onError: (kind: "model" | "webgl" | "export") => void;
  onController: (value: AvatarSceneController | null) => void;
};

export type AvatarLayer =
  | "tops"
  | "bottoms"
  | "dresses"
  | "outerwear"
  | "shoes"
  | "body"
  | "hair"
  | "base"
  | "other";

export type AvatarPalette = Record<
  "tops" | "bottoms" | "dresses" | "outerwear" | "shoes",
  string
>;
