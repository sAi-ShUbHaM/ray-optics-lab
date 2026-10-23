/**
 * Vector analysis of reflection from a plane mirror.
 *
 * Conventions match the backend (/simulate/reflection):
 *   incident direction   d = (cos α, sin α)          α = ray angle
 *   mirror direction     m = (cos β, sin β)          β = mirror angle
 *   mirror normal        n = (−sin β, cos β)
 *   reflected direction  r = d − 2 (d·n) n
 *
 * Everything here is derived from the two input angles with the same formulas
 * the backend uses. The page also compares r with the backend's own
 * reflected_direction, so the panel never shows a value the backend disagrees with.
 */

export type Vec = [number, number];

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1];
const scale = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k];
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];
const clamp1 = (x: number) => Math.max(-1, Math.min(1, x));

export type ReflectionVectors = {
  alphaDeg: number;
  betaDeg: number;
  /** unit incident direction */
  d: Vec;
  /** unit mirror normal, as the backend defines it */
  n: Vec;
  /** unit vector along the mirror surface */
  m: Vec;
  /** d · n */
  dDotN: number;
  /** normal pointing back towards the side the ray arrives from */
  nIn: Vec;
  /** component of d perpendicular to the mirror: (d·n) n */
  dPerp: Vec;
  /** component of d along the mirror: d − (d·n) n */
  dPar: Vec;
  /** unit reflected direction */
  r: Vec;
  incidenceDeg: number;
  reflectionDeg: number;
  /** angle between d and r, equal to 180° − 2i */
  deviationDeg: number;
};

export function computeReflectionVectors(
  rayAngleDeg: number,
  mirrorAngleDeg: number,
): ReflectionVectors {
  const a = rayAngleDeg * RAD;
  const b = mirrorAngleDeg * RAD;

  const d: Vec = [Math.cos(a), Math.sin(a)];
  const m: Vec = [Math.cos(b), Math.sin(b)];
  const n: Vec = [-Math.sin(b), Math.cos(b)];

  const dDotN = dot(d, n);
  const dPerp = scale(n, dDotN);
  const dPar = sub(d, dPerp);
  const r = sub(d, scale(n, 2 * dDotN));

  // The ray travels into the mirror, so the normal on its own side is the one
  // that makes a negative dot product with d.
  const nIn: Vec = dDotN < 0 ? n : scale(n, -1);

  return {
    alphaDeg: rayAngleDeg,
    betaDeg: mirrorAngleDeg,
    d,
    n,
    m,
    dDotN,
    nIn,
    dPerp,
    dPar,
    r,
    incidenceDeg: Math.acos(clamp1(-dot(d, nIn))) * DEG,
    reflectionDeg: Math.acos(clamp1(dot(r, nIn))) * DEG,
    deviationDeg: Math.acos(clamp1(dot(d, r))) * DEG,
  };
}

/** Largest absolute difference between two 2-D vectors. */
export function maxAbsDiff(a: Vec, b: Vec): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
}

/** Fixed-decimals number without a negative zero ("-0.000" becomes "0.000"). */
export function fmt(x: number, digits = 3): string {
  const s = x.toFixed(digits);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
}

export function fmtVec(v: Vec, digits = 3): string {
  return `(${fmt(v[0], digits)}, ${fmt(v[1], digits)})`;
}

export { add as vecAdd, scale as vecScale, dot as vecDot };
