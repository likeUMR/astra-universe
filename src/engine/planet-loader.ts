import * as THREE from "three";
import { MAX_PACKAGE_BYTES, sha256, type PlanetRecord } from "../core/protocol";
import { generate } from "../generator/sandbox";
import { validateTerritory } from "../generator/territory";
import { disposeObject } from "./resources";

export type LoadStage = "idle" | "downloading" | "generating" | "preparing" | "ready" | "error";
export interface PlanetAsset {
  planet: PlanetRecord;
  stage: LoadStage;
  far?: THREE.Object3D;
  near?: THREE.Object3D;
  surfaces: THREE.Object3D[];
  error?: string;
  generationMs?: number;
  preparationMs?: number;
  promise?: Promise<PlanetAsset>;
}

export class PlanetLoader {
  readonly assets = new Map<string, PlanetAsset>();
  readonly timings: Record<string, { generationMs: number; preparationMs: number }> = {};
  private readonly code = new Map<string, string>();
  private tail: Promise<unknown> = Promise.resolve();
  private active?: AbortController;
  private disposed = false;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly onChange: () => void,
  ) {}

  state(planet: PlanetRecord): PlanetAsset {
    let asset = this.assets.get(planet.id);
    if (!asset) {
      asset = { planet, stage: "idle", surfaces: [] };
      this.assets.set(planet.id, asset);
    }
    return asset;
  }

  ensure(planet: PlanetRecord): Promise<PlanetAsset> {
    const asset = this.state(planet);
    if (asset.stage === "ready") return Promise.resolve(asset);
    if (asset.promise) return asset.promise;
    asset.promise = this.tail.catch(() => undefined).then(() => this.load(asset));
    this.tail = asset.promise;
    void asset.promise.catch(() => undefined);
    return asset.promise;
  }

  private setStage(asset: PlanetAsset, stage: LoadStage): void {
    asset.stage = stage;
    this.onChange();
  }

  private async source(planet: PlanetRecord, signal: AbortSignal): Promise<string> {
    const memory = this.code.get(planet.package.sha256);
    if (memory) return memory;
    const url = new URL(`${import.meta.env.BASE_URL}${planet.package.url}`, location.href);
    const cache = await caches.open("astra-code-v1").catch(() => undefined);
    let response = await cache?.match(url);
    if (!response) response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`下载失败：${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("无法读取代码");
    const parts: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > planet.package.bytes || size > MAX_PACKAGE_BYTES) {
        await reader.cancel();
        throw new Error("下载内容超过声明大小");
      }
      parts.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.length;
    }
    if (size !== planet.package.bytes || (await sha256(bytes)) !== planet.package.sha256) {
      await cache?.delete(url);
      throw new Error("星球代码校验失败");
    }
    await cache
      ?.put(url, new Response(bytes, { headers: { "Content-Type": "text/javascript" } }))
      .catch(() => undefined);
    const source = new TextDecoder().decode(bytes);
    this.code.set(planet.package.sha256, source);
    return source;
  }

  private async load(asset: PlanetAsset): Promise<PlanetAsset> {
    if (this.disposed) throw new Error("加载器已经关闭");
    const controller = new AbortController();
    this.active = controller;
    const timeout = setTimeout(() => controller.abort(new Error("星球加载超时")), 45_000);
    try {
      asset.error = undefined;
      this.setStage(asset, "downloading");
      const source = await this.source(asset.planet, controller.signal);
      for (const detail of ["far", "near"] as const) {
        this.setStage(asset, "generating");
        const started = performance.now();
        const snapshot = await generate(
          source,
          {
            radius: asset.planet.radius,
            seed: asset.planet.seed,
            detail,
          },
          controller.signal,
        );
        asset.generationMs = (asset.generationMs ?? 0) + performance.now() - started;
        this.setStage(asset, "preparing");
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const preparation = performance.now();
        const object = new THREE.ObjectLoader().parse(snapshot);
        try {
          validateTerritory(object, asset.planet.radius);
          await this.warm(object, controller.signal);
        } catch (error) {
          disposeObject(object);
          throw error;
        }
        asset[detail] = object;
        asset.preparationMs = (asset.preparationMs ?? 0) + performance.now() - preparation;
        if (detail === "near") {
          object.traverse((child) => {
            if (child.userData.astraSurface === true) asset.surfaces.push(child);
          });
          if (asset.surfaces.length === 0) throw new Error("地表碰撞数据缺失");
        }
        this.onChange();
      }
      this.timings[asset.planet.id] = {
        generationMs: asset.generationMs ?? 0,
        preparationMs: asset.preparationMs ?? 0,
      };
      this.setStage(asset, "ready");
      return asset;
    } catch (error) {
      if (asset.far) disposeObject(asset.far);
      if (asset.near) disposeObject(asset.near);
      asset.far = undefined;
      asset.near = undefined;
      asset.surfaces = [];
      asset.error = error instanceof Error ? error.message : "加载失败";
      this.setStage(asset, "error");
      throw error;
    } finally {
      clearTimeout(timeout);
      asset.promise = undefined;
      if (this.active === controller) this.active = undefined;
    }
  }

  private async warm(object: THREE.Object3D, signal: AbortSignal): Promise<void> {
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xc9dfff, 1.6));
    const sun = new THREE.DirectionalLight(0xffead2, 3);
    sun.position.set(3, 4, 5);
    scene.add(sun, object);
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 50_000);
    const bounds = new THREE.Box3().setFromObject(object);
    const center = bounds.getCenter(new THREE.Vector3());
    const span = Math.max(bounds.getSize(new THREE.Vector3()).length(), 1);
    camera.position.copy(center).add(new THREE.Vector3(0, 0, span));
    camera.lookAt(center);
    object.traverse((child) => {
      const material = (child as THREE.Mesh).material;
      if (!material) return;
      for (const item of Array.isArray(material) ? material : [material]) {
        for (const value of Object.values(item)) {
          if (value instanceof THREE.Texture) this.renderer.initTexture(value);
        }
      }
    });
    await this.renderer.compileAsync(scene, camera);
    signal.throwIfAborted();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const target = new THREE.WebGLRenderTarget(32, 32);
    const old = this.renderer.getRenderTarget();
    try {
      this.renderer.setRenderTarget(target);
      this.renderer.render(scene, camera);
    } finally {
      this.renderer.setRenderTarget(old);
      target.dispose();
      object.removeFromParent();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.active?.abort();
    for (const asset of this.assets.values()) {
      if (asset.far) disposeObject(asset.far);
      if (asset.near) disposeObject(asset.near);
    }
    this.assets.clear();
  }
}
