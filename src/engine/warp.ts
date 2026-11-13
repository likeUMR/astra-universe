import { arrivalPosition, type Vec3 } from "../core/travel";
import { Vector3 } from "three";
import type { PlanetRecord } from "../core/protocol";
import type { PlanetLoader } from "./planet-loader";
import type { Flight } from "./flight";

export type WarpPhase = "idle" | "travel" | "exit";

export class Warp {
  phase: WarpPhase = "idle";
  target?: PlanetRecord;
  error?: string;
  private token = 0;
  private resumeFlight = false;

  constructor(
    private readonly loader: PlanetLoader,
    private readonly flight: Flight,
    private readonly onChange: () => void,
    private readonly surfaceRadius: (planet: PlanetRecord, direction: Vector3) => number,
  ) {}

  async start(target: PlanetRecord): Promise<void> {
    if (this.phase !== "idle") return;
    const token = ++this.token;
    const began = performance.now();
    this.target = target;
    this.error = undefined;
    this.phase = "travel";
    this.resumeFlight = this.flight.enabled;
    this.flight.enabled = false;
    this.flight.keys.clear();
    document.exitPointerLock();
    this.onChange();
    try {
      await this.loader.ensure(target);
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, 2_200 - (performance.now() - began))),
      );
      if (token !== this.token) return;
      const destination = arrivalPosition(this.flight.position.toArray() as Vec3, target);
      this.flight.position.set(...destination);
      const radial = this.flight.position
        .clone()
        .sub(new Vector3(...target.position))
        .normalize();
      const safeRadius = Math.max(
        target.radius * 1.12,
        this.surfaceRadius(target, radial) + target.radius * 0.12,
      );
      this.flight.position
        .copy(new Vector3(...target.position))
        .addScaledVector(radial, safeRadius);
      const tangent = new Vector3(0, 1, 0).cross(radial);
      if (tangent.lengthSq() < 0.01) tangent.set(1, 0, 0).cross(radial);
      tangent.normalize().addScaledVector(radial, -0.4).normalize();
      this.flight.face(this.flight.position.clone().add(tangent));
      this.phase = "exit";
      this.onChange();
      await new Promise((resolve) => setTimeout(resolve, 650));
      if (token !== this.token) return;
      this.phase = "idle";
      this.flight.enabled = this.resumeFlight;
      this.onChange();
    } catch (error) {
      if (token !== this.token) return;
      this.error = error instanceof Error ? error.message : "跃迁失败";
      this.phase = "idle";
      this.flight.enabled = this.resumeFlight;
      this.onChange();
    }
  }

  cancel(): void {
    if (this.phase === "idle") return;
    if (this.phase === "exit") return;
    this.token++;
    this.phase = "idle";
    this.flight.enabled = this.resumeFlight;
    this.onChange();
  }
}
