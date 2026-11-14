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
  it.each([
    ["depth test", { depthTest: false }],
    ["non-boolean depth test", { depthTest: 0 }],
    ["depth function", { depthFunc: THREE.AlwaysDepth }],
    ["stencil", { stencilWrite: true }],
    ["non-boolean stencil", { stencilWrite: 1 }],
    ["invisible occluder", { colorWrite: false }],
    ["non-boolean color mask", { colorWrite: 0 }],
    ["depth offset", { polygonOffset: true, polygonOffsetFactor: -1000000 }],
    ["custom blending", { blending: THREE.CustomBlending }],
  ])("rejects material control outside a planet: %s", (_name, properties) => {
    const root = sample();
    const mesh = root.children[0] as THREE.Mesh;
    Object.assign(mesh.material, properties);
    expect(() => validateSnapshot(root.toJSON())).toThrow("渲染边界");
  });
  it("rejects overriding the universe's render order", () => {
    const root = sample();
    root.children[0]!.renderOrder = 1000;
    expect(() => validateSnapshot(root.toJSON())).toThrow("渲染顺序");
  });
  it("allows local transparent effects with normal depth testing", () => {
    const root = sample();
    const mesh = root.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    mesh.material.transparent = true;
    mesh.material.depthWrite = false;
    mesh.material.blending = THREE.AdditiveBlending;
    expect(() => validateSnapshot(root.toJSON())).not.toThrow();
  });
  it("rejects GPU displacement maps that escape CPU territory and collision checks", () => {
    const root = sample();
    const mesh = root.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    mesh.material.displacementMap = mesh.material.map;
    expect(() => validateSnapshot(root.toJSON())).toThrow("位移");
  });
});
