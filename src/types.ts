export interface BoxParams {
  columns: number;
  rows: number;
  holeDiameter: number;
  holeHeight: number;
  spacing: number;
  floorOffset: number;
  lidWallThickness: number;
  lidEngagementHeight: number;
  lidClearance: number;
  /** Extra vertical space inside the lid above the box's top face, so ammo
   * ends don't touch the underside of the lid's cap. */
  lidHeadroom: number;
}

export interface AppSettings {
  /** Max box/lid footprint dimension (mm) allowed before generation is
   * blocked as a guardrail against hangs/crashes from oversized models. */
  maxPlateSize: number;
}

export type ExportFormat = "stl" | "obj";

export type ViewMode = "assembled" | "exploded" | "sideBySide";

export type CookieConsent = "unset" | "accepted" | "declined";

export interface Preset {
  name: string;
  params: BoxParams;
}
