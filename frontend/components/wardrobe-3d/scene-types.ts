export type RackGarment = {
  id: string;
  type: string;
  color: string;
  name: string;
};

export type RackSceneMode = "rack" | "focus";

export type RackSceneProps = {
  items: RackGarment[];
  mode?: RackSceneMode;
  selectedId: string | null;
  rotation: number;
  zoom: number;
  light: "day" | "studio";
  reducedMotion: boolean;
  onSelect: (id: string) => void;
  onRotationChange: (degrees: number) => void;
  onReady: () => void;
  onUnavailable: () => void;
  ariaLabel?: string;
};
