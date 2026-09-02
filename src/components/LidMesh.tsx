import type * as THREE from "three";

interface LidMeshProps {
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  rotation?: [number, number, number];
}

export function LidMesh({ geometry, position, rotation = [0, 0, 0] }: LidMeshProps) {
  return (
    <mesh geometry={geometry} position={position} rotation={rotation} castShadow receiveShadow>
      <meshStandardMaterial color="#c98b3a" roughness={0.5} metalness={0.05} transparent opacity={0.9} />
    </mesh>
  );
}
