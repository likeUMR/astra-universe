import * as THREE from "three";
import { validateSnapshot } from "./validation";
import { validateTerritory } from "./territory";

interface BuildRequest {
  source: string;
  parameters: { radius: number; seed: number; detail: "far" | "near" };
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

self.onmessage = async (event: MessageEvent<BuildRequest>) => {
  try {
    const { source, parameters } = event.data;
    // Only the isolated worker allows evaluation. The publisher compiles the
    // author's ES module to this closed IIFE; the main window never runs it.
    const buildPlanet = new Function(`${source}\n;return AstraPlanet.buildPlanet;`)();
    if (typeof buildPlanet !== "function") throw new Error("缺少 buildPlanet 导出");
    const root: THREE.Object3D = await buildPlanet({
      THREE,
      ...parameters,
      random: seededRandom(parameters.seed),
    });
    if (!root?.isObject3D) throw new Error("buildPlanet 必须返回 THREE.Group");
    let hasSurface = false;
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) {
        const old = mesh.geometry;
        mesh.geometry = new THREE.BufferGeometry().copy(old);
      }
      if (mesh.isMesh && object.userData.astraSurface === true) hasSurface = true;
    });
    if (!hasSurface) throw new Error("需要标记 userData.astraSurface 的地表网格");
    const snapshot = validateSnapshot(root.toJSON());
    validateTerritory(root, parameters.radius);
    self.postMessage({ type: "result", snapshot });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "生成失败",
    });
  }
};
