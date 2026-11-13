import * as THREE from "three";
import type { PlanetRecord } from "../core/protocol";
import type { PlanetLoader } from "./planet-loader";
import { disposeObject } from "./resources";

interface PlanetVisual {
  anchor: THREE.Group;
  proxy: THREE.Mesh;
  marker: THREE.Points;
}

export class World {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(58, 1, 0.2, 300_000);
  readonly renderer: THREE.WebGLRenderer;
  private readonly visuals = new Map<string, PlanetVisual>();
  private readonly stars: THREE.Points;
  private readonly ray = new THREE.Raycaster();
  private readonly point: THREE.Sprite;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly planets: PlanetRecord[],
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene.background = new THREE.Color(0x030711);
    this.scene.add(new THREE.AmbientLight(0xc9dfff, 1.6));
    const sunlight = new THREE.DirectionalLight(0xffead2, 3);
    sunlight.position.set(3, 4, 5);
    this.scene.add(sunlight);
    let seed = 713;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const positions: number[] = [];
    const colors: number[] = [];
    for (let i = 0; i < 2_200; i++) {
      const direction = new THREE.Vector3(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1)
        .normalize()
        .multiplyScalar(150_000);
      positions.push(...direction.toArray());
      const shade = new THREE.Color().setHSL(0.55 + random() * 0.12, 0.15, 0.45 + random() * 0.4);
      colors.push(...shade.toArray());
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    this.stars = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 1.4,
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      }),
    );
    this.scene.add(this.stars);
    for (const planet of planets) {
      const anchor = new THREE.Group();
      const proxy = new THREE.Mesh(
        new THREE.SphereGeometry(planet.radius, 24, 12),
        new THREE.MeshStandardMaterial({ color: planet.previewColor, roughness: 0.8 }),
      );
      anchor.add(proxy);
      const markerGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3()]);
      const marker = new THREE.Points(
        markerGeometry,
        new THREE.PointsMaterial({
          color: planet.previewColor,
          size: 5,
          sizeAttenuation: false,
          depthTest: false,
        }),
      );
      anchor.add(marker);
      this.scene.add(anchor);
      this.visuals.set(planet.id, { anchor, proxy, marker });
    }
    // A procedural dot: no sprite image is downloaded.
    const pixels = new Uint8Array(32 * 32 * 4);
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const r = Math.hypot((x - 15.5) / 15.5, (y - 15.5) / 15.5);
        const alpha = Math.max(0, Math.exp(-r * r * 6) - 0.003);
        pixels.set([255, 246, 213, Math.round(alpha * 255)], (y * 32 + x) * 4);
      }
    }
    const dot = new THREE.DataTexture(pixels, 32, 32);
    dot.needsUpdate = true;
    dot.magFilter = THREE.LinearFilter;
    this.point = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: dot,
        depthTest: false,
        transparent: true,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.point.scale.setScalar(0.35);
    this.scene.add(this.point);
    this.resize();
  }

  place(position: THREE.Vector3, forward: THREE.Vector3, loader: PlanetLoader, time: number): void {
    for (const planet of this.planets) {
      const visual = this.visuals.get(planet.id)!;
      visual.anchor.position.set(...planet.position).sub(position);
      const d = visual.anchor.position.length();
      const asset = loader.state(planet);
      const desired = d < planet.radius * 3 ? (asset.near ?? asset.far) : asset.far;
      for (const object of [asset.far, asset.near]) {
        if (object) {
          if (object.parent !== visual.anchor) visual.anchor.add(object);
          object.visible = object === desired && d < planet.radius * 14;
          object.traverse((child) => {
            const material = (child as THREE.Mesh).material;
            for (const item of Array.isArray(material) ? material : material ? [material] : []) {
              if (item instanceof THREE.ShaderMaterial && item.uniforms.uTime)
                item.uniforms.uTime.value = time;
            }
          });
        }
      }
      visual.proxy.visible = !desired && d < planet.radius * 14;
      visual.marker.visible = d >= planet.radius * 10;
    }
    this.point.position.set(0, 0, 0);
    this.camera.position
      .copy(forward)
      .multiplyScalar(-16)
      .add(new THREE.Vector3(0, 6, 0));
    this.camera.lookAt(forward.clone().multiplyScalar(150));
    this.stars.position.copy(this.camera.position);
    this.scene.updateMatrixWorld(true);
  }

  surfaceRadius(planet: PlanetRecord, direction: THREE.Vector3, loader: PlanetLoader): number {
    const asset = loader.state(planet);
    if (asset.surfaces.length === 0) return planet.radius;
    const center = asset.near!.getWorldPosition(new THREE.Vector3());
    this.ray.set(center.addScaledVector(direction, planet.radius * 2), direction.clone().negate());
    const hits = this.ray.intersectObjects(asset.surfaces, false);
    const hit = hits[0];
    if (!hit) return planet.radius;
    return THREE.MathUtils.clamp(
      planet.radius * 2 - hit.distance,
      planet.radius * 0.5,
      planet.radius * 1.5,
    );
  }

  project(planet: PlanetRecord): { x: number; y: number; visible: boolean } {
    const position = this.visuals.get(planet.id)!.anchor.position.clone().project(this.camera);
    return {
      x: (position.x * 0.5 + 0.5) * innerWidth,
      y: (-position.y * 0.5 + 0.5) * innerHeight,
      visible:
        position.z > -1 &&
        position.z < 1 &&
        Math.abs(position.x) < 0.92 &&
        Math.abs(position.y) < 0.85,
    };
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  dispose(): void {
    disposeObject(this.scene);
    this.point.material.map?.dispose();
    this.point.material.dispose();
    this.renderer.dispose();
  }
}
