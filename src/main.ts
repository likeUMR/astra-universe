import "./style.css";
import * as THREE from "three";
import { parseUniverse, type PlanetRecord } from "./core/protocol";
import { distance, preloadPriority, type Vec3 } from "./core/travel";
import { Flight } from "./engine/flight";
import { PlanetLoader, type LoadStage } from "./engine/planet-loader";
import { World } from "./engine/world";
import { Warp } from "./engine/warp";

const stages: Record<LoadStage, string> = {
  idle: "等待准备",
  downloading: "下载代码",
  generating: "生成世界",
  preparing: "准备渲染",
  ready: "可抵达",
  error: "加载失败",
};
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <canvas class="world" aria-label="Astra 三维宇宙"></canvas>
  <div class="hud">
    <header class="topbar"><div class="brand"><span class="brand-mark"></span><div><div class="brand-name">ASTRA</div><div class="eyebrow">由代码连接的星海</div></div></div><span class="version">PROTOCOL 0.1 · ALPHA</span></header>
    <div class="status-pill"><i class="live-dot"></i><span id="sector-status">正在连接星图</span></div>
    <aside class="chart panel"><div class="panel-heading"><span>附近星图</span><small id="planet-count">—</small></div><div class="map"><div class="map-axis"></div><div class="map-player" id="map-player"></div></div><div class="map-caption">LOCAL SECTOR / 独立仓库，连续空间</div><div class="planet-list"></div></aside>
    <div class="crosshair"></div><div id="labels"></div>
    <section class="telemetry"><div class="metric"><div class="metric-label">航行速度</div><span class="metric-value" id="speed">0</span><span class="metric-unit">m/s</span></div><div class="metric"><div class="metric-label">距最近地表</div><span class="metric-value" id="altitude">—</span><span class="metric-unit" id="altitude-unit">km</span></div></section>
    <section class="target-panel panel"><div class="panel-heading">航行目标 <small>DESTINATION</small></div><div class="target-name" id="target-name">—</div><div class="target-info" id="target-info">选择一颗星球</div><div class="action-row"><button class="primary" id="warp-button">跃迁 <span>F</span></button><button class="secondary" id="aim-button">对准</button></div></section>
    <footer class="footer"><div class="controls"><span><kbd>W A S D</kbd>航行</span><span><kbd>Shift</kbd>加速</span><span><kbd>空格 / Ctrl</kbd>升降</span><span>点击画面转向 · <kbd>Esc</kbd>释放鼠标</span></div><a class="source-link" href="https://github.com/likeUMR/astra-universe" target="_blank" rel="noreferrer">探索协议 ↗</a></footer>
    <div class="toast" id="toast" hidden></div>
  </div>
  <section class="intro"><div class="intro-content"><div class="intro-index">THE FIRST SECTOR / 001</div><h1>一段代码<br>一颗星球</h1><p>穿过星海，抵达另一个人的创造。<br>普通航行或跃迁，由你决定。</p><div class="intro-state" id="intro-state">正在获取星图…</div><button class="primary" id="enter-button" disabled>正在准备世界</button><div class="intro-note">桌面浏览器 · 键盘与鼠标 · 无需登录</div></div></section>
  <section class="warp" hidden><div class="warp-core"></div><div class="warp-content"><div class="warp-eyebrow">WARP DRIVE / 跃迁中</div><h2 id="warp-target"></h2><div class="warp-stage" id="warp-stage"></div><button class="secondary" id="cancel-warp">取消跃迁</button></div></section>`;

function element<T extends HTMLElement = HTMLElement>(selector: string): T {
  return document.querySelector<T>(selector)!;
}
function text(selector: string, value: string): void {
  element(selector).textContent = value;
}
function lengthText(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${Math.round(value)} m`;
}

