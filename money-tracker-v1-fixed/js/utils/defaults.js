export const APP_NAME = "Money Tracker";
export const SCHEMA_VERSION = 1;
export const DB_NAME = "money_tracker_v1";
export const DB_VERSION = 2; // Safe upgrade: keep existing stores/data; create missing V1 stores if needed.

export const TX_TYPES = ["income", "expense"];
export const OUTING_STATUS = ["active", "completed"];
export const THEMES = ["light", "dark"];

export const AMOUNT_LIMIT = 999_999_999_999;
export const NAME_MAX = 80;
export const DESCRIPTION_MAX = 240;
export const NOTE_MAX = 240;
export const CATEGORY_NAME_MAX = 40;
export const OUTING_NAME_MAX = 60;

export const PALETTE = [
  "#0f8a5f",
  "#0e7490",
  "#3d7ea6",
  "#5b74c9",
  "#7c3aed",
  "#b45f9b",
  "#cc4a54",
  "#e07a5f",
  "#d9a441",
  "#4fa38a",
  "#9a6b4f",
  "#64748b",
];

export const DEFAULT_CATEGORIES = [
  { id: "cat_income_uang_saku", name: "Uang Saku", type: "income", color: "#0f8a5f" },
  { id: "cat_income_gaji", name: "Gaji", type: "income", color: "#15803d" },
  { id: "cat_income_freelance", name: "Freelance", type: "income", color: "#0e7490" },
  { id: "cat_income_hadiah", name: "Hadiah", type: "income", color: "#7c3aed" },
  { id: "cat_income_bisnis", name: "Bisnis", type: "income", color: "#0d9488" },
  { id: "cat_income_lainnya", name: "Lainnya", type: "income", color: "#64748b" },
  { id: "cat_expense_makanan", name: "Makanan & Minuman", type: "expense", color: "#e07a5f" },
  { id: "cat_expense_transportasi", name: "Transportasi", type: "expense", color: "#3d7ea6" },
  { id: "cat_expense_belanja", name: "Belanja", type: "expense", color: "#b45f9b" },
  { id: "cat_expense_hiburan", name: "Hiburan", type: "expense", color: "#d9a441" },
  { id: "cat_expense_pendidikan", name: "Pendidikan", type: "expense", color: "#5b74c9" },
  { id: "cat_expense_kesehatan", name: "Kesehatan", type: "expense", color: "#4fa38a" },
  { id: "cat_expense_tagihan", name: "Tagihan", type: "expense", color: "#9a6b4f" },
  { id: "cat_expense_lainnya", name: "Lainnya", type: "expense", color: "#64748b" },
];

export const DEFAULT_SETTINGS = {
  openingBalance: 0,
  trackingStartDate: "",
  theme: "light",
  legacyMigratedAt: null,
};

export function makeDefaultCategories(createdAt = new Date().toISOString()) {
  return DEFAULT_CATEGORIES.map((category) => ({
    ...category,
    archived: false,
    createdAt,
    updatedAt: createdAt,
  }));
}

export function defaultSettings(today) {
  return { ...DEFAULT_SETTINGS, trackingStartDate: today };
}
