import type * as THREE from "three";

interface LidMeshProps {
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
}

export function LidMesh({ geometry, position }: LidMeshProps) {
  return (
    <mesh geometry={geometry} position={position} castShadow receiveShadow>
      <meshStandardMaterial color="#c98b3a" roughness={0.5} metalness={0.05} transparent opacity={0.9} />
    </mesh>
  );
}
