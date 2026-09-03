import type { BoxParams } from "../types";
import { computeDimensions } from "./dimensions";

export type ValidationSeverity = "error" | "warning";

export interface ValidationMessage {
  severity: ValidationSeverity;
  message: string;
}

const MIN_PRINTABLE_WALL = 0.4;
const RECOMMENDED_MIN_CLEARANCE = 0.1;
const SLOW_HOLE_COUNT = 400;
export const MIN_LID_HEADROOM = 5;
export const DEFAULT_MAX_PLATE_SIZE = 512;

export function validateParams(
  params: BoxParams,
  maxPlateSize: number = DEFAULT_MAX_PLATE_SIZE,
): ValidationMessage[] {
  const messages: ValidationMessage[] = [];

  if (!Number.isInteger(params.columns) || params.columns < 1) {
    messages.push({ severity: "error", message: "Columns must be an integer of at least 1." });
  }
  if (!Number.isInteger(params.rows) || params.rows < 1) {
    messages.push({ severity: "error", message: "Rows must be an integer of at least 1." });
  }
  if (params.holeDiameter <= 0) {
    messages.push({ severity: "error", message: "Hole diameter must be greater than 0." });
  }
  if (params.holeHeight <= 0) {
    messages.push({ severity: "error", message: "Hole height must be greater than 0." });
  }
  if (params.floorOffset <= 0) {
    messages.push({ severity: "error", message: "Floor offset must be greater than 0." });
  }
  if (params.lidWallThickness <= 0) {
    messages.push({ severity: "error", message: "Lid wall thickness must be greater than 0." });
  }
  if (params.lidEngagementHeight <= 0) {
    messages.push({ severity: "error", message: "Lid engagement height must be greater than 0." });
  }
  if (params.spacing <= 0) {
    messages.push({ severity: "error", message: "Spacing must be greater than 0." });
  }
  if (params.lidClearance < 0) {
    messages.push({ severity: "error", message: "Lid clearance cannot be negative." });
  }
  if (params.lidHeadroom < MIN_LID_HEADROOM) {
    messages.push({
      severity: "error",
      message: `Lid headroom must be at least ${MIN_LID_HEADROOM}mm — this is the vertical clearance above the ammo so it doesn't touch the lid.`,
    });
  }

  // The remaining checks depend on the fields above being sane; bail out early
  // rather than reporting confusing derived-dimension errors on top.
  if (messages.some((m) => m.severity === "error")) {
    return messages;
  }

  if (params.lidEngagementHeight > params.holeHeight) {
    messages.push({
      severity: "error",
      message: "Lid engagement height cannot exceed hole height.",
    });
    return messages;
  }

  const dims = computeDimensions(params);

  // Guardrail against oversized models hanging or crashing the tab (CSG runs
  // on the main thread). Box and lid footprints share the same W x D, so
  // checking the box's is enough to cover both parts.
  if (dims.width > maxPlateSize || dims.depth > maxPlateSize) {
    messages.push({
      severity: "error",
      message: `Box footprint (${dims.width.toFixed(0)} × ${dims.depth.toFixed(0)}mm) exceeds the ${maxPlateSize}mm plate size limit. Reduce the grid/spacing, or raise the limit in Settings.`,
    });
    return messages;
  }

  if (dims.stepWidth <= 0 || dims.stepDepth <= 0) {
    messages.push({
      severity: "error",
      message:
        "Lid wall thickness + clearance is too large for the box footprint — the recessed step has zero or negative size. Reduce lid wall thickness/clearance or increase the grid/spacing.",
    });
    return messages;
  }

  // Remaining wall thickness of the outermost holes within the recessed step
  // region (where the box's outer wall has moved inward for the lid to slide over).
  const stepSideMargin = params.spacing - (params.lidWallThickness + params.lidClearance / 2);
  if (stepSideMargin <= 0) {
    messages.push({
      severity: "error",
      message:
        "The lid's recessed step breaches the outer ring of holes near the top edge. Increase spacing, or reduce lid wall thickness/clearance.",
    });
  } else if (stepSideMargin < MIN_PRINTABLE_WALL) {
    messages.push({
      severity: "warning",
      message: `Only ${stepSideMargin.toFixed(2)}mm of wall remains around the outer holes at the lid step — this may be too thin to print cleanly.`,
    });
  }

  if (params.spacing < MIN_PRINTABLE_WALL) {
    messages.push({
      severity: "warning",
      message: "Spacing between holes is very thin and may not print cleanly.",
    });
  }

  if (params.lidClearance < RECOMMENDED_MIN_CLEARANCE) {
    messages.push({
      severity: "warning",
      message:
        "FDM printers typically need ≥0.1–0.15mm of clearance for a reliable press fit — this value may print too tight on some printers/materials.",
    });
  }

  if (dims.holeCount > SLOW_HOLE_COUNT) {
    messages.push({
      severity: "warning",
      message: `${dims.holeCount} holes may make live regeneration slow (geometry runs on the main thread).`,
    });
  }

  return messages;
}
