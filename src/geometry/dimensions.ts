import type { BoxParams } from "../types";

export interface HolePosition {
  x: number;
  z: number;
}

export interface DerivedDimensions {
  width: number;
  depth: number;
  totalHeight: number;
  /** Y at which the box's outer wall steps inward for the lid to slide over. */
  stepY: number;
  stepWidth: number;
  stepDepth: number;
  lidOuterWidth: number;
  lidOuterDepth: number;
  lidOuterHeight: number;
  lidInnerWidth: number;
  lidInnerDepth: number;
  holeCount: number;
  holePositions: HolePosition[];
}

/**
 * Box's X/Z origin sits at the footprint center; Y=0 is the bottom face (box
 * "up" axis matches three.js's Y-up convention so cylinders need no rotation).
 */
export function computeDimensions(params: BoxParams): DerivedDimensions {
  const {
    columns,
    rows,
    holeDiameter,
    spacing,
    holeHeight,
    floorOffset,
    lidWallThickness,
    lidEngagementHeight,
    lidClearance,
    lidHeadroom,
  } = params;

  const width = columns * holeDiameter + (columns + 1) * spacing;
  const depth = rows * holeDiameter + (rows + 1) * spacing;
  const totalHeight = holeHeight + floorOffset;
  const stepY = totalHeight - lidEngagementHeight;

  // Clearance applied once per dimension (matches "0.03mm between inner lid
  // size and outer box size" literally, not doubled as a per-side radial gap).
  const stepWidth = width - 2 * lidWallThickness - lidClearance;
  const stepDepth = depth - 2 * lidWallThickness - lidClearance;

  const lidOuterWidth = width;
  const lidOuterDepth = depth;
  // Cavity depth = engagement zone (slides over the box) + headroom above the
  // box's top face (empty space so ammo ends don't touch the cap) + the cap
  // itself.
  const lidOuterHeight = lidEngagementHeight + lidHeadroom + lidWallThickness;
  const lidInnerWidth = width - 2 * lidWallThickness;
  const lidInnerDepth = depth - 2 * lidWallThickness;

  const holePositions: HolePosition[] = [];
  for (let i = 0; i < columns; i++) {
    const x = spacing + holeDiameter / 2 + i * (holeDiameter + spacing) - width / 2;
    for (let j = 0; j < rows; j++) {
      const z = spacing + holeDiameter / 2 + j * (holeDiameter + spacing) - depth / 2;
      holePositions.push({ x, z });
    }
  }

  return {
    width,
    depth,
    totalHeight,
    stepY,
    stepWidth,
    stepDepth,
    lidOuterWidth,
    lidOuterDepth,
    lidOuterHeight,
    lidInnerWidth,
    lidInnerDepth,
    holeCount: holePositions.length,
    holePositions,
  };
}
