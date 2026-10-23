/**
 * Vector form of Snell's law for a flat interface.
 *
 * Conventions match the backend (/simulate/refraction):
 *   interface along y = 0, unit normal n = (0, 1) pointing from medium 1 into medium 2
 *   incident direction  d = (sin θ1, cos θ1)
 *   η = n1 / n2
 *   refracted direction t = η d∥ + cos θ2 · n,   cos θ2 = √(1 − η² sin² θ1)
 *   total internal reflection when η sin θ1 > 1, then r = d − 2 (d·n) n
 *
 * The page also compares these vectors with the directions the backend returns.
 */

export type Vec = [number, number];

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const clamp1 = (x: number) => Math.max(-1, Math.min(1, x));
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1];

export type RefractionVectors = {
  theta1Deg: number;
  n1: number;
  n2: number;
  /** η = n1 / n2 */
  eta: number;
  d: Vec;
  n: Vec;
  /** cos θ1 = d · n */
  cos1: number;
  /** component of d along the normal */
  dPerp: Vec;
  /** component of d along the interface */
  dPar: Vec;
  /** sin θ2 = η sin θ1 (can exceed 1 when total internal reflection occurs) */
  sin2: number;
  tir: boolean;
  /** critical angle in degrees, or null when n1 <= n2 */
  criticalDeg: number | null;
  /** cos θ2, null for total internal reflection */
  cos2: number | null;
  /** unit refracted direction, null for total internal reflection */
  t: Vec | null;
  /** unit reflected direction, only for total internal reflection */
  r: Vec | null;
  /** refraction angle with the same sign as θ1, null for total internal reflection */
  theta2Deg: number | null;
  /** |θ1 − θ2|, null for total internal reflection */
  deviationDeg: number | null;
  bending: "towards normal" | "away from normal" | "none";
};

export function computeRefractionVectors(
  theta1Deg: number,
  n1: number,
  n2: number,
): RefractionVectors {
  const a = theta1Deg * RAD;
  const d: Vec = [Math.sin(a), Math.cos(a)];
  const n: Vec = [0, 1];

  const cos1 = dot(d, n);
  const dPerp: Vec = [n[0] * cos1, n[1] * cos1];
  const dPar: Vec = [d[0] - dPerp[0], d[1] - dPerp[1]];

  const eta = n1 / n2;
  const sin1Sq = 1 - cos1 * cos1;
  const sin2Sq = eta * eta * sin1Sq;
  const sin2 = eta * Math.sin(a);
  const tir = sin2Sq > 1 + 1e-12;
  const criticalDeg = n1 > n2 ? Math.asin(n2 / n1) * DEG : null;

  let cos2: number | null = null;
  let t: Vec | null = null;
  let r: Vec | null = null;
  let theta2Deg: number | null = null;
  let deviationDeg: number | null = null;

  if (!tir) {
    cos2 = Math.sqrt(Math.max(0, 1 - sin2Sq));
    const raw: Vec = [eta * dPar[0] + cos2 * n[0], eta * dPar[1] + cos2 * n[1]];
    const len = Math.hypot(raw[0], raw[1]) || 1;
    t = [raw[0] / len, raw[1] / len];
    const magnitude = Math.acos(clamp1(dot(t, n))) * DEG;
    theta2Deg = theta1Deg < 0 ? -magnitude : magnitude;
    deviationDeg = Math.abs(theta1Deg - theta2Deg);
  } else {
    r = [d[0] - 2 * cos1 * n[0], d[1] - 2 * cos1 * n[1]];
  }

  const bending =
    Math.abs(n1 - n2) < 1e-9
      ? "none"
      : n2 > n1
        ? "towards normal"
        : "away from normal";

  return {
    theta1Deg,
    n1,
    n2,
    eta,
    d,
    n,
    cos1,
    dPerp,
    dPar,
    sin2,
    tir,
    criticalDeg,
    cos2,
    t,
    r,
    theta2Deg,
    deviationDeg,
    bending,
  };
}

/** Unit direction of a ray segment returned by the backend. */
export function directionOf(ray?: { start: [number, number]; end: [number, number] }): Vec | undefined {
  if (!ray) return undefined;
  const dx = ray.end[0] - ray.start[0];
  const dy = ray.end[1] - ray.start[1];
  const len = Math.hypot(dx, dy);
  return len === 0 ? undefined : [dx / len, dy / len];
}

export function maxAbsDiff(a: Vec, b: Vec): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
}

/** Fixed decimals without a negative zero. */
export function fmt(x: number, digits = 3): string {
  const s = x.toFixed(digits);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
}

export function fmtVec(v: Vec, digits = 3): string {
  return `(${fmt(v[0], digits)}, ${fmt(v[1], digits)})`;
}