async function boot(): Promise<void> {
  const response = await fetch(`${import.meta.env.BASE_URL}universe.json`);
  if (!response.ok) throw new Error("无法获取星图");
  const universe = parseUniverse(await response.json());
  const canvas = element<HTMLCanvasElement>("canvas.world");
  const world = new World(canvas, universe.planets);
  const flight = new Flight(canvas);
  let selected = universe.planets[1] ?? universe.planets[0]!;
  let started = false;
  let toastTimer: ReturnType<typeof setTimeout>;
  const toast = (message: string) => {
    text("#toast", message);
    element("#toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      element("#toast").hidden = true;
    }, 6_000);
  };
  const loader = new PlanetLoader(world.renderer, () => updateUI());
  const warp = new Warp(
    loader,
    flight,
    () => {
      updateUI();
      if (warp.error) toast(`跃迁未完成：${warp.error}`);
    },
    (planet, direction) => world.surfaceRadius(planet, direction, loader),
  );
  const spawn = universe.planets[0]!;
  flight.position.set(
    spawn.position[0],
    spawn.position[1] + spawn.radius * 0.35,
    spawn.position[2] + spawn.radius * 3.1,
  );
  flight.face(new THREE.Vector3(...spawn.position));
  const select = (planet: PlanetRecord) => {
    selected = planet;
    updateUI();
  };

  const list = element(".planet-list");
  const labels = element("#labels");
  const map = element(".map");
  const buttons = new Map<string, HTMLButtonElement>();
  const labelButtons = new Map<string, HTMLButtonElement>();
  const boundsX =
    Math.max(...universe.planets.map((p) => p.position[0])) -
    Math.min(...universe.planets.map((p) => p.position[0]));
  const boundsZ =
    Math.max(...universe.planets.map((p) => p.position[2])) -
    Math.min(...universe.planets.map((p) => p.position[2]));
  const minX = Math.min(...universe.planets.map((p) => p.position[0]));
  const minZ = Math.min(...universe.planets.map((p) => p.position[2]));
  const mapPoint = (p: readonly number[]) => ({
    x: 16 + ((p[0]! - minX) / Math.max(boundsX, 1)) * 66,
    y: 30 + ((p[2]! - minZ) / Math.max(boundsZ, 1)) * 36,
  });
  for (const planet of universe.planets) {
    const button = document.createElement("button");
    button.className = "planet-button";
    button.dataset.planet = planet.id;
    button.setAttribute("aria-label", `选择${planet.name}`);
    button.innerHTML = `<div class="planet-row"><span class="planet-name"><i class="planet-dot"></i><span></span></span><span class="planet-id"></span></div><div class="planet-meta"><span class="planet-distance"></span><span class="load-status"></span></div>`;
    button.querySelector<HTMLElement>(".planet-dot")!.style.background = planet.previewColor;
    button.querySelector(".planet-name span")!.textContent = planet.name;
    button.querySelector(".planet-id")!.textContent = planet.id.toUpperCase();
    button.onclick = () => select(planet);
    list.append(button);
    buttons.set(planet.id, button);
    const label = document.createElement("button");
    label.className = "planet-label";
    label.textContent = planet.name;
    label.onclick = () => select(planet);
    labels.append(label);
    labelButtons.set(planet.id, label);
    const point = document.createElement("button");
    point.className = "map-planet";
    point.title = planet.name;
    point.setAttribute("aria-label", `星图中的${planet.name}`);
    point.style.background = planet.previewColor;
    point.style.color = planet.previewColor;
    const location = mapPoint(planet.position);
    point.style.left = `${location.x}%`;
    point.style.top = `${location.y}%`;
    point.onclick = () => select(planet);
    map.append(point);
  }
  function updateUI(): void {
    const position = flight.position.toArray() as Vec3;
    for (const planet of universe.planets) {
      const button = buttons.get(planet.id);
      if (!button) continue;
      button.classList.toggle("selected", selected.id === planet.id);
      button.setAttribute("aria-pressed", String(selected.id === planet.id));
      button.querySelector(".planet-distance")!.textContent = lengthText(
        Math.max(0, distance(position, planet.position) - planet.radius),
      );
      const asset = loader.state(planet);
      button.querySelector(".load-status")!.textContent = stages[asset.stage];
      button.title = asset.error ?? planet.source.repository;
    }
    text("#target-name", selected.name);
    text(
      "#target-info",
      `${lengthText(Math.max(0, distance(position, selected.position) - selected.radius))} · ${stages[loader.state(selected).stage]}`,
    );
    element<HTMLButtonElement>("#warp-button").disabled = !started || warp.phase !== "idle";
    const overlay = element(".warp");
    overlay.hidden = warp.phase === "idle";
    overlay.classList.toggle("exiting", warp.phase === "exit");
    text("#warp-target", warp.target?.name ?? "");
    text(
      "#warp-stage",
      warp.phase === "exit"
        ? "抵达目标"
        : warp.target
          ? `${stages[loader.state(warp.target).stage]} · 正在穿越星海`
          : "",
    );
    element("#cancel-warp").hidden = warp.phase === "exit";
  }
  element("#aim-button").onclick = () => {
    if (warp.phase !== "idle") return;
    flight.face(new THREE.Vector3(...selected.position));
  };
  element("#warp-button").onclick = () => {
    void warp.start(selected);
  };
  element("#cancel-warp").onclick = () => warp.cancel();
  const onKey = (event: KeyboardEvent) => {
    if (!started || event.repeat) return;
    if (event.code === "KeyF" && warp.phase === "idle") void warp.start(selected);
    if (event.code === "Escape") warp.cancel();
    if (event.code === "KeyG") flight.face(new THREE.Vector3(...selected.position));
  };
  window.addEventListener("keydown", onKey);
  const onResize = () => world.resize();
  window.addEventListener("resize", onResize);
  element("#enter-button").onclick = () => {
    started = true;
    flight.enabled = true;
    element(".intro").hidden = true;
    updateUI();
  };
  text("#planet-count", `${universe.planets.length} WORLDS`);
  text("#sector-status", "第 001 星区 · 自由航行");
  let last = performance.now();
  let lastUI = 0;
  let frameCount = 0;
  let fps = 0;
  let fpsAt = last;
  let stopped = false;
  const frame = (now: number) => {
    if (stopped) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    flight.update(dt, universe.planets, (planet, direction) =>
      world.surfaceRadius(planet, direction, loader),
    );
    world.place(flight.position, flight.forward, loader, now / 1000);
    world.render();
    frameCount++;
    if (now - fpsAt > 1000) {
      fps = (frameCount * 1000) / (now - fpsAt);
      frameCount = 0;
      fpsAt = now;
    }
    for (const planet of universe.planets) {
      const projected = world.project(planet);
      const label = labelButtons.get(planet.id)!;
      label.hidden =
        !projected.visible ||
        distance(flight.position.toArray(), planet.position) < planet.radius * 1.5;
      if (!label.hidden) {
        label.style.left = `${projected.x}px`;
        label.style.top = `${projected.y}px`;
      }
    }
    if (now - lastUI > 200) {
      lastUI = now;
      updateUI();
      const p = flight.position.toArray() as Vec3;
      const altitude = Math.max(
        0,
        Math.min(...universe.planets.map((planet) => distance(p, planet.position) - planet.radius)),
      );
      text("#speed", String(Math.round(flight.speed)));
      text(
        "#altitude",
        altitude > 1000 ? (altitude / 1000).toFixed(1) : String(Math.round(altitude)),
      );
      text("#altitude-unit", altitude > 1000 ? "km" : "m");
      const mp = mapPoint(p);
      const dot = element("#map-player");
      dot.style.left = `${THREE.MathUtils.clamp(mp.x, 3, 95)}%`;
      dot.style.top = `${THREE.MathUtils.clamp(mp.y, 5, 90)}%`;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  updateUI();
  const spawnPromise = loader.ensure(spawn);
  const candidates = universe.planets
    .filter((planet) => planet.id !== spawn.id)
    .sort(
      (a, b) =>
        preloadPriority(
          flight.position.toArray() as Vec3,
          flight.forward.toArray() as Vec3,
          a,
          selected.id,
        ) -
        preloadPriority(
          flight.position.toArray() as Vec3,
          flight.forward.toArray() as Vec3,
          b,
          selected.id,
        ),
    );
  for (const planet of candidates.slice(0, 2)) void loader.ensure(planet).catch(() => undefined);
  try {
    await spawnPromise;
    text("#intro-state", "世界已准备好 · 两个独立仓库接入");
    const enter = element<HTMLButtonElement>("#enter-button");
    enter.disabled = false;
    enter.textContent = "进入星海 →";
  } catch (error) {
    text("#intro-state", `准备失败：${error instanceof Error ? error.message : "未知错误"}`);
    element("#intro-state").classList.add("error-state");
    const retry = element<HTMLButtonElement>("#enter-button");
    retry.disabled = false;
    retry.textContent = "重新加载";
    retry.onclick = () => location.reload();
  }
  // Small, read-only diagnostics make real browser tests observable.
  window.__ASTRA__ = {
    snapshot: () => ({
      position: flight.position.toArray() as Vec3,
      selected: selected.id,
      warp: warp.phase,
      started,
      fps: Math.round(fps),
      planets: universe.planets.map((planet) => ({
        id: planet.id,
        position: planet.position,
        radius: planet.radius,
        stage: loader.state(planet).stage,
        error: loader.state(planet).error,
      })),
      timings: loader.timings,
      renderer: {
        geometries: world.renderer.info.memory.geometries,
        textures: world.renderer.info.memory.textures,
      },
    }),
  };
  window.addEventListener(
    "pagehide",
    () => {
      stopped = true;
      flight.dispose();
      loader.dispose();
      world.dispose();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
    },
    { once: true },
  );
}

declare global {
  interface Window {
    __ASTRA__?: {
      snapshot: () => {
        position: Vec3;
        selected: string;
        warp: string;
        started: boolean;
        fps: number;
        planets: { id: string; position: Vec3; radius: number; stage: LoadStage; error?: string }[];
        timings: Record<string, { generationMs: number; preparationMs: number }>;
        renderer: { geometries: number; textures: number };
      };
    };
  }
}

void boot().catch((error) => {
  text("#intro-state", `无法进入：${error instanceof Error ? error.message : "未知错误"}`);
  const button = element<HTMLButtonElement>("#enter-button");
  button.disabled = false;
  button.textContent = "重试";
  button.onclick = () => location.reload();
});
