import { config as dotenv } from "dotenv";
export { STORES } from "./public-config";
export function loadEnvironment() {
  if (typeof window !== "undefined") throw Error("server_only");
  dotenv({ path: process.env.DINNER_DATA_ENV_FILE || ".env", override: false });
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
