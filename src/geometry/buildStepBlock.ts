import * as THREE from "three";

type Corner = [number, number, number];

/**
 * Appends a flat quad (as two triangles) to the accumulating attribute
 * arrays. `corners` just needs to walk the quad's perimeter in order — the
 * winding is auto-corrected against `normal` so callers don't have to reason
 * about CW/CCW by hand for every one of the block's 14 faces.
 */
function addQuad(
  positions: number[],
  normals: number[],
  uvs: number[],
  indices: number[],
  corners: [Corner, Corner, Corner, Corner],
  normal: Corner,
) {
  const [a, b, c] = corners;
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cross: Corner = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  const dot = cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2];
  const ordered = dot >= 0 ? corners : ([corners[0], corners[3], corners[2], corners[1]] as const);

  const base = positions.length / 3;
  const quadUvs: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  ordered.forEach((corner, i) => {
    positions.push(corner[0], corner[1], corner[2]);
    normals.push(normal[0], normal[1], normal[2]);
    uvs.push(quadUvs[i][0], quadUvs[i][1]);
  });
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/**
 * Hand-builds the box's solid silhouette before holes are cut: a
 * full-footprint lower block topped with a smaller, inset block (where the
 * lid will slide over), joined by a flat mitred ledge. Built directly as one
 * closed/manifold mesh rather than via a CSG union of two boxes that only
 * touch along a coplanar seam — that zero-volume-overlap case is a known
 * degenerate input for boolean CSG kernels and was measured to leave a ring
 * of open (non-manifold) edges exactly at the seam.
 */
export function buildStepBlock(
  width: number,
  depth: number,
  stepWidth: number,
  stepDepth: number,
  lowerHeight: number,
  upperHeight: number,
): THREE.BufferGeometry {
  const hw = width / 2;
  const hd = depth / 2;
  const shw = stepWidth / 2;
  const shd = stepDepth / 2;
  const y0 = 0;
  const y1 = lowerHeight;
  const y2 = lowerHeight + upperHeight;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const quad = (corners: [Corner, Corner, Corner, Corner], normal: Corner) =>
    addQuad(positions, normals, uvs, indices, corners, normal);

  // Bottom cap (full footprint).
  quad(
    [
      [-hw, y0, -hd],
      [hw, y0, -hd],
      [hw, y0, hd],
      [-hw, y0, hd],
    ],
    [0, -1, 0],
  );

  // Top cap (inset footprint).
  quad(
    [
      [-shw, y2, -shd],
      [shw, y2, -shd],
      [shw, y2, shd],
      [-shw, y2, shd],
    ],
    [0, 1, 0],
  );

  // Lower outer walls (full footprint, y0 -> y1).
  quad(
    [
      [-hw, y0, -hd],
      [hw, y0, -hd],
      [hw, y1, -hd],
      [-hw, y1, -hd],
    ],
    [0, 0, -1],
  );
  quad(
    [
      [hw, y0, -hd],
      [hw, y0, hd],
      [hw, y1, hd],
      [hw, y1, -hd],
    ],
    [1, 0, 0],
  );
  quad(
    [
      [hw, y0, hd],
      [-hw, y0, hd],
      [-hw, y1, hd],
      [hw, y1, hd],
    ],
    [0, 0, 1],
  );
  quad(
    [
      [-hw, y0, hd],
      [-hw, y0, -hd],
      [-hw, y1, -hd],
      [-hw, y1, hd],
    ],
    [-1, 0, 0],
  );

  // Ledge at y1: a mitred picture-frame ring from the outer footprint down
  // to the inset footprint, facing up.
  quad(
    [
      [-hw, y1, -hd],
      [hw, y1, -hd],
      [shw, y1, -shd],
      [-shw, y1, -shd],
    ],
    [0, 1, 0],
  );
  quad(
    [
      [hw, y1, -hd],
      [hw, y1, hd],
      [shw, y1, shd],
      [shw, y1, -shd],
    ],
    [0, 1, 0],
  );
  quad(
    [
      [hw, y1, hd],
      [-hw, y1, hd],
      [-shw, y1, shd],
      [shw, y1, shd],
    ],
    [0, 1, 0],
  );
  quad(
    [
      [-hw, y1, hd],
      [-hw, y1, -hd],
      [-shw, y1, -shd],
      [-shw, y1, shd],
    ],
    [0, 1, 0],
  );

  // Upper outer walls (inset footprint, y1 -> y2).
  quad(
    [
      [-shw, y1, -shd],
      [shw, y1, -shd],
      [shw, y2, -shd],
      [-shw, y2, -shd],
    ],
    [0, 0, -1],
  );
  quad(
    [
      [shw, y1, -shd],
      [shw, y1, shd],
      [shw, y2, shd],
      [shw, y2, -shd],
    ],
    [1, 0, 0],
  );
  quad(
    [
      [shw, y1, shd],
      [-shw, y1, shd],
      [-shw, y2, shd],
      [shw, y2, shd],
    ],
    [0, 0, 1],
  );
  quad(
    [
      [-shw, y1, shd],
      [-shw, y1, -shd],
      [-shw, y2, -shd],
      [-shw, y2, shd],
    ],
    [-1, 0, 0],
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}
