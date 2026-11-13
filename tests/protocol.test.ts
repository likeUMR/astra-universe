import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parseManifest, parseUniverse, MAX_PACKAGE_BYTES } from "../src/core/protocol";
import { arrivalPosition, distance, speedAtAltitude, preloadPriority } from "../src/core/travel";

const index = JSON.parse(readFileSync(new URL("../public/universe.json", import.meta.url), "utf8"));

describe("published immutable protocol", () => {
  it("loads both independent repositories and verifies every distributed byte", () => {
    const universe = parseUniverse(index);
    expect(universe.planets).toHaveLength(2);
    expect(new Set(universe.planets.map((p) => p.source.repository)).size).toBe(2);
    for (const planet of universe.planets) {
      const code = readFileSync(new URL(`../public/${planet.package.url}`, import.meta.url));
      expect(code.byteLength).toBe(planet.package.bytes);
      expect(createHash("sha256").update(code).digest("hex")).toBe(planet.package.sha256);
      expect(planet.package.totalBytes).toBeLessThanOrEqual(MAX_PACKAGE_BYTES);
    }
  });

  it("rejects moving refs, external downloads, oversize and overlapping planets", () => {
    const changed = () => structuredClone(index);
    const ref = changed();
    ref.planets[0].source.commit = "main";
    expect(() => parseUniverse(ref)).toThrow();
    const external = changed();
    external.planets[0].package.url = "https://example.org/evil.js";
    expect(() => parseUniverse(external)).toThrow();
    const oversize = changed();
    oversize.planets[0].package.totalBytes = MAX_PACKAGE_BYTES + 1;
    expect(() => parseUniverse(oversize)).toThrow();
    const overlap = changed();
    overlap.planets[1].position = [1, 1, 1];
    expect(() => parseUniverse(overlap)).toThrow();
  });

  it("rejects invalid numbers and entry paths", () => {
    const planet = index.planets[0];
    expect(() => parseManifest({ ...planet, radius: NaN })).toThrow();
    expect(() => parseManifest({ ...planet, entry: "../remote.js" })).toThrow();
    expect(() => parseManifest({ ...planet, previewColor: '"><img src=x>' })).toThrow();
  });
});

describe("continuous world math", () => {
  const planet = parseUniverse(index).planets[1]!;
  it("calculates safe arrival on the departure-facing side without viewpoints", () => {
    const from: [number, number, number] = [0, 0, 0];
    const result = arrivalPosition(from, planet);
    expect(distance(result, planet.position)).toBeCloseTo(planet.radius * 1.12);
    expect(result[0]).toBeLessThan(planet.position[0]);
    expect(arrivalPosition(planet.position, planet).every(Number.isFinite)).toBe(true);
  });
  it("smoothly increases speed, with a bounded boost", () => {
    expect(speedAtAltitude(0, 1000, false)).toBe(25);
    expect(speedAtAltitude(2000, 1000, true)).toBe(1200);
    expect(speedAtAltitude(500, 1000, false)).toBeGreaterThan(25);
    expect(speedAtAltitude(501, 1000, false) - speedAtAltitude(500, 1000, false)).toBeLessThan(1);
  });
  it("prioritizes an explicitly selected destination", () => {
    expect(preloadPriority([0, 0, 0], [1, 0, 0], planet, planet.id)).toBeLessThan(0);
  });
});
