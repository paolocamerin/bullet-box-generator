import type * as THREE from "three";

interface BoxMeshProps {
  geometry: THREE.BufferGeometry;
}

export function BoxMesh({ geometry }: BoxMeshProps) {
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color="#3d7a5c" roughness={0.55} metalness={0.05} />
    </mesh>
  );
}
