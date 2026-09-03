import { GizmoHelper, GizmoViewcube, Grid, OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { DerivedDimensions } from "../geometry/dimensions";
import type { ViewMode } from "../types";
import { BoxMesh } from "./BoxMesh";
import { LidMesh } from "./LidMesh";

interface SceneProps {
  boxGeometry: THREE.BufferGeometry | null;
  lidGeometry: THREE.BufferGeometry | null;
  dimensions: DerivedDimensions;
  viewMode: ViewMode;
}

const LIGHT_DIRECTION = { x: 0.5136, y: 0.7534, z: 0.4109 }; // normalized (150, 220, 120)

// Matches three.js BoxGeometry's default material-group order (+X,-X,+Y,-Y,+Z,-Z),
// which is also the order GizmoViewcube indexes its `faces` labels by.
const AXIS_FACE_LABELS = ["X+", "X-", "Y+", "Y-", "Z+", "Z-"];

// "Faux-orthographic": rather than swapping to a real THREE.OrthographicCamera
// (a discontinuous cut — its parameters, world-space left/right/top/bottom,
// have no continuous path to a perspective camera's fov+distance), we shrink
// the perspective camera's FOV toward zero while pulling it back to keep the
// model's apparent size constant. In the limit that's mathematically true
// orthographic; at a few degrees it's visually indistinguishable, and it
// stays the *same* camera object throughout, so every transition — face
// click, edge/corner click, manual drag — is just a continuous blend of the
// same few numbers instead of a camera swap.
const NORMAL_FOV = 40;
const FLATTENED_FOV = 4;
const BLEND_DURATION = 0.45; // seconds

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function ShadowLight({ center, radius }: { center: [number, number, number]; radius: number }) {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  // A directional light's shadow camera looks at its `.target`, which
  // defaults to a fresh Object3D at world origin — created once (not inline
  // in JSX) so it's the same persistent instance every render, with its
  // position kept in sync declaratively below.
  const target = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    if (lightRef.current) {
      lightRef.current.target = target;
    }
  }, [target]);

  const lightDistance = radius * 1.8 + 60;
  const position: [number, number, number] = [
    center[0] + LIGHT_DIRECTION.x * lightDistance,
    center[1] + LIGHT_DIRECTION.y * lightDistance,
    center[2] + LIGHT_DIRECTION.z * lightDistance,
  ];

  // Bracket near/far tightly around the actual geometry (radius from its true
  // center) rather than around the origin — without an explicit target, the
  // shadow camera looks at (0,0,0), which silently breaks this bracketing
  // (and the frustum's left/right/top/bottom) whenever content is offset away
  // from the origin, as it is in exploded/side-by-side view.
  const margin = 20;
  const shadowNear = Math.max(1, lightDistance - radius - margin);
  const shadowFar = lightDistance + radius + margin;
  const shadowExtent = radius + margin;

  // R3F's `shadow-camera-*` props do a plain property assignment
  // (`camera.left = value`, etc.) with no special handling for cameras —
  // three.js caches `projectionMatrix` and only recomputes it on an explicit
  // `updateProjectionMatrix()` call. Without this, the shadow camera's frustum
  // numbers update correctly on every render, but the matrix actually used to
  // render the shadow map stays frozen at whatever it was on first mount —
  // correct right after a fresh load, silently wrong as soon as the frustum
  // needs to change (e.g. switching view mode moves/resizes the geometry).
  useEffect(() => {
    lightRef.current?.shadow.camera.updateProjectionMatrix();
  }, [shadowNear, shadowFar, shadowExtent]);

  return (
    <>
      <directionalLight
        ref={lightRef}
        position={position}
        intensity={1.1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        shadow-camera-near={shadowNear}
        shadow-camera-far={shadowFar}
        shadow-normalBias={0.05}
      />
      <primitive object={target} position={center} />
    </>
  );
}

/**
 * The clickable cube widget. Must be rendered inside `<GizmoHelper>` so
 * `useGizmoContext` would resolve if we used it — we don't: drei's own
 * `tweenCamera` only rotates whatever camera is currently active and has no
 * notion of "flatten", so face and edge/corner clicks both go through our
 * own `onDirectionClick`, which drives everything (rotation + flatten
 * amount) as one continuous blend on `CameraAnimator` below.
 */
