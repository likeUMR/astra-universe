export const PLANET_PROTOCOL = "astra-planet/0.1" as const;
export const UNIVERSE_PROTOCOL = "astra-universe/0.1" as const;
export const MAX_PACKAGE_BYTES = 5_000_000;
export const MAX_GENERATED_BYTES = 32 * 1024 * 1024;
export const MAX_TRIANGLES = 100_000;
export const PLANET_TERRITORY_SCALE = 2;
export const MAX_TRANSFORMED_VERTICES = 300_000;

export interface PlanetManifest {
  protocol: typeof PLANET_PROTOCOL;
  name: string;
  entry: "planet.js";
  seed: number;
  radius: number;
  previewColor: string;
}

export interface PlanetRecord extends PlanetManifest {
  id: string;
  position: [number, number, number];
  source: { repository: string; commit: string };
  package: { url: string; sha256: string; bytes: number; totalBytes: number };
}

export interface Universe {
  protocol: typeof UNIVERSE_PROTOCOL;
  planets: PlanetRecord[];
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseManifest(value: unknown): PlanetManifest {
  assert(isRecord(value), "星球描述必须是对象");
  assert(value.protocol === PLANET_PROTOCOL, "不支持的星球协议");
  assert(
    typeof value.name === "string" && value.name.length > 0 && value.name.length <= 80,
    "星球名称无效",
  );
  assert(value.entry === "planet.js", "首版只接受 planet.js");
  assert(Number.isSafeInteger(value.seed), "种子必须是安全整数");
  assert(
    typeof value.radius === "number" && value.radius >= 100 && value.radius <= 5_000,
    "半径必须为 100–5000",
  );
  assert(
    typeof value.previewColor === "string" && /^#[0-9a-f]{6}$/i.test(value.previewColor),
    "预览颜色无效",
  );
  return value as unknown as PlanetManifest;
}

export function parseUniverse(value: unknown): Universe {
  assert(isRecord(value) && value.protocol === UNIVERSE_PROTOCOL, "不支持的星图协议");
  assert(
    Array.isArray(value.planets) && value.planets.length > 0 && value.planets.length <= 1_000,
    "星图数量无效",
  );
  const ids = new Set<string>();
  const planets = value.planets.map((item: unknown) => {
    parseManifest(item);
    assert(isRecord(item), "星球记录无效");
    assert(
      typeof item.id === "string" && /^[a-z0-9-]{1,64}$/.test(item.id) && !ids.has(item.id),
      "星球 ID 重复或无效",
    );
    ids.add(item.id);
    assert(
      Array.isArray(item.position) &&
        item.position.length === 3 &&
        item.position.every(
          (n: unknown) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 1e12,
        ),
      "星球坐标无效",
    );
    assert(
      isRecord(item.source) &&
        typeof item.source.repository === "string" &&
        /^[\w.-]+\/[\w.-]+$/.test(item.source.repository) &&
        typeof item.source.commit === "string" &&
        /^[a-f0-9]{40}$/.test(item.source.commit),
      "源码必须锁定具体 Git 提交",
    );
    assert(isRecord(item.package), "缺少发布包");
    const pkg = item.package;
    assert(
      typeof pkg.url === "string" &&
        /^planets\/[a-z0-9-]+\/[a-f0-9]{64}\/planet\.js$/.test(pkg.url),
      "发布包路径无效",
    );
    assert(typeof pkg.sha256 === "string" && /^[a-f0-9]{64}$/.test(pkg.sha256), "内容哈希无效");
    assert(
      Number.isSafeInteger(pkg.bytes) &&
        Number(pkg.bytes) > 0 &&
        Number(pkg.bytes) <= MAX_PACKAGE_BYTES,
      "代码大小超限",
    );
    assert(
      Number.isSafeInteger(pkg.totalBytes) &&
        Number(pkg.totalBytes) >= Number(pkg.bytes) &&
        Number(pkg.totalBytes) <= MAX_PACKAGE_BYTES,
      "发布包超过 5 MB",
    );
    return item as unknown as PlanetRecord;
  });
  // Reserve the whole territory, including rings and local atmospheric effects.
  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      const a = planets[i]!;
      const b = planets[j]!;
      assert(
        Math.hypot(...a.position.map((v, axis) => v - b.position[axis]!)) >
          (a.radius + b.radius) * PLANET_TERRITORY_SCALE,
        "星球领地重叠",
      );
    }
  }
  return { protocol: UNIVERSE_PROTOCOL, planets };
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
