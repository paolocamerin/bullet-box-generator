import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { BoxParams } from "../types";
import { buildBoxGeometry } from "./buildBoxGeometry";
import { buildLidGeometry } from "./buildLidGeometry";
import { computeDimensions } from "./dimensions";
import { buildPrintLayoutGeometry, computePrintLayoutFootprint } from "./printLayout";

const params: BoxParams = {
  columns: 5,
  rows: 5,
  holeDiameter: 9,
  holeHeight: 20,
  spacing: 3,
  floorOffset: 3,
  lidWallThickness: 2,
  lidEngagementHeight: 8,
  lidClearance: 0.03,
  lidHeadroom: 5,
};

describe("buildPrintLayoutGeometry", () => {
  it("lays both parts flat on the bed (min Z ~ 0) with holes/opening facing up", () => {
    const dims = computeDimensions(params);
    const box = buildBoxGeometry(params);
    const lid = buildLidGeometry(params);

    const layout = buildPrintLayoutGeometry(box, lid, dims);
    layout.computeBoundingBox();
    const bbox = layout.boundingBox!;

    // Both parts rest flat on the print bed.
    expect(bbox.min.z).toBeCloseTo(0, 1);

    // Combined height should reach at least the taller of the two parts
    // (box total height vs. lid outer height) since both sit on Z=0.
    const expectedMaxZ = Math.max(dims.totalHeight, dims.lidOuterHeight);
    expect(bbox.max.z).toBeCloseTo(expectedMaxZ, 1);

    // Footprint (X) should fit both parts side by side plus a gap — wider
    // than either part alone, narrower than their naive sum + huge margin.
    const size = new THREE.Vector3();
    bbox.getSize(size);
    expect(size.x).toBeGreaterThan(dims.width);
    expect(size.x).toBeGreaterThan(dims.lidOuterWidth);

    box.dispose();
    lid.dispose();
    layout.dispose();
  });

  it("orients the box with its holes opening upward (+Z)", () => {
    const dims = computeDimensions(params);
    const box = buildBoxGeometry(params);
    const lid = buildLidGeometry(params);
    const layout = buildPrintLayoutGeometry(box, lid, dims);

    // Sample a point near the box's negative-X side (where it's placed) and
    // confirm the highest Z there reaches the box's full height — i.e. the
    // open (hole) face, not the floor, ended up on top.
    const position = layout.getAttribute("position");
    let maxZOnBoxSide = -Infinity;
    for (let i = 0; i < position.count; i++) {
      if (position.getX(i) < 0) {
        maxZOnBoxSide = Math.max(maxZOnBoxSide, position.getZ(i));
      }
    }
    expect(maxZOnBoxSide).toBeCloseTo(dims.totalHeight, 1);

    box.dispose();
    lid.dispose();
    layout.dispose();
  });

  it("orients the lid cap-down (opening/rim facing up, +Z)", () => {
    const dims = computeDimensions(params);
    const box = buildBoxGeometry(params);
    const lid = buildLidGeometry(params);
    const layout = buildPrintLayoutGeometry(box, lid, dims);

    // On the lid's side (positive X), the cap should be the *bottom* layer:
    // there must be geometry at Z ~ 0 (the cap) as well as up near
    // lidOuterHeight (the open rim) — i.e. it isn't sitting cap-up.
    const position = layout.getAttribute("position");
    let sawNearZero = false;
    let maxZOnLidSide = -Infinity;
    for (let i = 0; i < position.count; i++) {
      if (position.getX(i) > 0) {
        const z = position.getZ(i);
        if (z < 0.5) sawNearZero = true;
        maxZOnLidSide = Math.max(maxZOnLidSide, z);
      }
    }
    expect(sawNearZero).toBe(true);
    expect(maxZOnLidSide).toBeCloseTo(dims.lidOuterHeight, 1);

    box.dispose();
    lid.dispose();
    layout.dispose();
  });
});

describe("computePrintLayoutFootprint", () => {
  it("matches the actual built layout geometry's bounding box", () => {
    const dims = computeDimensions(params);
    const footprint = computePrintLayoutFootprint(dims);

    const box = buildBoxGeometry(params);
    const lid = buildLidGeometry(params);
    const layout = buildPrintLayoutGeometry(box, lid, dims);
    layout.computeBoundingBox();
    const size = new THREE.Vector3();
    layout.boundingBox!.getSize(size);

    expect(footprint.width).toBeCloseTo(size.x, 1);
    expect(footprint.depth).toBeCloseTo(size.y, 1);
    expect(footprint.height).toBeCloseTo(size.z, 1);

    box.dispose();
    lid.dispose();
    layout.dispose();
  });

  it("grows the width (not the depth) when the grid gets wider", () => {
    const narrow = computePrintLayoutFootprint(computeDimensions(params));
    const wide = computePrintLayoutFootprint(computeDimensions({ ...params, columns: 10 }));

    expect(wide.width).toBeGreaterThan(narrow.width);
    expect(wide.depth).toBeCloseTo(narrow.depth, 5);
  });
});