function ViewCubeFaces({
  onDirectionClick,
}: {
  onDirectionClick: (direction: THREE.Vector3, flatten: boolean) => void;
}) {
  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    // The main cube's faces sit at local position (0,0,0); drei's edge/corner
    // cubes are offset by `[axis].multiplyScalar(0.38)`, i.e. lengthSq() in
    // ~[0.29, 0.43] depending on how many axes are nonzero — never anywhere
    // near 1. (An earlier `< 1` threshold here was always true, so every
    // edge/corner click was silently misclassified as a face click.)
    const isMainFace = event.object.position.lengthSq() < 0.01;
    // For the main cube, the clicked face's normal is the axis to look down.
    // For edge/corner cubes, *don't* use event.face — they're real box
    // geometry too, so they always have one, but it's an axis-aligned normal
    // of that tiny cube (effectively arbitrary, depending on exactly where
    // you clicked it), not the diagonal direction the edge/corner represents.
    // Their own position (e.g. ~(1,1,0) for an edge, ~(1,1,1) for a corner)
    // *is* that diagonal — matches what drei's own default EdgeCube handler
    // uses internally.
    const direction = isMainFace && event.face ? event.face.normal.clone() : event.object.position.clone();
    onDirectionClick(direction.normalize(), isMainFace);
    return null;
  }

  return <GizmoViewcube faces={AXIS_FACE_LABELS} onClick={handleClick} />;
}

export interface CameraTrigger {
  /** Rotate to look along `direction`, and blend flatten to the given amount. */
  snapTo: (direction: THREE.Vector3, flatten: boolean) => void;
  /** Blend flatten back to normal perspective without touching orientation —
   * used when the user starts a manual drag, so it doesn't fight the drag by
   * also trying to reorient the camera. */
  unflatten: () => void;
}

/**
 * Drives every camera transition as continuous blends on a single persistent
 * PerspectiveCamera: orientation (quaternion slerp) and "flatten" amount
 * (fov, with distance recomputed each frame to keep the model's apparent
 * size constant) are independent channels, each easing from wherever it
 * currently is to a new target over a fixed duration — independent because a
 * manual drag needs to un-flatten *without* also fighting the user's own
 * rotation. Runs entirely on refs inside `useFrame` — no React state, no
 * re-renders — which is also why it isn't laggy: nothing here waits on a
 * render cycle.
 */
