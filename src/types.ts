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
}

export type ExportFormat = "stl" | "obj";

export type ViewMode = "assembled" | "exploded" | "sideBySide";
