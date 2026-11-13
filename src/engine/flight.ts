import * as THREE from "three";
import { type PlanetRecord } from "../core/protocol";
import { distance, speedAtAltitude, type Vec3 } from "../core/travel";

export class Flight {
  readonly position = new THREE.Vector3();
  readonly forward = new THREE.Vector3(0, 0, -1);
  readonly keys = new Set<string>();
  speed = 0;
  enabled = false;
  private yaw = 0;
  private pitch = 0;
  private readonly removers: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement) {
    const keydown = (event: KeyboardEvent) => {
      if (
        ["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ControlLeft", "ShiftLeft"].includes(event.code)
      ) {
        if (this.enabled && !(event.target instanceof HTMLButtonElement)) event.preventDefault();
        this.keys.add(event.code);
      }
    };
    const keyup = (event: KeyboardEvent) => this.keys.delete(event.code);
    const blur = () => this.keys.clear();
    const mousemove = (event: MouseEvent) => {
      if (!this.enabled || document.pointerLockElement !== canvas) return;
      this.yaw += event.movementX * 0.002;
      this.pitch = THREE.MathUtils.clamp(this.pitch - event.movementY * 0.002, -1.54, 1.54);
      this.updateDirection();
    };
    const pointerdown = () => {
      if (!this.enabled) return;
      const result = canvas.requestPointerLock();
      result?.catch(() => undefined);
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", blur);
    window.addEventListener("mousemove", mousemove);
    canvas.addEventListener("pointerdown", pointerdown);
    this.removers.push(
      () => window.removeEventListener("keydown", keydown),
      () => window.removeEventListener("keyup", keyup),
      () => window.removeEventListener("blur", blur),
      () => window.removeEventListener("mousemove", mousemove),
      () => canvas.removeEventListener("pointerdown", pointerdown),
    );
  }

  face(point: THREE.Vector3): void {
    this.forward.copy(point).sub(this.position).normalize();
    this.pitch = Math.asin(this.forward.y);
    this.yaw = Math.atan2(this.forward.x, -this.forward.z);
  }

  private updateDirection(): void {
    this.forward.set(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    );
  }

  update(
    dt: number,
    planets: PlanetRecord[],
    getRadius: (planet: PlanetRecord, direction: THREE.Vector3) => number,
  ): void {
    this.speed = 0;
    if (!this.enabled) return;
    const p = this.position.toArray() as Vec3;
    const nearest = planets.reduce((a, b) =>
      distance(p, a.position) - a.radius < distance(p, b.position) - b.radius ? a : b,
    );
    const altitude = distance(p, nearest.position) - nearest.radius;
    const maximum = speedAtAltitude(
      altitude,
      nearest.radius,
      this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"),
    );
    const input = new THREE.Vector3();
    if (this.keys.has("KeyW")) input.add(this.forward);
    if (this.keys.has("KeyS")) input.sub(this.forward);
    const right = new THREE.Vector3()
      .crossVectors(this.forward, new THREE.Vector3(0, 1, 0))
      .normalize();
    if (this.keys.has("KeyD")) input.add(right);
    if (this.keys.has("KeyA")) input.sub(right);
    if (this.keys.has("Space")) input.y += 1;
    if (this.keys.has("ControlLeft")) input.y -= 1;
    if (input.lengthSq() > 0) {
      input.normalize().multiplyScalar(maximum * dt);
      this.position.add(input);
      this.speed = maximum;
    }
    for (const planet of planets) {
      const center = new THREE.Vector3(...planet.position);
      const radial = this.position.clone().sub(center);
      const d = radial.length();
      if (d > planet.radius * 1.5) continue;
      if (d < 0.001) radial.set(0, 0, 1);
      else radial.divideScalar(d);
      const floor = getRadius(planet, radial) + 8;
      if (d < floor) this.position.copy(center).addScaledVector(radial, floor);
    }
  }

  dispose(): void {
    this.removers.forEach((remove) => remove());
  }
}
