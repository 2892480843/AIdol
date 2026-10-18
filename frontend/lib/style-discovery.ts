import { MODEL_LOOKS } from "@/lib/model-looks";

export const STYLE_IDS = [
  "street",
  "sport",
  "cityboy",
  "clean",
  "retro",
  "french",
] as const;

export type StyleId = (typeof STYLE_IDS)[number];

export interface StyleCategory {
  readonly id: StyleId;
  readonly palette: readonly [string, string, string];
  readonly formulaId: string;
}

export interface StyleLook {
  readonly id: string;
  readonly key: string;
  readonly styleId: StyleId;
  readonly src: string;
  readonly frame: {
    readonly row: 0 | 1;
    readonly column: 0 | 1;
  };
}

export const STYLE_CATEGORIES = [
  {
    id: "street",
    palette: ["#45484a", "#72765b", "#e2dccf"],
    formulaId: "balance",
  },
  {
    id: "sport",
    palette: ["#7f3548", "#f0e3c9", "#ead98c"],
    formulaId: "balance",
  },
  {
    id: "cityboy",
    palette: ["#6c7c6d", "#d6cab3", "#eff0e8"],
    formulaId: "easy-layers",
  },
  {
    id: "clean",
    palette: ["#d8e4ea", "#f6f3eb", "#3c4653"],
    formulaId: "everyday",
  },
  {
    id: "retro",
    palette: ["#7b3444", "#f0e6d2", "#6e87a1"],
    formulaId: "layer",
  },
  {
    id: "french",
    palette: ["#263245", "#eee5d6", "#aa3e43"],
    formulaId: "tonal",
  },
] as const satisfies readonly StyleCategory[];

/** Fictional model demonstrations, never photos of the user's clothes or try-on results. */
export const STYLE_LOOKS: readonly StyleLook[] = [
  ...MODEL_LOOKS.map((look): StyleLook => ({
    ...look,
    styleId:
      look.key === "casual" || look.key === "office" ? "clean" : "cityboy",
  })),
  {
    id: "style-street-bomber",
    key: "streetBomber",
    styleId: "street",
    src: "/images/style-discovery-a-20261017.webp",
    frame: { row: 0, column: 0 },
  },
  {
    id: "style-street-shell",
    key: "streetShell",
    styleId: "street",
    src: "/images/style-discovery-a-20261017.webp",
    frame: { row: 0, column: 1 },
  },
  {
    id: "style-sport-track",
    key: "sportTrack",
    styleId: "sport",
    src: "/images/style-discovery-a-20261017.webp",
    frame: { row: 1, column: 0 },
  },
  {
    id: "style-sport-zip",
    key: "sportZip",
    styleId: "sport",
    src: "/images/style-discovery-a-20261017.webp",
    frame: { row: 1, column: 1 },
  },
  {
    id: "style-retro-argyle",
    key: "retroArgyle",
    styleId: "retro",
    src: "/images/style-discovery-b-20261017.webp",
    frame: { row: 0, column: 0 },
  },
  {
    id: "style-retro-leather",
    key: "retroLeather",
    styleId: "retro",
    src: "/images/style-discovery-b-20261017.webp",
    frame: { row: 0, column: 1 },
  },
  {
    id: "style-french-stripe",
    key: "frenchStripe",
    styleId: "french",
    src: "/images/style-discovery-b-20261017.webp",
    frame: { row: 1, column: 0 },
  },
  {
    id: "style-french-blouse",
    key: "frenchBlouse",
    styleId: "french",
    src: "/images/style-discovery-b-20261017.webp",
    frame: { row: 1, column: 1 },
  },
];

export function parseStyleId(value: string | null): "all" | StyleId {
  return STYLE_IDS.find((id) => id === value) ?? "all";
}

function searchText(value: string): string {
  return value
    .trim()
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ς/g, "σ");
}

export function filterStyleLooks(
  styleId: "all" | StyleId,
  query: string,
  labelForLook: (look: StyleLook) => string,
): StyleLook[] {
  const search = searchText(query);
  return STYLE_LOOKS.filter(
    (look) =>
      (styleId === "all" || look.styleId === styleId) &&
      (!search || searchText(labelForLook(look)).includes(search)),
  );
}
