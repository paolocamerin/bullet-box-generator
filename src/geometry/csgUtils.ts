import * as THREE from "three";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";

const evaluator = new Evaluator();
evaluator.useGroups = false;
// The default (legacy) triangle splitter leaves gaps/duplicate triangles at
// cut boundaries when many islands are subtracted in one pass (confirmed by
// measuring boundary-edge counts on our own output — CDT clipping closes
// nearly all of them). See https://github.com/gkjohnson/three-bvh-csg.
// `useCDTClipping` exists on the runtime Evaluator (bundled source) but is
// missing from the package's shipped .d.ts, hence the cast.
(evaluator as Evaluator & { useCDTClipping: boolean }).useCDTClipping = true;

function toBrush(geometry: THREE.BufferGeometry): Brush {
  const brush = new Brush(geometry);
  brush.updateMatrixWorld();
  return brush;
}

export function subtract(
  a: THREE.BufferGeometry,
  b: THREE.BufferGeometry,
): THREE.BufferGeometry {
  const result = evaluator.evaluate(toBrush(a), toBrush(b), SUBTRACTION);
  return result.geometry;
}
