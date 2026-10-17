import type { OutfitFormula } from "./matching";

export interface StyleCreator {
  id: string;
  name: string;
  publication: string;
  url: string;
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
    url: "https://alyssabeltempo.substack.com/p/decluttering-doesnt-have-to-be-scary",
  },
  {
    id: "caroline",
    name: "Caroline Joy",
    publication: "Un-Fancy",
    url: "https://www.un-fancy.com/capsule-wardrobe-101/how-to-build-a-capsule-wardrobe/",
  },
  {
    id: "imogen",
    name: "Imogen Lamport",
    publication: "Inside Out Style",
    url: "https://insideoutstyleblog.com/2020/02/getting-the-balance-right-with-your-colour-contrast.html",
  },
  {
    id: "jamie",
    name: "Jamie-Lee",
    publication: "Mademoiselle",
    url: "https://www.mademois-elle.com/three-ways-to-create-balance-in-an-outfit/",
  },
  {
    id: "becky",
    name: "黎贝卡团队",
    publication: "Becky’s Fantasy",
    url: "https://www.beckysfantasy.com/n_10252",
  },
  {
    id: "jean",
    name: "Jean Wang",
    publication: "Extra Petite",
    url: "https://www.extrapetite.com/2021/07/how-to-style-straight-leg-jeans-everlane-levis-petite-outfits.html",
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
];
export const getFormula = (id: string | null | undefined) =>
  STYLE_FORMULAS.find((f) => f.id === id) ?? STYLE_FORMULAS[0];