function CameraAnimator({
  sceneCenter,
  sceneRadius,
  controlsRef,
  triggerRef,
  isProgrammaticUpdate,
}: {
  sceneCenter: [number, number, number];
  sceneRadius: number;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  triggerRef: React.RefObject<CameraTrigger | null>;
  isProgrammaticUpdate: React.RefObject<boolean>;
}) {
  const startQuat = useRef(new THREE.Quaternion());
  const targetQuat = useRef(new THREE.Quaternion());
  const orientationProgress = useRef(1); // 1 = settled/idle

  const startFov = useRef(NORMAL_FOV);
  const targetFov = useRef(NORMAL_FOV);
  const flattenProgress = useRef(1);

  const pendingDirection = useRef<THREE.Vector3 | null>(null);
  const pendingFlatten = useRef<boolean | null>(null); // null = no pending fov change
  // The world-axis direction we're currently flattened/aligned to (a face
  // click), so clicking that same gizmo face again can flip to look from the
  // opposite side instead of re-snapping to the same view. Cleared whenever
  // the user takes manual control (see `unflatten`) or a non-face (edge/
  // corner) direction is snapped to, since neither leaves us "aligned" to a
  // single axis.
  const currentAxisDirection = useRef<THREE.Vector3 | null>(null);
  // A camera-typed helper, not a plain Object3D: THREE.Object3D.lookAt() and
  // THREE.Camera.lookAt() use opposite conventions (confirmed in three.js's
  // own source — Object3D deliberately builds the *reverse* orientation, so
  // a generic object's local +Z faces the target, useful for sprites/decals;
  // a camera's local -Z does). Using a plain Object3D here silently inverted
  // every axis this dummy ever computed — every "look from this direction"
  // came out backwards. Never rendered; just borrowing lookAt's camera math.
  const dummy = useMemo(() => new THREE.PerspectiveCamera(), []);
  const [centerX, centerY, centerZ] = sceneCenter;

  useEffect(() => {
    triggerRef.current = {
      snapTo: (direction, flatten) => {
        const clicked = direction.clone().normalize();
        // Clicking the same face we're already flattened/aligned to flips to
        // the opposite side instead of re-snapping to the identical view.
        const isSameAxis =
          flatten && currentAxisDirection.current !== null && currentAxisDirection.current.dot(clicked) > 0.99;
        const finalDirection = isSameAxis ? clicked.negate() : clicked;

        pendingDirection.current = finalDirection;
        pendingFlatten.current = flatten;
        currentAxisDirection.current = flatten ? finalDirection.clone() : null;
      },
      unflatten: () => {
        currentAxisDirection.current = null;
        // Immediately cede the orientation channel back to OrbitControls so
        // a drag starting mid-snap-animation doesn't fight our per-frame
        // quaternion writes.
        orientationProgress.current = 1;
        // Idempotent: only kick off a new blend if we're not already
        // targeting normal — without this, a continuous stream of onChange
        // events during a real drag would keep resetting flattenProgress to
        // 0 and the fov would never actually finish blending back.
        if (targetFov.current !== NORMAL_FOV) {
          pendingFlatten.current = false;
        }
      },
    };
  }, [triggerRef]);

  useFrame((state, delta) => {
    const camera = state.camera;
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const target = new THREE.Vector3(centerX, centerY, centerZ);

    if (pendingDirection.current) {
      const direction = pendingDirection.current;
      pendingDirection.current = null;
      startQuat.current.copy(camera.quaternion);
      const up =
        Math.abs(direction.y) > 0.9
          ? new THREE.Vector3(0, 0, direction.y > 0 ? -1 : 1)
          : new THREE.Vector3(0, 1, 0);
      dummy.position.copy(target).add(direction);
      dummy.up.copy(up);
      dummy.lookAt(target);
      targetQuat.current.copy(dummy.quaternion);
      orientationProgress.current = 0;
    }

    if (pendingFlatten.current !== null) {
      startFov.current = camera.fov;
      targetFov.current = pendingFlatten.current ? FLATTENED_FOV : NORMAL_FOV;
      pendingFlatten.current = null;
      flattenProgress.current = 0;
    }

    let changed = false;
    if (orientationProgress.current < 1) {
      orientationProgress.current = Math.min(1, orientationProgress.current + delta / BLEND_DURATION);
      camera.quaternion.slerpQuaternions(
        startQuat.current,
        targetQuat.current,
        easeInOutCubic(orientationProgress.current),
      );
      changed = true;
    }
    if (flattenProgress.current < 1) {
      flattenProgress.current = Math.min(1, flattenProgress.current + delta / BLEND_DURATION);
      camera.fov = THREE.MathUtils.lerp(
        startFov.current,
        targetFov.current,
        easeInOutCubic(flattenProgress.current),
      );
      changed = true;
    }

    if (changed) {
      const frustumHalf = sceneRadius * 1.15;
      const distance = frustumHalf / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      camera.position
        .copy(target)
        .addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion), distance);
      camera.near = Math.max(0.1, distance - sceneRadius * 3);
      camera.far = distance + sceneRadius * 3;
      camera.updateProjectionMatrix();

      const controls = controlsRef.current;
      if (controls) {
        // `controls.update()` fires OrbitControls' own 'change' event, which
        // Scene listens to (to unflatten on a *real* user drag) — without
        // this flag, that listener can't tell our own animation-driven sync
        // apart from actual user input, and would call unflatten() on every
        // single frame of this animation, cancelling it immediately.
        isProgrammaticUpdate.current = true;
        controls.target.copy(target);
        controls.update();
        isProgrammaticUpdate.current = false;
      }
    }
  });

  return null;
}

