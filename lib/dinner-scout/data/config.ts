import { config as dotenv } from "dotenv";
import type { z } from "zod";
import type { StoreSchema } from "./contracts";
export const STORES: z.infer<typeof StoreSchema>[] = [
  {
    id: "seijoishii-minamiaoyama",
    name: "成城石井 南青山店",
    sourceUrl: "https://shop.seijoishii.com/seijoishii/spot/detail?code=0150",
    scopeNames: ["南青山店"],
  },
  {
    id: "kinokuniya-international",
    name: "紀ノ国屋 インターナショナル",
    sourceUrl: "https://www.e-kinokuniya.com/store/KINOKUNIYA/international",
    scopeNames: ["インターナショナル", "INTERNATIONAL"],
  },
  {
    id: "villemarche-aoyama",
    name: "ヴィルマルシェ 青山店",
    sourceUrl: "https://page.line.me/kaq2977y",
    scopeNames: ["ヴィルマルシェ青山店", "ヴィルマルシェ 青山店"],
  },
];
export function loadEnvironment() {
  if (typeof window !== "undefined") throw Error("server_only");
  if (process.env.DINNER_DATA_ENV_FILE)
    dotenv({ path: process.env.DINNER_DATA_ENV_FILE, override: false });
}
export const DEFAULT_CONDITIONS = {
  budgetYen: 4000,
  proteinGoalG: 40,
  kcalGoal: 650,
  allergies: [],
  dislikes: [],
  pantry: ["rice-dry", "oil", "salt", "pepper", "soy-sauce", "sugar"],
  shoppingDate: new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Tokyo",
  }),
};
