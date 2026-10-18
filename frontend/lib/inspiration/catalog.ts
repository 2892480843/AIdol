import type { OutfitFormula } from "./matching";

export interface StyleCreator {
  id: string;
  name: string;
  publication: string;
  platform: "article" | "douyin";
  url: string;
  profileUrl?: string;
}
export interface EditorialFormula extends OutfitFormula {
  key: string;
  creatorId: string;
  palette: string[];
}

// Our editorial exercises, adapted from public methods. Creators have not endorsed this product.
export const STYLE_CREATORS: StyleCreator[] = [
  {
    id: "alyssa",
    name: "Alyssa Beltempo",
    publication: "Shop your closet",
    platform: "article",
    url: "https://alyssabeltempo.substack.com/p/decluttering-doesnt-have-to-be-scary",
  },
  {
    id: "caroline",
    name: "Caroline Joy",
    publication: "Un-Fancy",
    platform: "article",
    url: "https://www.un-fancy.com/capsule-wardrobe-101/how-to-build-a-capsule-wardrobe/",
  },
  {
    id: "imogen",
    name: "Imogen Lamport",
    publication: "Inside Out Style",
    platform: "article",
    url: "https://insideoutstyleblog.com/2020/02/getting-the-balance-right-with-your-colour-contrast.html",
  },
  {
    id: "jamie",
    name: "Jamie-Lee",
    publication: "Mademoiselle",
    platform: "article",
    url: "https://www.mademois-elle.com/three-ways-to-create-balance-in-an-outfit/",
  },
  {
    id: "becky",
    name: "黎贝卡团队",
    publication: "Becky’s Fantasy",
    platform: "article",
    url: "https://www.beckysfantasy.com/n_10252",
  },
  {
    id: "jean",
    name: "Jean Wang",
    publication: "Extra Petite",
    platform: "article",
    url: "https://www.extrapetite.com/2021/07/how-to-style-straight-leg-jeans-everlane-levis-petite-outfits.html",
  },
  {
    id: "yanbaiwan",
    name: "盐百万",
    publication: "Douyin",
    platform: "douyin",
    url: "https://www.douyin.com/video/7655584129869688177",
    profileUrl:
      "https://www.douyin.com/user/MS4wLjABAAAArqPU_WLvIM5pin6_H_Ck1kKuptKwqDy2zKbApxwuRuX0ea6o3WXo762no-rFQlTO",
  },
  {
    id: "xiebao",
    name: "蟹煲",
    publication: "Douyin",
    platform: "douyin",
    url: "https://www.douyin.com/video/7694687869555022479",
    profileUrl:
      "https://www.douyin.com/user/MS4wLjABAAAATqlQR24F8_lSDuHzETTXT9ntS9DtyulEVvrMcTTJQVoUTY3QfD3l_8uIaGYB1scB",
  },
  {
    id: "changxin",
    name: "常鑫",
    publication: "Douyin",
    platform: "douyin",
    url: "https://www.douyin.com/video/7687539904575090600",
    profileUrl:
      "https://www.douyin.com/user/MS4wLjABAAAA9hCZ4YkAyenvy0zXpQ0lmqMX6kpQhucEC-xIpFdNFqru9g_q4YnmL6tMJg2VQLgU",
  },
];
const tops = [
  "shirt",
  "t-shirt",
  "top",
  "polo",
  "blouse",
  "tank-top",
  "sweater",
];
const bottoms = ["pants", "jeans", "skirt", "shorts"];
const shoes = ["shoes", "sneakers", "boots", "sandals"];
export const STYLE_FORMULAS: EditorialFormula[] = [
  {
    id: "everyday",
    key: "everyday",
    creatorId: "alyssa",
    occasion: "casual",
    palette: ["#ece5d7", "#2f3336", "#a57952"],
    slots: [
      { id: "top", types: tops },
      { id: "bottom", types: bottoms },
      { id: "shoes", types: shoes },
      { id: "bag", types: ["bag"], optional: true },
    ],
  },
  {
    id: "layer",
    key: "layer",
    creatorId: "caroline",
    occasion: "office",
    palette: ["#bbaa91", "#ede9df", "#44413b"],
    slots: [
      {
        id: "top",
        types: ["shirt", "blouse", "polo", "t-shirt", "top"],
        color: "neutral",
      },
      { id: "bottom", types: ["pants", "jeans", "skirt"], color: "neutral" },
      { id: "layer", types: ["blazer", "jacket", "cardigan", "coat", "vest"] },
      { id: "shoes", types: shoes },
    ],
  },
  {
    id: "tonal",
    key: "tonal",
    creatorId: "imogen",
    occasion: "date",
    palette: ["#cec1b2", "#a38e7b", "#73604d"],
    slots: [
      { id: "top", types: tops },
      { id: "bottom", types: bottoms, color: "same-as-first" },
      { id: "shoes", types: shoes, color: "neutral" },
    ],
  },
  {
    id: "balance",
    key: "balance",
    creatorId: "jamie",
    occasion: "casual",
    palette: ["#d7d1c7", "#2c3540", "#ece7df"],
    slots: [
      { id: "top", types: tops },
      { id: "bottom", types: ["pants", "jeans", "skirt"] },
      {
        id: "layer",
        types: ["blazer", "jacket", "coat", "cardigan"],
        optional: true,
      },
      { id: "shoes", types: shoes },
    ],
  },
  {
    id: "accent",
    key: "accent",
    creatorId: "becky",
    occasion: "casual",
    palette: ["#eae7df", "#365b49", "#c4b292"],
    slots: [
      { id: "top", types: tops, color: "neutral" },
      { id: "bottom", types: bottoms, color: "neutral" },
      { id: "shoes", types: shoes },
      {
        id: "accent",
        types: ["bag", "scarf", "hat", "belt", "accessories"],
        color: "accent",
        optional: true,
      },
    ],
  },
  {
    id: "dress",
    key: "dress",
    creatorId: "jean",
    occasion: "date",
    palette: ["#413e39", "#b7906e", "#f0e9dd"],
    slots: [
      { id: "dress", types: ["dress", "jumpsuit"] },
      { id: "shoes", types: shoes },
      {
        id: "layer",
        types: ["blazer", "jacket", "coat", "cardigan"],
        optional: true,
      },
    ],
  },
  {
    id: "color-play",
    key: "colorPlay",
    creatorId: "yanbaiwan",
    occasion: "casual",
    palette: ["#6683bd", "#eee9df", "#33353a"],
    slots: [
      { id: "top", types: tops, color: "accent" },
      { id: "bottom", types: bottoms, color: "neutral" },
      { id: "shoes", types: shoes, color: "neutral" },
      { id: "bag", types: ["bag"], optional: true },
    ],
  },
  {
    id: "easy-layers",
    key: "easyLayers",
    creatorId: "xiebao",
    occasion: "office",
    palette: ["#ddd6c7", "#5d6570", "#faf7ef"],
    slots: [
      { id: "top", types: tops },
      { id: "bottom", types: bottoms },
      { id: "shoes", types: shoes },
      {
        id: "layer",
        types: ["blazer", "jacket", "cardigan", "coat", "vest"],
        optional: true,
      },
    ],
  },
  {
    id: "detail-echo",
    key: "detailEcho",
    creatorId: "changxin",
    occasion: "casual",
    palette: ["#759a82", "#e5dfd1", "#353a36"],
    slots: [
      { id: "top", types: tops },
      { id: "bottom", types: bottoms },
      { id: "shoes", types: shoes, color: "same-as-first" },
      {
        id: "accent",
        types: ["bag", "scarf", "hat", "belt", "accessories"],
        optional: true,
      },
    ],
  },
];
export const getFormula = (id: string | null | undefined) =>
  STYLE_FORMULAS.find((f) => f.id === id) ?? STYLE_FORMULAS[0];
