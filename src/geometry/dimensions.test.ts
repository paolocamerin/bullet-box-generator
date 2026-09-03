import { describe, expect, it } from "vitest";
import type { BoxParams } from "../types";
import { computeDimensions } from "./dimensions";

const baseParams: BoxParams = {
  columns: 5,
  rows: 3,
  holeDiameter: 9,
  holeHeight: 20,
  spacing: 3,
  floorOffset: 3,
  lidWallThickness: 2,
  lidEngagementHeight: 8,
  lidClearance: 0.03,
  lidHeadroom: 5,
};

describe("computeDimensions", () => {
  it("computes the box footprint from grid + hole + spacing", () => {
    const dims = computeDimensions(baseParams);
    // width = cols*d + (cols+1)*spacing = 5*9 + 6*3 = 45 + 18 = 63
    expect(dims.width).toBeCloseTo(63);
    // depth = rows*d + (rows+1)*spacing = 3*9 + 4*3 = 27 + 12 = 39
    expect(dims.depth).toBeCloseTo(39);
  });

  it("computes total box height as hole height + floor offset", () => {
    const dims = computeDimensions(baseParams);
    expect(dims.totalHeight).toBeCloseTo(23);
    expect(dims.stepY).toBeCloseTo(dims.totalHeight - baseParams.lidEngagementHeight);
  });

  it("computes the recessed step footprint using wall thickness + clearance once per dimension", () => {
    const dims = computeDimensions(baseParams);
    expect(dims.stepWidth).toBeCloseTo(dims.width - 2 * baseParams.lidWallThickness - baseParams.lidClearance);
    expect(dims.stepDepth).toBeCloseTo(dims.depth - 2 * baseParams.lidWallThickness - baseParams.lidClearance);
  });

  it("computes lid outer dims flush with the box and inner dims recessed by wall thickness", () => {
    const dims = computeDimensions(baseParams);
    expect(dims.lidOuterWidth).toBeCloseTo(dims.width);
    expect(dims.lidOuterDepth).toBeCloseTo(dims.depth);
    expect(dims.lidOuterHeight).toBeCloseTo(
      baseParams.lidEngagementHeight + baseParams.lidHeadroom + baseParams.lidWallThickness,
    );
    expect(dims.lidInnerWidth).toBeCloseTo(dims.width - 2 * baseParams.lidWallThickness);
    expect(dims.lidInnerDepth).toBeCloseTo(dims.depth - 2 * baseParams.lidWallThickness);
    // lid inner size sits exactly `lidClearance` above the box step size
    expect(dims.lidInnerWidth - dims.stepWidth).toBeCloseTo(baseParams.lidClearance);
    expect(dims.lidInnerDepth - dims.stepDepth).toBeCloseTo(baseParams.lidClearance);
  });

  it("lays out holes on a centered, non-overlapping grid", () => {
    const dims = computeDimensions(baseParams);
    expect(dims.holeCount).toBe(baseParams.columns * baseParams.rows);
    expect(dims.holePositions).toHaveLength(15);

    // Grid is centered: min/max hole-edge extents should sit within the footprint,
    // symmetric about the origin.
    const xs = dims.holePositions.map((p) => p.x);
    const minX = Math.min(...xs) - baseParams.holeDiameter / 2;
    const maxX = Math.max(...xs) + baseParams.holeDiameter / 2;
    expect(minX).toBeCloseTo(-dims.width / 2 + baseParams.spacing);
    expect(maxX).toBeCloseTo(dims.width / 2 - baseParams.spacing);

    // No two hole centers should be closer than one hole diameter (no overlap).
    for (let i = 0; i < dims.holePositions.length; i++) {
      for (let j = i + 1; j < dims.holePositions.length; j++) {
        const a = dims.holePositions[i];
        const b = dims.holePositions[j];
        const dist = Math.hypot(a.x - b.x, a.z - b.z);
        expect(dist).toBeGreaterThanOrEqual(baseParams.holeDiameter);
      }
    }
  });

  it("scales the hole count with grid size", () => {
    const dims1x1 = computeDimensions({ ...baseParams, columns: 1, rows: 1 });
    expect(dims1x1.holeCount).toBe(1);

    const dimsLarge = computeDimensions({ ...baseParams, columns: 15, rows: 15 });
    expect(dimsLarge.holeCount).toBe(225);
  });
});
