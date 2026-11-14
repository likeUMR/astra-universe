import * as THREE from "three";
import { assert, MAX_TRANSFORMED_VERTICES, PLANET_TERRITORY_SCALE } from "../core/protocol";

function assertAffine(matrix: THREE.Matrix4): void {
  const m = matrix.elements;
  assert(
    m.every(Number.isFinite) &&
      Math.abs(m[3]!) < 1e-8 &&
      Math.abs(m[7]!) < 1e-8 &&
      Math.abs(m[11]!) < 1e-8 &&
      Math.abs(m[15]! - 1) < 1e-8,
    "领地只接受有限的仿射变换",
  );
}

// These checks constrain CPU geometry and normal render state. Custom GLSL is
// still reviewed: a vertex shader can replace gl_Position after these checks.
export function validateTerritory(root: THREE.Object3D, radius: number): void {
  assert(root instanceof THREE.Group && root.parent === null, "星球必须返回独立的 THREE.Group");
  assert(Number.isFinite(radius) && radius > 0, "领地半径无效");
  root.updateMatrixWorld(true);
  const identity = new THREE.Matrix4().elements;
  assert(
    root.matrix.elements.every((n, i) => Math.abs(n - identity[i]!) < 1e-8),
    "根 Group 必须保留星球原点、默认旋转和单位缩放",
  );
  const epsilon = radius * 1e-5;
  const outer = radius * PLANET_TERRITORY_SCALE + epsilon;
  const surfaceMin = radius * 0.5 - epsilon;
  const surfaceMax = radius * 1.5 + epsilon;
  const point = new THREE.Vector3();
  const instance = new THREE.Matrix4();
  const transform = new THREE.Matrix4();
  let vertices = 0;
  let surfaces = 0;

  root.traverse((object) => {
    assertAffine(object.matrixWorld);
    const mesh = object as THREE.Mesh;
    const surface = object.userData.astraSurface === true;
    if (surface) {
      assert(mesh.isMesh, "地表标记只能放在 Mesh 上");
      surfaces++;
    }
    const geometry = mesh.geometry;
    if (!geometry) return;
    assert(
      Object.values(geometry.morphAttributes).every((attributes) => attributes?.length === 0),
      "首版不支持 morph 顶点变形",
    );
    const positions = geometry.getAttribute("position");
    assert(positions !== undefined && positions.count > 0, "领地缺少有效顶点");
    const instanced = mesh instanceof THREE.InstancedMesh ? mesh : undefined;
    const count = instanced?.count ?? 1;
    assert(Number.isSafeInteger(count) && count > 0 && count <= 10_000, "领地实例数量无效");
    vertices += positions.count * count;
    assert(vertices <= MAX_TRANSFORMED_VERTICES, "变换后顶点预算超过 300,000");
    for (let i = 0; i < count; i++) {
      if (instanced) {
        instanced.getMatrixAt(i, instance);
        assertAffine(instance);
        transform.multiplyMatrices(object.matrixWorld, instance);
      } else {
        transform.copy(object.matrixWorld);
      }
      for (let vertex = 0; vertex < positions.count; vertex++) {
        point.fromBufferAttribute(positions, vertex).applyMatrix4(transform);
        const length = point.length();
        assert(Number.isFinite(length) && length <= outer, "生成物越过 2R 星球领地");
        if (surface) {
          assert(length >= surfaceMin && length <= surfaceMax, "标记地表必须位于 0.5R–1.5R 内");
        }
      }
    }
    if (object instanceof THREE.Points) {
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (material instanceof THREE.PointsMaterial) {
          assert(
            material.sizeAttenuation === true &&
              Number.isFinite(material.size) &&
              material.size > 0 &&
              material.size <= 32,
            "领地粒子必须随距离衰减，尺寸不超过 32 世界单位",
          );
        }
      }
    }
  });
  assert(surfaces > 0, "星球必须提供 Mesh 地表碰撞标记");
}
