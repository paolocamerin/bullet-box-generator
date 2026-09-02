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
  const explodedGap = Math.max(dimensions.lidOuterHeight, 10) * 1.5;
  const lidY = viewMode === "assembled" ? dimensions.stepY : dimensions.totalHeight + explodedGap;

  const span = Math.max(dimensions.width, dimensions.depth, dimensions.totalHeight);
  const cameraDistance = span * 2.2 + 40;

  return (
    <Canvas
      shadows
      camera={{ position: [cameraDistance, cameraDistance * 0.8, cameraDistance], fov: 40 }}
    >
      <color attach="background" args={["#15181c"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[150, 220, 120]} intensity={1.1} castShadow shadow-mapSize={[2048, 2048]} />
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
      {lidGeometry && <LidMesh geometry={lidGeometry} position={[0, lidY, 0]} />}
      <OrbitControls makeDefault target={[0, dimensions.totalHeight / 2, 0]} />
    </Canvas>
  );
}
