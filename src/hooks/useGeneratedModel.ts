import { useEffect, useMemo, useState } from "react";
import type * as THREE from "three";
import { buildBoxGeometry } from "../geometry/buildBoxGeometry";
import { buildLidGeometry } from "../geometry/buildLidGeometry";
import { computeDimensions, type DerivedDimensions } from "../geometry/dimensions";
import { validateParams, type ValidationMessage } from "../geometry/validation";
import type { BoxParams } from "../types";

const DEBOUNCE_MS = 200;

export interface GeneratedModel {
  dimensions: DerivedDimensions;
  validation: ValidationMessage[];
  boxGeometry: THREE.BufferGeometry | null;
  lidGeometry: THREE.BufferGeometry | null;
  isRegenerating: boolean;
}

function useDisposableGeometry(geometry: THREE.BufferGeometry | null) {
  useEffect(() => {
    return () => geometry?.dispose();
  }, [geometry]);
}

export function useGeneratedModel(params: BoxParams): GeneratedModel {
  const [debounced, setDebounced] = useState(params);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(params), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [params]);

  const dimensions = useMemo(() => computeDimensions(debounced), [debounced]);
  const validation = useMemo(() => validateParams(debounced), [debounced]);
  const hasError = validation.some((m) => m.severity === "error");

  const boxGeometry = useMemo<THREE.BufferGeometry | null>(() => {
    if (hasError) return null;
    try {
      return buildBoxGeometry(debounced);
    } catch (error) {
      console.error("Failed to build box geometry", error);
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, hasError]);

  const lidGeometry = useMemo<THREE.BufferGeometry | null>(() => {
    if (hasError) return null;
    try {
      return buildLidGeometry(debounced);
    } catch (error) {
      console.error("Failed to build lid geometry", error);
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, hasError]);

  useDisposableGeometry(boxGeometry);
  useDisposableGeometry(lidGeometry);

  return {
    dimensions,
    validation,
    boxGeometry,
    lidGeometry,
    isRegenerating: debounced !== params,
  };
}
