import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { validateTerritory } from "../src/generator/territory";

function planet() {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1000, 16, 8),
    new THREE.MeshStandardMaterial(),
  );
  mesh.userData.astraSurface = true;
  root.add(mesh);
  return root;
}

describe("planet territory", () => {
  it("allows a surface and a local atmospheric shell inside 2R", () => {
    const root = planet();
    root.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(1800, 16, 8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.1, depthWrite: false }),
      ),
    );
    expect(() => validateTerritory(root, 1000)).not.toThrow();
  });

  it("checks transformed child vertices, not just untransformed geometry bounds", () => {
    const root = planet();
    const group = new THREE.Group();
    group.position.x = 1900;
    group.add(new THREE.Mesh(new THREE.BoxGeometry(400, 20, 20), new THREE.MeshBasicMaterial()));
    root.add(group);
    expect(() => validateTerritory(root, 1000)).toThrow("领地");
  });

  it("checks each instance rather than just the instanced mesh origin", () => {
    const root = planet();
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(100, 100, 100),
      new THREE.MeshBasicMaterial(),
      2,
    );
    mesh.setMatrixAt(0, new THREE.Matrix4());
    mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(2100, 0, 0));
    root.add(mesh);
    expect(() => validateTerritory(root, 1000)).toThrow("领地");
  });

  it("requires the root group to retain the host's planet origin", () => {
    const root = planet();
    root.position.x = 10;
    expect(() => validateTerritory(root, 1000)).toThrow("原点");
  });

  it("checks marked surfaces against 0.5R to 1.5R", () => {
    const root = planet();
    root.children[0]!.scale.setScalar(0.4);
    expect(() => validateTerritory(root, 1000)).toThrow("地表");
    root.children[0]!.scale.setScalar(1.6);
    expect(() => validateTerritory(root, 1000)).toThrow("地表");
  });

  it("requires at least one actual mesh as a collision surface", () => {
    const root = planet();
    root.children[0]!.userData.astraSurface = false;
    root.userData.astraSurface = true;
    expect(() => validateTerritory(root, 1000)).toThrow("地表");
  });

  it("rejects morph targets that bypass the static vertex bounds", () => {
    const root = planet();
    const mesh = root.children[0] as THREE.Mesh;
    mesh.geometry.morphAttributes.position = [mesh.geometry.attributes.position!.clone()];
    expect(() => validateTerritory(root, 1000)).toThrow("morph");
  });

  it("allows local points but rejects oversized or constant-screen-size particles", () => {
    const root = planet();
    const material = new THREE.PointsMaterial({ size: 16, sizeAttenuation: true });
    root.add(
      new THREE.Points(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1200, 0)]),
        material,
      ),
    );
    expect(() => validateTerritory(root, 1000)).not.toThrow();
    material.size = 33;
    expect(() => validateTerritory(root, 1000)).toThrow("粒子");
    material.size = 16;
    material.sizeAttenuation = false;
    expect(() => validateTerritory(root, 1000)).toThrow("粒子");
  });

  it("bounds CPU checking work even when geometry is instanced", () => {
    const root = planet();
    root.add(
      new THREE.InstancedMesh(
        new THREE.SphereGeometry(1, 8, 4),
        new THREE.MeshBasicMaterial(),
        10_000,
      ),
    );
    expect(() => validateTerritory(root, 1000)).toThrow("顶点预算");
  });
});
