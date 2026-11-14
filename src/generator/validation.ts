import { assert, isRecord, MAX_GENERATED_BYTES, MAX_TRIANGLES } from "../core/protocol";
import { AdditiveBlending, LessDepth, LessEqualDepth, NoBlending, NormalBlending } from "three";

const objectTypes = new Set([
  "Group",
  "Object3D",
  "Mesh",
  "InstancedMesh",
  "Points",
  "Line",
  "LineSegments",
]);
const materialTypes = new Set([
  "MeshStandardMaterial",
  "MeshPhysicalMaterial",
  "MeshBasicMaterial",
  "ShaderMaterial",
  "PointsMaterial",
  "LineBasicMaterial",
]);

export interface SceneSnapshot {
  metadata: Record<string, unknown>;
  object: Record<string, unknown>;
  geometries?: Record<string, unknown>[];
  materials?: Record<string, unknown>[];
  textures?: Record<string, unknown>[];
  images?: Record<string, unknown>[];
}

export function validateSnapshot(value: unknown): SceneSnapshot {
  assert(isRecord(value) && isRecord(value.object) && isRecord(value.metadata), "生成结果不是场景");
  const encoded = JSON.stringify(value);
  assert(new TextEncoder().encode(encoded).length <= MAX_GENERATED_BYTES, "生成场景超过 32 MiB");
  let nodes = 0;
  let triangles = 0;
  const geometryTriangles = new Map<string, number>();
  const geometries = value.geometries ?? [];
  assert(Array.isArray(geometries) && geometries.length <= 256, "几何数量超限");
  for (const geometry of geometries) {
    assert(
      isRecord(geometry) && geometry.type === "BufferGeometry" && typeof geometry.uuid === "string",
      "只接受普通 BufferGeometry",
    );
    assert(isRecord(geometry.data) && isRecord(geometry.data.attributes), "缺少顶点");
    const position = geometry.data.attributes.position;
    assert(
      isRecord(position) && Array.isArray(position.array) && position.itemSize === 3,
      "顶点格式无效",
    );
    const vertices = position.array;
    assert(
      vertices.length <= 900_000 &&
        vertices.every(
          (n: unknown) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1e7,
        ),
      "顶点超限或非法",
    );
    const index = geometry.data.index;
    let count = position.array.length / 9;
    if (index !== undefined) {
      assert(isRecord(index) && Array.isArray(index.array), "索引无效");
      assert(
        index.array.every(
          (n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) < vertices.length / 3,
        ),
        "索引越界",
      );
      count = index.array.length / 3;
    }
    geometryTriangles.set(geometry.uuid, count);
  }
  const walk = (node: unknown, depth: number) => {
    assert(
      isRecord(node) && typeof node.type === "string" && objectTypes.has(node.type),
      "场景含禁止的对象",
    );
    assert(depth < 32 && ++nodes <= 512, "场景层级或节点数量超限");
    assert(node.renderOrder === undefined || node.renderOrder === 0, "禁止修改全局渲染顺序");
    if (typeof node.geometry === "string") {
      assert(geometryTriangles.has(node.geometry), "几何引用无效");
      const instances = node.type === "InstancedMesh" ? Number(node.count) : 1;
      assert(
        Number.isSafeInteger(instances) && instances > 0 && instances <= 10_000,
        "实例数量无效",
      );
      triangles += geometryTriangles.get(node.geometry)! * instances;
    }
    if (node.children !== undefined) {
      assert(Array.isArray(node.children), "子节点无效");
      node.children.forEach((child: unknown) => walk(child, depth + 1));
    }
  };
  walk(value.object, 0);
  assert(triangles <= MAX_TRIANGLES, "生成三角形超过 100,000");
  assert(
    Array.isArray(value.materials ?? []) &&
      (value.materials as unknown[] | undefined)?.length !== 0,
    "缺少材质",
  );
  for (const material of (value.materials ?? []) as unknown[]) {
    assert(
      isRecord(material) && typeof material.type === "string" && materialTypes.has(material.type),
      "材质不受支持",
    );
    assert(
      (material.depthTest === undefined || material.depthTest === true) &&
        (material.depthFunc === undefined ||
          material.depthFunc === LessDepth ||
          material.depthFunc === LessEqualDepth) &&
        (material.stencilWrite === undefined || material.stencilWrite === false) &&
        (material.colorWrite === undefined || material.colorWrite === true) &&
        (material.polygonOffset === undefined || material.polygonOffset === false) &&
        (material.blending === undefined ||
          material.blending === NoBlending ||
          material.blending === NormalBlending ||
          material.blending === AdditiveBlending),
      "材质违反渲染边界：保留深度检测，禁止模板写入、深度偏移、隐藏遮挡和自定义混合",
    );
    assert(material.displacementMap === undefined, "首版禁止 GPU 位移贴图，请在 CPU 生成地形");
  }
  assert(Array.isArray(value.images ?? []), "图片数据无效");
  for (const image of (value.images ?? []) as unknown[]) {
    assert(isRecord(image) && isRecord(image.url), "禁止在生成结果中使用图片 URL");
    const data = image.url;
    assert(
      Number.isInteger(data.width) &&
        Number.isInteger(data.height) &&
        Number(data.width) > 0 &&
        Number(data.width) <= 512 &&
        Number(data.height) > 0 &&
        Number(data.height) <= 512,
      "生成纹理最大为 512 × 512",
    );
    assert(
      data.type === "Uint8Array" &&
        Array.isArray(data.data) &&
        data.data.length <= Number(data.width) * Number(data.height) * 4,
      "只接受内存像素纹理",
    );
    assert(
      data.data.every((n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 255),
      "纹理像素无效",
    );
  }
  return value as unknown as SceneSnapshot;
}
