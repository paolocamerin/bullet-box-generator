import type { AppSettings } from "../types";

export const defaultSettings: AppSettings = {
  maxPlateSize: 512,
};

export const MIN_PLATE_SIZE = 50;
// Absolute ceiling even a user override can't exceed — a backstop against
// truly extreme values that could hang or crash the tab regardless of intent.
export const MAX_PLATE_SIZE_HARD_CAP = 3000;
