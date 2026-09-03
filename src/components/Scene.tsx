import { Grid, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
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

  // Cap how far OrbitControls can zoom out so the model can't be zoomed away
  // into an unrecognizable speck (or panned/zoomed past the camera's far
  // clipping plane and vanish); cap zooming in too, so the camera can't push
  // through the geometry.
  const minZoomDistance = Math.max(5, span * 0.15);
  const maxZoomDistance = cameraDistance * 2.5;
  const cameraFar = maxZoomDistance * 1.5 + 500;

  return (
    <Canvas
      shadows
      camera={{
        position: [cameraDistance, cameraDistance * 0.8, cameraDistance],
        fov: 40,
        far: cameraFar,
      }}
    >
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
        makeDefault
        target={[0, dimensions.totalHeight / 2, 0]}
        minDistance={minZoomDistance}
        maxDistance={maxZoomDistance}
      />
    </Canvas>
  );
}
