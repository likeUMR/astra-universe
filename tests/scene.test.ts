import * as THREE from "three";
import { describe, it, expect } from "vitest";
import { validateSnapshot, type SceneSnapshot } from "../src/generator/validation";

function sample() {
  const geometry = new THREE.BufferGeometry().copy(new THREE.SphereGeometry(1, 16, 8));
  geometry.attributes.position!.setY(0, 1.4);
  const texture = new THREE.DataTexture(new Uint8Array(4 * 4 * 4).fill(128), 4, 4);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture }));
  mesh.userData.astraSurface = true;
  const root = new THREE.Group();
  root.add(mesh);
  return root;
}

describe("generated scene boundary", () => {
  it("preserves modified vertices and generated pixels through a worker-style roundtrip", () => {
    const snapshot = validateSnapshot(structuredClone(sample().toJSON()));
    const restored = new THREE.ObjectLoader().parse(snapshot);
    const mesh = restored.children[0] as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshStandardMaterial
    >;
    expect(mesh.geometry.attributes.position!.getY(0)).toBeCloseTo(1.4);
    expect(mesh.material.map).toBeInstanceOf(THREE.DataTexture);
    expect(mesh.userData.astraSurface).toBe(true);
  });
  it("rejects remote texture URLs before ObjectLoader can perform network requests", () => {
    const value = structuredClone(sample().toJSON()) as unknown as SceneSnapshot;
    value.images![0]!.url = "https://example.org/track.png";
    expect(() => validateSnapshot(value)).toThrow("URL");
  });
  it("rejects cameras and oversized GPU workloads", () => {
    const camera = new THREE.PerspectiveCamera();
    expect(() => validateSnapshot(camera.toJSON())).toThrow();
    const root = new THREE.Group();
    root.add(
      new THREE.InstancedMesh(
        new THREE.BufferGeometry().copy(new THREE.SphereGeometry(1, 32, 16)),
        new THREE.MeshBasicMaterial(),
        1000,
      ),
    );
    expect(() => validateSnapshot(root.toJSON())).toThrow("三角形");
  });
  it("rejects invalid vertex indices", () => {
    const root = sample();
    (root.children[0] as THREE.Mesh).geometry.setIndex([0, 1, 999999]);
    expect(() => validateSnapshot(root.toJSON())).toThrow("索引");
  });
});
