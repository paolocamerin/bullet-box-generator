import { describe, expect, it } from "vitest";
import type { BoxParams } from "../types";
import { validateParams } from "./validation";

const baseParams: BoxParams = {
  columns: 5,
  rows: 5,
  holeDiameter: 9,
  holeHeight: 20,
  spacing: 3,
  floorOffset: 3,
  lidWallThickness: 2,
  lidEngagementHeight: 8,
  lidClearance: 0.03,
};

function errors(params: BoxParams) {
  return validateParams(params).filter((m) => m.severity === "error");
}

describe("validateParams", () => {
  it("has no errors for sane default parameters", () => {
    expect(errors(baseParams)).toHaveLength(0);
  });

  it("rejects a grid with zero columns or rows", () => {
    expect(errors({ ...baseParams, columns: 0 }).length).toBeGreaterThan(0);
    expect(errors({ ...baseParams, rows: 0 }).length).toBeGreaterThan(0);
  });

  it("rejects non-positive hole/box/lid dimensions", () => {
    expect(errors({ ...baseParams, holeDiameter: 0 }).length).toBeGreaterThan(0);
    expect(errors({ ...baseParams, holeHeight: -1 }).length).toBeGreaterThan(0);
    expect(errors({ ...baseParams, floorOffset: 0 }).length).toBeGreaterThan(0);
    expect(errors({ ...baseParams, lidWallThickness: 0 }).length).toBeGreaterThan(0);
    expect(errors({ ...baseParams, spacing: 0 }).length).toBeGreaterThan(0);
  });

  it("rejects lid engagement height greater than hole height", () => {
    expect(errors({ ...baseParams, lidEngagementHeight: baseParams.holeHeight + 1 }).length).toBeGreaterThan(0);
  });

  it("allows lid engagement height exactly equal to hole height", () => {
    expect(errors({ ...baseParams, lidEngagementHeight: baseParams.holeHeight })).toHaveLength(0);
  });

  it("rejects a lid wall thickness that collapses the recessed step to zero/negative", () => {
    expect(errors({ ...baseParams, lidWallThickness: 40 }).length).toBeGreaterThan(0);
  });

  it("rejects a recessed step that breaches the outer ring of holes", () => {
    // spacing (3) < lidWallThickness + clearance/2 (10 + tiny) -> breach
    expect(errors({ ...baseParams, spacing: 1, lidWallThickness: 10 }).length).toBeGreaterThan(0);
  });

  it("warns (but does not error) on a very tight default clearance", () => {
    const messages = validateParams(baseParams);
    expect(messages.some((m) => m.severity === "warning")).toBe(true);
    expect(errors(baseParams)).toHaveLength(0);
  });
});