export function Scene({ boxGeometry, lidGeometry, dimensions, viewMode }: SceneProps) {
  const span = Math.max(dimensions.width, dimensions.depth, dimensions.totalHeight);
  const gap = Math.max(10, span * 0.08);

  const boxHalfW = dimensions.width / 2;
  const boxHalfD = dimensions.depth / 2;
  const lidHalfW = dimensions.lidOuterWidth / 2;
  const lidHalfD = dimensions.lidOuterDepth / 2;

  let lidPosition: [number, number, number];
  let lidRotation: [number, number, number] = [0, 0, 0];

  // Track the true bounding box of everything on screen — box always sits at
  // [-halfW, halfW] x [-halfD, halfD] x [0, totalHeight], but the lid's
  // position (and therefore the scene's real extent) varies a lot by mode.
  let minX = -boxHalfW;
  let maxX = boxHalfW;
  let minY = 0;
  let maxY = dimensions.totalHeight;
  let minZ = -boxHalfD;
  let maxZ = boxHalfD;

  function includeLidBounds(centerX: number, bottomY: number, topY: number) {
    minX = Math.min(minX, centerX - lidHalfW);
    maxX = Math.max(maxX, centerX + lidHalfW);
    minY = Math.min(minY, bottomY);
    maxY = Math.max(maxY, topY);
    minZ = Math.min(minZ, -lidHalfD);
    maxZ = Math.max(maxZ, lidHalfD);
  }

  if (viewMode === "assembled") {
    lidPosition = [0, dimensions.stepY, 0];
    includeLidBounds(0, dimensions.stepY, dimensions.stepY + dimensions.lidOuterHeight);
  } else if (viewMode === "sideBySide") {
    // Lid flipped cap-down/opening-up (matches its best print orientation)
    // and set beside the box rather than stacked on it.
    const offsetX = dimensions.width / 2 + gap + dimensions.lidOuterWidth / 2;
    lidPosition = [offsetX, dimensions.lidOuterHeight, 0];
    lidRotation = [Math.PI, 0, 0];
    includeLidBounds(offsetX, 0, dimensions.lidOuterHeight);
  } else {
    const explodedGap = Math.max(dimensions.lidOuterHeight, 10) * 1.5;
    const lidBottomY = dimensions.totalHeight + explodedGap;
    lidPosition = [0, lidBottomY, 0];
    includeLidBounds(0, lidBottomY, lidBottomY + dimensions.lidOuterHeight);
  }

  const sceneCenter: [number, number, number] = [
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2,
  ];
  const sceneRadius =
    Math.sqrt(
      ((maxX - minX) / 2) ** 2 + ((maxY - minY) / 2) ** 2 + ((maxZ - minZ) / 2) ** 2,
    ) + 5;

  const cameraDistance = sceneRadius * 2.2 + 40;
  // The flattened (near-orthographic) view needs the camera much farther
  // away than the normal perspective distance — the zoom-distance clamp
  // below has to accommodate that or it'll fight the flatten animation.
  const flattenedDistance =
    (sceneRadius * 1.15) / Math.tan(THREE.MathUtils.degToRad(FLATTENED_FOV) / 2);

  // Cap how far OrbitControls can zoom out so the model can't be zoomed away
  // into an unrecognizable speck (or panned/zoomed past the camera's far
  // clipping plane and vanish); cap zooming in too, so the camera can't push
  // through the geometry.
  const minZoomDistance = Math.max(5, span * 0.15);
  const maxZoomDistance = Math.max(cameraDistance * 2.5, flattenedDistance * 1.2);
  const cameraFar = maxZoomDistance * 1.5 + 500;

  const controlsRef = useRef<OrbitControlsImpl>(null);
  const triggerRef = useRef<CameraTrigger | null>(null);
  const isProgrammaticUpdate = useRef(false);

  return (
    <Canvas
      shadows
      camera={{
        position: [cameraDistance, cameraDistance * 0.8, cameraDistance],
        fov: NORMAL_FOV,
        far: cameraFar,
      }}
    >
      <CameraAnimator
        sceneCenter={sceneCenter}
        sceneRadius={sceneRadius}
        controlsRef={controlsRef}
        triggerRef={triggerRef}
        isProgrammaticUpdate={isProgrammaticUpdate}
      />
      <color attach="background" args={["#15181c"]} />
      <ambientLight intensity={0.6} />
      <ShadowLight center={sceneCenter} radius={sceneRadius} />
      <directionalLight position={[-120, 80, -100]} intensity={0.3} />
      <Grid
        position={[0, -0.01, 0]}
        args={[10, 10]}
        cellSize={10}
        sectionSize={50}
        infiniteGrid
        fadeDistance={600}
        cellColor="#3a3f47"
        sectionColor="#565f6b"
      />
      {boxGeometry && <BoxMesh geometry={boxGeometry} />}
      {lidGeometry && <LidMesh geometry={lidGeometry} position={lidPosition} rotation={lidRotation} />}
      <OrbitControls
        ref={controlsRef}
        makeDefault
        target={sceneCenter}
        minDistance={minZoomDistance}
        maxDistance={maxZoomDistance}
        // `onStart` fires on any pointerdown on the canvas — including a
        // click on the gizmo, which renders into the same canvas — so it
        // can't tell "starting a real drag" from "about to click a gizmo
        // face" apart. `onChange` only fires once the camera has actually
        // moved, which a plain click never does.
        onChange={() => {
          if (!isProgrammaticUpdate.current) triggerRef.current?.unflatten();
        }}
      />
      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <ViewCubeFaces
          onDirectionClick={(direction, flatten) => triggerRef.current?.snapTo(direction, flatten)}
        />
      </GizmoHelper>
    </Canvas>
  );
}
