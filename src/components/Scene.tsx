import { Grid, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type * as THREE from "three";
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

export function Scene({ boxGeometry, lidGeometry, dimensions, viewMode }: SceneProps) {
  const span = Math.max(dimensions.width, dimensions.depth, dimensions.totalHeight);
  const gap = Math.max(10, span * 0.08);

  let lidPosition: [number, number, number];
  let lidRotation: [number, number, number] = [0, 0, 0];

  if (viewMode === "assembled") {
    lidPosition = [0, dimensions.stepY, 0];
  } else if (viewMode === "sideBySide") {
    // Lid flipped cap-down/opening-up (matches its best print orientation)
    // and set beside the box rather than stacked on it.
    const offsetX = dimensions.width / 2 + gap + dimensions.lidOuterWidth / 2;
    lidPosition = [offsetX, dimensions.lidOuterHeight, 0];
    lidRotation = [Math.PI, 0, 0];
  } else {
    const explodedGap = Math.max(dimensions.lidOuterHeight, 10) * 1.5;
    lidPosition = [0, dimensions.totalHeight + explodedGap, 0];
  }

  // Widen framing/lighting coverage when the side-by-side layout is wider
  // than the box alone.
  const effectiveSpan = viewMode === "sideBySide" ? Math.max(span, lidPosition[0] * 2) : span;
  const cameraDistance = effectiveSpan * 2.2 + 40;

  // The default DirectionalLight shadow camera is an orthographic frustum
  // sized to +/-5 units, which is far smaller than this model — most of the
  // geometry fell outside it, showing up as a hard-edged square shadow
  // artifact. Scale the light's distance and its shadow frustum with the
  // model instead of using fixed literals.
  const lightDistance = effectiveSpan * 1.8 + 60;
  const lightDirection = { x: 0.5136, y: 0.7534, z: 0.4109 }; // normalized (150, 220, 120)
  const lightPosition: [number, number, number] = [
    lightDirection.x * lightDistance,
    lightDirection.y * lightDistance,
    lightDirection.z * lightDistance,
  ];
  const shadowExtent = effectiveSpan * 1.2 + 20;

  return (
    <Canvas
      shadows
      camera={{ position: [cameraDistance, cameraDistance * 0.8, cameraDistance], fov: 40 }}
    >
      <color attach="background" args={["#15181c"]} />
      <ambientLight intensity={0.6} />
      <directionalLight
        position={lightPosition}
        intensity={1.1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        shadow-camera-near={1}
        shadow-camera-far={lightDistance + shadowExtent}
      />
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
      <OrbitControls makeDefault target={[0, dimensions.totalHeight / 2, 0]} />
    </Canvas>
  );
}
