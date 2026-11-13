import type { PlanetRecord } from "./protocol";

export type Vec3 = [number, number, number];

export function distance(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
}

export function surfaceDistance(position: Vec3, planet: PlanetRecord): number {
  return distance(position, planet.position) - planet.radius;
}

export function arrivalPosition(from: Vec3, planet: PlanetRecord): Vec3 {
  const delta = from.map((v, axis) => v - planet.position[axis]!) as Vec3;
  const length = Math.hypot(...delta);
  if (length < 1) delta.splice(0, 3, 0, 0, 1);
  const scale = (planet.radius * 1.12) / (length < 1 ? 1 : length);
  return delta.map((v, axis) => planet.position[axis]! + v * scale) as Vec3;
}

export function speedAtAltitude(altitude: number, radius: number, boost: boolean): number {
  const t = Math.min(1, Math.max(0, altitude / (radius * 2)));
  const smooth = t * t * (3 - 2 * t);
  return (25 + smooth * 575) * (boost ? 2 : 1);
}

export function preloadPriority(
  position: Vec3,
  forward: Vec3,
  planet: PlanetRecord,
  selected: string | null,
): number {
  if (planet.id === selected) return -1e12;
  const d = distance(position, planet.position);
  const heading =
    planet.position.reduce(
      (sum, value, axis) => sum + (value - position[axis]!) * forward[axis]!,
      0,
    ) / Math.max(d, 1);
  return Math.max(0, d - planet.radius * 3) * (heading > 0.7 ? 0.4 : 1);
}
