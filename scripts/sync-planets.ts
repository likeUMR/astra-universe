import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { format } from "prettier";
import {
  assert,
  parseManifest,
  parseUniverse,
  MAX_PACKAGE_BYTES,
  UNIVERSE_PROTOCOL,
  type PlanetRecord,
} from "../src/core/protocol";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const local = process.argv.includes("--local");
const sources: {
  id: string;
  repository: string;
  commit: string;
  position: [number, number, number];
}[] = JSON.parse(await readFile(resolve(root, "registry/sources.json"), "utf8"));
const records: PlanetRecord[] = [];

async function get(repository: string, commit: string, file: string): Promise<Buffer> {
  assert(/^[\w.-]+\/[\w.-]+$/.test(repository) && /^[a-f0-9]{40}$/.test(commit), "仓库或提交无效");
  if (local) {
    const checkout = resolve(root, "..", repository.split("/")[1]!);
    return execFileSync("git", ["-C", checkout, "show", `${commit}:${file}`], {
      maxBuffer: MAX_PACKAGE_BYTES + 1,
    });
  }
  const response = await fetch(
    `https://raw.githubusercontent.com/${repository}/${commit}/${file}`,
    { signal: AbortSignal.timeout(30_000) },
  );
  assert(response.ok, `无法下载 ${repository}/${file}: ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  assert(data.byteLength <= MAX_PACKAGE_BYTES, "文件超过 5 MB");
  return data;
}

for (const source of sources) {
  const manifestBytes = await get(source.repository, source.commit, "planet.json");
  const manifest = parseManifest(JSON.parse(manifestBytes.toString("utf8")));
  const authorCode = await get(source.repository, source.commit, "planet.js");
  const result = await build({
    stdin: { contents: authorCode.toString("utf8"), loader: "js", sourcefile: "planet.js" },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "AstraPlanet",
    target: "es2022",
    plugins: [
      {
        name: "no-dependencies",
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, () => ({
            errors: [{ text: "Planet modules cannot import dependencies" }],
          }));
        },
      },
    ],
  });
  const code = Buffer.from(result.outputFiles[0]!.contents);
  const license = await get(source.repository, source.commit, "LICENSE");
  const totalBytes = manifestBytes.length + code.length + license.length;
  assert(totalBytes <= MAX_PACKAGE_BYTES, `${source.id} 超过 5 MB`);
  const hash = createHash("sha256").update(code).digest("hex");
  const relative = `planets/${source.id}/${hash}`;
  const destination = resolve(root, "public", relative);
  await mkdir(destination, { recursive: true });
  await Promise.all([
    writeFile(resolve(destination, "planet.json"), manifestBytes),
    writeFile(resolve(destination, "planet.js"), code),
    writeFile(resolve(destination, "LICENSE"), license),
  ]);
  records.push({
    ...manifest,
    id: source.id,
    position: source.position,
    source: { repository: source.repository, commit: source.commit },
    package: { url: `${relative}/planet.js`, sha256: hash, bytes: code.length, totalBytes },
  });
  console.log(
    `${source.id}: ${source.repository}@${source.commit.slice(0, 7)} · ${totalBytes} bytes`,
  );
}
const universe = parseUniverse({ protocol: UNIVERSE_PROTOCOL, planets: records });
await writeFile(
  resolve(root, "public/universe.json"),
  await format(JSON.stringify(universe), { parser: "json", printWidth: 100 }),
);
console.log(`Published ${records.length} immutable planet versions.`);
