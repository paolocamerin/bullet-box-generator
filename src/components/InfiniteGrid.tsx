import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

// Fork of drei's <Grid infiniteGrid> with one addition: a near-camera fade
// tied to actual camera-space depth, not just planar distance from the
// camera. Orthographic cameras use a razor-thin near plane (see
// ORTHOGRAPHIC_NEAR in Scene.tsx) to avoid hard-clipping the ground plane at
// grazing angles, but floating precision still leaves a visible seam right
// at that boundary. Fading alpha to 0 as view-space depth approaches `near`
// hides that seam under a soft fade instead of a hard clip, symmetric with
// the existing far-distance fade.
const VERTEX_SHADER = /* glsl */ `
  varying vec3 localPosition;
  varying vec4 worldPosition;
  varying float viewDepth;

  uniform float fadeDistance;

  void main() {
    localPosition = position.xzy * (1.0 + fadeDistance);
    worldPosition = modelMatrix * vec4(localPosition, 1.0);

    vec4 viewPosition = viewMatrix * worldPosition;
    viewDepth = -viewPosition.z;

    gl_Position = projectionMatrix * viewPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying vec3 localPosition;
  varying vec4 worldPosition;
  varying float viewDepth;

  uniform vec3 worldCamProjPosition;
  uniform float cellSize;
  uniform float sectionSize;
  uniform vec3 cellColor;
  uniform vec3 sectionColor;
  uniform float fadeDistance;
  uniform float cellThickness;
  uniform float sectionThickness;
  uniform float cameraNear;
  uniform float nearFadeRange;

  float getGrid(float size, float thickness) {
    vec2 r = localPosition.xz / size;
    vec2 grid = abs(fract(r - 0.5) - 0.5) / fwidth(r);
    float line = min(grid.x, grid.y) + 1.0 - thickness;
    return 1.0 - min(line, 1.0);
  }

  void main() {
    float g1 = getGrid(cellSize, cellThickness);
    float g2 = getGrid(sectionSize, sectionThickness);

    float dist = distance(worldCamProjPosition, worldPosition.xyz);
    float farFade = 1.0 - min(dist / fadeDistance, 1.0);
    float nearFade = smoothstep(cameraNear, cameraNear + nearFadeRange, viewDepth);
    vec3 color = mix(cellColor, sectionColor, min(1.0, sectionThickness * g2));

    gl_FragColor = vec4(color, (g1 + g2) * farFade * nearFade);
    gl_FragColor.a = mix(0.75 * gl_FragColor.a, gl_FragColor.a, g2);
    if (gl_FragColor.a <= 0.0) discard;

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

interface InfiniteGridProps {
  position?: [number, number, number];
  args?: [number, number];
  cellSize?: number;
  sectionSize?: number;
  cellColor?: THREE.ColorRepresentation;
  sectionColor?: THREE.ColorRepresentation;
  cellThickness?: number;
  sectionThickness?: number;
  fadeDistance?: number;
  nearFadeRange?: number;
}

export function InfiniteGrid({
  position = [0, 0, 0],
  args = [1, 1],
  cellSize = 0.5,
  sectionSize = 1,
  cellColor = "#000000",
  sectionColor = "#2080ff",
  cellThickness = 0.5,
  sectionThickness = 1,
  fadeDistance = 100,
  nearFadeRange = 20,
}: InfiniteGridProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);

  const material = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      uniforms: {
        cellSize: { value: cellSize },
        sectionSize: { value: sectionSize },
        cellColor: { value: new THREE.Color(cellColor) },
        sectionColor: { value: new THREE.Color(sectionColor) },
        cellThickness: { value: cellThickness },
        sectionThickness: { value: sectionThickness },
        fadeDistance: { value: fadeDistance },
        nearFadeRange: { value: nearFadeRange },
        cameraNear: { value: 0 },
        worldCamProjPosition: { value: new THREE.Vector3() },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
    });
    return mat;
  }, []);

  useEffect(() => {
    material.uniforms.cellSize.value = cellSize;
    material.uniforms.sectionSize.value = sectionSize;
    (material.uniforms.cellColor.value as THREE.Color).set(cellColor);
    (material.uniforms.sectionColor.value as THREE.Color).set(sectionColor);
    material.uniforms.cellThickness.value = cellThickness;
    material.uniforms.sectionThickness.value = sectionThickness;
    material.uniforms.fadeDistance.value = fadeDistance;
    material.uniforms.nearFadeRange.value = nearFadeRange;
  }, [
    material,
    cellSize,
    sectionSize,
    cellColor,
    sectionColor,
    cellThickness,
    sectionThickness,
    fadeDistance,
    nearFadeRange,
  ]);

  useEffect(() => () => material.dispose(), [material]);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3());
    plane.applyMatrix4(mesh.matrixWorld);
    plane.projectPoint(
      state.camera.position,
      material.uniforms.worldCamProjPosition.value as THREE.Vector3,
    );
    material.uniforms.cameraNear.value = state.camera.near;
  });

  return (
    <mesh ref={meshRef} position={position} frustumCulled={false}>
      <planeGeometry args={args} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
