import { GizmoHelper, GizmoViewcube, Grid, OrbitControls } from "@react-three/drei";
import { Canvas, type Camera as R3FCamera, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { DerivedDimensions } from "../geometry/dimensions";
import type { ProjectionMode, ViewMode } from "../types";
import { BoxMesh } from "./BoxMesh";
import { LidMesh } from "./LidMesh";

interface SceneProps {
  boxGeometry: THREE.BufferGeometry | null;
  lidGeometry: THREE.BufferGeometry | null;
  dimensions: DerivedDimensions;
  viewMode: ViewMode;
  projectionMode: ProjectionMode;
}

const LIGHT_DIRECTION = { x: 0.5136, y: 0.7534, z: 0.4109 }; // normalized (150, 220, 120)

// Matches three.js BoxGeometry's default material-group order (+X,-X,+Y,-Y,+Z,-Z),
// which is also the order GizmoViewcube indexes its `faces` labels by.
const AXIS_FACE_LABELS = ["X+", "X-", "Y+", "Y-", "Z+", "Z-"];

const BLEND_DURATION = 0.45; // seconds
const NORMAL_FOV = 40;

// OrbitControls forcibly calls `object.lookAt(target)` at the end of every
// single internal update() (verified in three.js's OrbitControls source) —
// so a view direction sitting exactly on the +/-Y pole collides with
// Object3D.lookAt()'s well-known singularity (undefined roll when the view
// direction is parallel to `camera.up`), producing an unstable/snapping
// orientation once that forced lookAt takes over. Nudging by a couple of
// degrees is visually indistinguishable from true top-down but avoids the
// singularity entirely; used both for OrbitControls' own polar-angle clamp
// (manual dragging near the poles) and for the gizmo's Y+/Y- click targets,
// so neither ever asks for the exact pole in the first place. Applies to
// both projection types equally — the singularity is a `lookAt`/`up`
// property, independent of projection matrix.
const POLE_EPSILON = THREE.MathUtils.degToRad(2);

// Orthographic zoom limits: dimensionless multipliers on the "fit" framing
// established by the camera's frustum bounds (zoom=1 exactly frames the
// model) — unlike distance-based limits, these don't need to scale with
// model size, since the frustum itself is already normalized to
// sceneRadius/aspect.
const MIN_ZOOM = 0.6; // max zoom-out limit
const MAX_ZOOM = 6; // max zoom-in limit

// drei's OrbitControls defaults `enableDamping` to true but leaves
// `dampingFactor` at three.js's own default of 0.05 — a slow, floaty decay
// (~1s to settle) that reads as "inertia" after releasing a drag. Higher =
// snappier/less glide, lower = more momentum; 1 disables the smoothing
// entirely (settles in a single frame).
const DAMPING_FACTOR = 0.25;

// The <Grid>'s own fade-out distance (world units from the camera's ground
// projection) — see GRID_FADE_MARGIN's comment for why the camera's `far`
// plane needs to know this value too.
const GRID_FADE_DISTANCE = 600;
// drei's <Grid>, with `infiniteGrid`, scales its actual plane geometry to
// `planeSize * (1 + fadeDistance)` in its vertex shader — with our fadeDistance
// this is a many-thousand-unit plane — but its fragment shader smoothly fades
// it to fully transparent (alpha discarded) exactly at `dist = fadeDistance`.
// The camera's `far` plane used to be computed purely from the *model's* size
// (orbitRadius/sceneRadius), completely independent of this — for a small
// grid/model, `far` could end up smaller than GRID_FADE_DISTANCE, hard-
// clipping the grid mid-fade well before the shader's own smooth fade
// completes. Looks exactly like an abrupt cutoff instead of a fade. `far`
// must always comfortably exceed GRID_FADE_DISTANCE, regardless of model
// size — the 20% margin keeps the hard clip a bit past the point where the
// grid is already fully transparent, rather than exactly at that boundary.
const GRID_FADE_MARGIN = 1.2;

// For a point on an extended ground plane, camera-space depth (distance
// along the view axis) approaches zero right at the "grazing transition"
// line where the plane crosses from in-front-of to behind-the-camera — this
// can happen at large *world-space* distances depending on viewing angle.
// In perspective mode that region sits outside the narrow FOV cone, so it's
// never visible regardless of the near plane. In orthographic mode the
// frustum is a rectangular box that doesn't narrow with depth, so that same
// near-zero-depth strip IS inside the visible frame — with too large a near
// plane, it gets hard-clipped right there, looking like the grid abruptly
// disappearing as it sweeps toward the camera. An orthographic camera's
// depth-buffer precision is linear across [near, far] (unlike perspective's
// near-weighted precision), so going this small is safe here.
const ORTHOGRAPHIC_NEAR = 0.001;

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
 * The orthographic view camera. Raw `<orthographicCamera>` JSX intrinsic,
 * not drei's `<OrthographicCamera>` wrapper — see the note on
 * `PerspectiveSceneCamera` below for why we dropped it in favor of doing
 * this ourselves.
 *
 * `manual` is load-bearing, not decorative: R3F's own core store subscribes
 * to size/dpr changes and, for whichever camera is currently `state.camera`,
 * runs its own internal `updateCamera()` on *every* resize — for an
 * orthographic camera that means forcibly overwriting left/right/top/bottom
 * with raw *pixel*-unit values (`size.width/-2` etc — see
 * `node_modules/@react-three/fiber`'s `updateCamera()`), completely
 * clobbering our own world-unit framing below. Setting `camera.manual = true`
 * is R3F's own documented escape hatch for exactly this ("don't mess with a
 * camera that belongs to the user" — traces to a real, referenced R3F issue
 * in that function's source) and is what was missing — this is the actual
 * fix for "resizing the window squishes the geometry until you refresh."
 *
 * `initialPosition`/`orbitRadius` are frozen per view-mode switch (see
 * `Scene`, keyed on `[viewMode]`) — not on every dimension tweak — so the
 * camera gets a sensible fresh framing when the layout drastically changes
 * (assembled/exploded/side-by-side sit at very different scales/offsets),
 * but never yanks itself out from under an ordinary slider adjustment or a
 * manual orbit/zoom the user is mid-way through. The *same* frozen
 * `initialPosition` is shared with `PerspectiveSceneCamera` below — it's
 * just a world-space point, equally valid for either projection type; only
 * the frustum specifics (this component's left/right/top/bottom vs. the
 * other's fov) differ per type.
 */
function OrthographicSceneCamera({
  cameraRef,
  initialPosition,
  orbitRadius,
  sceneRadius,
  viewMode,
}: {
  cameraRef: React.RefObject<THREE.OrthographicCamera | null>;
  initialPosition: [number, number, number];
  orbitRadius: number;
  sceneRadius: number;
  viewMode: ViewMode;
}) {
  const { width, height } = useThree((state) => state.size);
  const aspect = height > 0 ? width / height : 1;

  // Fit a sphere of this radius in the viewport regardless of aspect: the
  // *smaller* screen dimension is the constraining one.
  const frustumHalf = sceneRadius * 1.15;
  const halfHeight = frustumHalf / Math.min(1, aspect);
  const halfWidth = frustumHalf * Math.max(1, aspect);

  // Orthographic zoom (OrbitControls, verified in its source) only ever
  // mutates `camera.zoom` — it never moves `camera.position`. Combined with
  // orbit/pan preserving distance-to-target, the camera's distance from
  // whatever it's looking at is therefore a fixed invariant for the whole
  // session (barring a view-mode-triggered reframe) — far only needs to
  // safely bound that one frozen `orbitRadius`, not track anything live.
  // Also floored at the Grid's own fade distance (see GRID_FADE_MARGIN) so
  // the ground grid isn't hard-clipped mid-fade for small models.
  const near = ORTHOGRAPHIC_NEAR;
  const far = Math.max(orbitRadius + sceneRadius * 4 + 200, GRID_FADE_DISTANCE * GRID_FADE_MARGIN);

  // `zoom` is a plain three.js camera scalar, not something `position`-style
  // prop-diffing can "reset on trigger" (a hardcoded literal prop never
  // differs from its own previous value, so R3F never reapplies it past the
  // first mount) — an explicit imperative effect is required to reset it
  // alongside the position reframe whenever the view mode changes, so a
  // stale zoom level doesn't make the freshly-reframed model look
  // unexpectedly tiny or huge.
  useEffect(() => {
    if (cameraRef.current) {
      cameraRef.current.zoom = 1;
      cameraRef.current.updateProjectionMatrix();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  // R3F's generic prop application (verified directly in its `applyProps`
  // source: every camera prop just falls through to a plain
  // `root[key] = value` assignment) never calls `updateProjectionMatrix()`
  // for any camera property — without this, left/right/top/bottom would be
  // set on the object but the cached projection matrix would never actually
  // recompute, so changes would silently never take visual effect.
  //
  // Also where `.manual` gets set (see the class doc comment for why) —
  // imperatively rather than as a JSX prop, since it's a runtime-only R3F
  // convention (`camera.manual`, checked by `updateCamera()`), not a real
  // three.js camera property, so it isn't part of the auto-generated JSX
  // intrinsic's prop types (which are derived purely from the three.js
  // class's own properties). `R3FCamera` is R3F's own public type for
  // exactly this — a plain camera intersected with `{ manual?: boolean }`.
  useLayoutEffect(() => {
    const camera = cameraRef.current as R3FCamera | null;
    if (!camera) return;
    camera.manual = true;
    camera.updateProjectionMatrix();
  });

  return (
    <orthographicCamera
      ref={cameraRef}
      position={initialPosition}
      left={-halfWidth}
      right={halfWidth}
      top={halfHeight}
      bottom={-halfHeight}
      near={near}
      far={far}
    />
  );
}

/**
 * The perspective view camera — the counterpart to `OrthographicSceneCamera`
 * above, sharing the same frozen `initialPosition`. No `zoom` concept here:
 * OrbitControls dollies a perspective camera by moving `camera.position`
 * (distance-based, via `minDistance`/`maxDistance`), which the reactive
 * `position` prop already resets correctly on a view-mode change — no
 * separate imperative reset effect needed, unlike the orthographic case.
 *
 * Raw `<perspectiveCamera>` intrinsic rather than drei's `<PerspectiveCamera>`
 * wrapper: once both cameras need `manual` (see the orthographic camera's
 * comment — this is what actually fixes the resize bug) drei's own
 * auto-`aspect` logic gets disabled too, since it shares the exact same
 * `props.manual` check internally — so we'd have to compute `aspect`
 * ourselves regardless. At that point the wrapper's only remaining
 * contribution was calling `updateProjectionMatrix()` once per render — one
 * line, easy to just do directly (see the `useLayoutEffect` below) — so
 * dropping the wrapper removes a layer instead of fighting it, and makes
 * every projection-matrix update explicit and visible in this file.
 */
function PerspectiveSceneCamera({
  cameraRef,
  initialPosition,
  orbitRadius,
  sceneRadius,
}: {
  cameraRef: React.RefObject<THREE.PerspectiveCamera | null>;
  initialPosition: [number, number, number];
  orbitRadius: number;
  sceneRadius: number;
}) {
  const { width, height } = useThree((state) => state.size);
  const aspect = height > 0 ? width / height : 1;

  // Floored at the Grid's own fade distance — see GRID_FADE_MARGIN's comment
  // on the orthographic camera above (same reasoning applies here).
  const near = 0.1;
  const far = Math.max(orbitRadius + sceneRadius * 4 + 200, GRID_FADE_DISTANCE * GRID_FADE_MARGIN);

  // See OrthographicSceneCamera's comment for the full reasoning on both the
  // `.manual` assignment and the `updateProjectionMatrix()` call. Strictly,
  // `manual` is less critical here — R3F's own fallback for a perspective
  // camera computes the identical `aspect` formula we do — but setting it
  // keeps both cameras on the same fully-self-contained pattern rather than
  // one relying on R3F's internal behavior and the other not.
  useLayoutEffect(() => {
    const camera = cameraRef.current as R3FCamera | null;
    if (!camera) return;
    camera.manual = true;
    camera.updateProjectionMatrix();
  });

  return (
    <perspectiveCamera
      ref={cameraRef}
      position={initialPosition}
      fov={NORMAL_FOV}
      aspect={aspect}
      near={near}
      far={far}
    />
  );
}

/**
 * The sole authority over which camera is `state.camera` — deliberately
 * bypasses both `<PerspectiveCamera makeDefault>`/`<OrthographicCamera
 * makeDefault>` entirely (neither camera component is ever given that prop).
 *
 * Traced drei's `makeDefault` implementation (identical in both components):
 * each one's own effect does `oldCam = camera; set({camera: self}); return
 * () => set({camera: oldCam})`. That's correct for the common case (one
 * camera mounts/unmounts), but breaks for two *permanently-mounted* cameras
 * whose `makeDefault` prop flips back and forth — each side's cleanup
 * captures a stale, independently-closed-over `oldCam` snapshot from
 * whenever *it* last activated, and repeated toggling desyncs the two
 * closures until a cleanup restores `state.camera` to a stale intermediate
 * value that's neither of our two real cameras (worked through the exact
 * fiber-order trace; a second perspective<->orthographic round trip reliably
 * reproduces it). Centralizing the swap here — one ref tracking what was
 * previously active, one imperative `set()` call — has no such staleness:
 * there's only one piece of state, owned in one place.
 *
 * Also copies position/orientation from whichever camera was active a
 * moment ago onto the one becoming active, so toggling projection mode
 * preserves the exact current view (only the projection math changes)
 * instead of jumping to that camera's own last-used framing.
 *
 * `useLayoutEffect` (not `useEffect`) so this lands before the next actual
 * WebGL render — R3F's render loop runs outside React's commit phase, so
 * this only needs to beat that, not any particular ordering against the
 * camera components' own layout effects (which only touch the independent
 * projection matrix, never position/orientation).
 */
function ProjectionSync({
  projectionMode,
  perspectiveCameraRef,
  orthographicCameraRef,
}: {
  projectionMode: ProjectionMode;
  perspectiveCameraRef: React.RefObject<THREE.PerspectiveCamera | null>;
  orthographicCameraRef: React.RefObject<THREE.OrthographicCamera | null>;
}) {
  const set = useThree((state) => state.set);
  const previousMode = useRef<ProjectionMode | null>(null);

  useLayoutEffect(() => {
    const incoming =
      projectionMode === "perspective" ? perspectiveCameraRef.current : orthographicCameraRef.current;
    if (!incoming) return;

    if (previousMode.current !== null && previousMode.current !== projectionMode) {
      const outgoing =
        previousMode.current === "perspective" ? perspectiveCameraRef.current : orthographicCameraRef.current;
      if (outgoing) {
        incoming.position.copy(outgoing.position);
        incoming.quaternion.copy(outgoing.quaternion);
      }
    }

    set({ camera: incoming });
    previousMode.current = projectionMode;
  }, [projectionMode, perspectiveCameraRef, orthographicCameraRef, set]);

  return null;
}

/**
 * The clickable cube widget. Reports the raw, honest clicked-face/edge/
 * corner direction — any adjustment for OrbitControls compatibility (the
 * pole nudge, same-face flip) belongs in `CameraAnimator`, which owns the
 * actual camera-motion concerns.
 */
function ViewCubeFaces({ onDirectionClick }: { onDirectionClick: (direction: THREE.Vector3) => void }) {
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
    onDirectionClick(direction.normalize());
    return null;
  }

  return <GizmoViewcube faces={AXIS_FACE_LABELS} onClick={handleClick} />;
}

export interface CameraTrigger {
  /** Rotate to look along `direction`, preserving the current orbit distance. */
  snapTo: (direction: THREE.Vector3) => void;
  /** Stop an in-progress snap immediately — used when the user starts a real
   * drag, so it doesn't fight the drag by continuing to reorient the camera. */
  cancelBlend: () => void;
}

/**
 * Animates only camera *orientation* — a single quaternion slerp, holding
 * orbit radius constant throughout. No fov, no near/far, no per-frame
 * distance recompute: none of that coupling that used to exist when a single
 * camera faked orthographic by shrinking its fov toward zero. Works
 * identically for either concrete camera type (perspective or orthographic)
 * — it only ever touches `position`/`quaternion`, both plain `THREE.Camera`
 * properties independent of projection type.
 *
 * Deliberately doesn't call drei's own `GizmoHelper.tweenCamera` — traced its
 * source (installed version 10.7.8) and found it computes orbit radius via
 * `camera.position.distanceTo(target)` where `target` is a module-level
 * `Vector3` fixed at the world origin, not the actual focus point. That only
 * breaks when the scene's orbit target isn't at the origin — exactly our
 * case, since `sceneCenter` shifts per view mode — so this keeps a small
 * custom animator instead, correctly rooted in the *live* `controls.target`.
 */
function CameraAnimator({
  sceneCenter,
  controlsRef,
  triggerRef,
  isProgrammaticUpdate,
}: {
  sceneCenter: [number, number, number];
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  triggerRef: React.RefObject<CameraTrigger | null>;
  isProgrammaticUpdate: React.RefObject<boolean>;
}) {
  const startQuat = useRef(new THREE.Quaternion());
  const targetQuat = useRef(new THREE.Quaternion());
  const orientationProgress = useRef(1); // 1 = settled/idle
  const radius = useRef(0); // orbit distance, captured once per click, held constant through the blend

  const pendingDirection = useRef<THREE.Vector3 | null>(null);
  // The world-axis direction we're currently aligned to (a face click), so
  // clicking that same gizmo face again can flip to look from the opposite
  // side instead of re-snapping to the same view. Cleared whenever the user
  // takes manual control, or a non-face (edge/corner) direction is snapped
  // to, since neither leaves us "aligned" to a single axis.
  const currentAxisDirection = useRef<THREE.Vector3 | null>(null);
  // A camera-typed helper, not a plain Object3D: THREE.Object3D.lookAt() and
  // THREE.Camera.lookAt() use opposite conventions (confirmed in three.js's
  // own source — Object3D deliberately builds the *reverse* orientation, so
  // a generic object's local +Z faces the target, useful for sprites/decals;
  // a camera's local -Z does). Using a plain Object3D here silently inverted
  // every axis this dummy ever computed — every "look from this direction"
  // came out backwards. Never rendered; just borrowing lookAt's camera math
  // — its own concrete subtype doesn't matter, the override is at the
  // `Camera` level, shared by every camera type.
  const dummy = useMemo(() => new THREE.OrthographicCamera(), []);
  const [centerX, centerY, centerZ] = sceneCenter;

  useEffect(() => {
    triggerRef.current = {
      snapTo: (direction) => {
        const clicked = direction.clone().normalize();
        // Nudge an exact top/bottom-face click a hair off the true pole —
        // see POLE_EPSILON's comment for why the exact pole is unsafe here.
        if (Math.abs(clicked.y) > 1 - 1e-6) {
          clicked.set(0, Math.sign(clicked.y) * Math.cos(POLE_EPSILON), Math.sin(POLE_EPSILON));
        }
        // Clicking the same face we're already aligned to flips to the
        // opposite side instead of re-snapping to the identical view.
        const isSameAxis =
          currentAxisDirection.current !== null && currentAxisDirection.current.dot(clicked) > 0.99;
        const finalDirection = isSameAxis ? clicked.negate() : clicked;

        pendingDirection.current = finalDirection;
        currentAxisDirection.current = finalDirection.clone();
      },
      cancelBlend: () => {
        currentAxisDirection.current = null;
        // Immediately cede orientation back to OrbitControls so a drag
        // starting mid-snap doesn't fight our per-frame quaternion writes.
        orientationProgress.current = 1;
      },
    };
  }, [triggerRef]);

  useFrame((state, delta) => {
    const camera = state.camera;
    if (!(camera instanceof THREE.OrthographicCamera) && !(camera instanceof THREE.PerspectiveCamera)) return;
    const target = new THREE.Vector3(centerX, centerY, centerZ);

    if (pendingDirection.current) {
      const direction = pendingDirection.current;
      pendingDirection.current = null;
      radius.current = camera.position.distanceTo(target);
      startQuat.current.copy(camera.quaternion);
      dummy.position.copy(target).add(direction);
      dummy.up.set(0, 1, 0);
      dummy.lookAt(target);
      targetQuat.current.copy(dummy.quaternion);
      orientationProgress.current = 0;
    }

    if (orientationProgress.current < 1) {
      orientationProgress.current = Math.min(1, orientationProgress.current + delta / BLEND_DURATION);
      camera.quaternion.slerpQuaternions(
        startQuat.current,
        targetQuat.current,
        easeInOutCubic(orientationProgress.current),
      );
      const backDirection = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
      camera.position.copy(target).addScaledVector(backDirection, radius.current);

      const controls = controlsRef.current;
      if (controls) {
        // `controls.update()` fires OrbitControls' own 'change' event, which
        // Scene listens to (to cancel the blend on a *real* user drag) —
        // without this flag, that listener can't tell our own animation-
        // driven sync apart from actual user input, and would cancel the
        // blend on every single frame of this animation, immediately.
        isProgrammaticUpdate.current = true;
        controls.target.copy(target);
        controls.update();
        isProgrammaticUpdate.current = false;
      }
    }
  });

  return null;
}

export function Scene({ boxGeometry, lidGeometry, dimensions, viewMode, projectionMode }: SceneProps) {
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

  // Frozen per view-mode switch, not per dimension tweak — see
  // OrthographicSceneCamera's doc comment for why. Shared by both camera
  // components; only the frustum specifics (fov vs left/right/top/bottom)
  // differ per projection type.
  const initialFraming = useMemo(() => {
    const d = sceneRadius * 2.5 + 40;
    const offset: [number, number, number] = [d, d * 0.8, d];
    return {
      position: [sceneCenter[0] + offset[0], sceneCenter[1] + offset[1], sceneCenter[2] + offset[2]] as [
        number,
        number,
        number,
      ],
      orbitRadius: Math.hypot(offset[0], offset[1], offset[2]),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  // Perspective's distance-based zoom limits, roughly matching the
  // orthographic MIN_ZOOM/MAX_ZOOM in spirit (similarly tightened max
  // zoom-out) so neither projection mode feels more/less constrained than
  // the other.
  const cameraDistance = sceneRadius * 2.2 + 40;
  const minDistance = Math.max(5, span * 0.15);
  const maxDistance = cameraDistance * 1.75;

  const controlsRef = useRef<OrbitControlsImpl>(null);
  const triggerRef = useRef<CameraTrigger | null>(null);
  const isProgrammaticUpdate = useRef(false);
  const perspectiveCameraRef = useRef<THREE.PerspectiveCamera>(null);
  const orthographicCameraRef = useRef<THREE.OrthographicCamera>(null);

  return (
    <Canvas shadows>
      <PerspectiveSceneCamera
        cameraRef={perspectiveCameraRef}
        initialPosition={initialFraming.position}
        orbitRadius={initialFraming.orbitRadius}
        sceneRadius={sceneRadius}
      />
      <OrthographicSceneCamera
        cameraRef={orthographicCameraRef}
        initialPosition={initialFraming.position}
        orbitRadius={initialFraming.orbitRadius}
        sceneRadius={sceneRadius}
        viewMode={viewMode}
      />
      <ProjectionSync
        projectionMode={projectionMode}
        perspectiveCameraRef={perspectiveCameraRef}
        orthographicCameraRef={orthographicCameraRef}
      />
      <CameraAnimator
        sceneCenter={sceneCenter}
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
        fadeDistance={GRID_FADE_DISTANCE}
        cellColor="#3a3f47"
        sectionColor="#565f6b"
      />
      {boxGeometry && <BoxMesh geometry={boxGeometry} />}
      {lidGeometry && <LidMesh geometry={lidGeometry} position={lidPosition} rotation={lidRotation} />}
      <OrbitControls
        ref={controlsRef}
        makeDefault
        target={sceneCenter}
        dampingFactor={DAMPING_FACTOR}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        minDistance={minDistance}
        maxDistance={maxDistance}
        minPolarAngle={POLE_EPSILON}
        maxPolarAngle={Math.PI - POLE_EPSILON}
        // `onStart` fires on any pointerdown on the canvas — including a
        // click on the gizmo, which renders into the same canvas — so it
        // can't tell "starting a real drag" from "about to click a gizmo
        // face" apart. `onChange` only fires once the camera has actually
        // moved, which a plain click never does.
        onChange={() => {
          if (!isProgrammaticUpdate.current) triggerRef.current?.cancelBlend();
        }}
      />
      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <ViewCubeFaces onDirectionClick={(direction) => triggerRef.current?.snapTo(direction)} />
      </GizmoHelper>
    </Canvas>
  );
}
