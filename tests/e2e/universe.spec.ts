import { test, expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

async function replacePlanet(page: Page, id: string, source: string) {
  const sha256 = createHash("sha256").update(source).digest("hex");
  const bytes = Buffer.byteLength(source);
  await page.route("**/universe.json", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    const planet = json.planets.find((p: { id: string }) => p.id === id);
    planet.package = {
      url: `planets/${id}/${sha256}/planet.js`,
      sha256,
      bytes,
      totalBytes: bytes + 2000,
    };
    await route.fulfill({ json });
  });
  await page.route(`**/planets/${id}/**/planet.js`, (route) =>
    route.fulfill({ body: source, contentType: "text/javascript" }),
  );
}

async function enter(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "进入星海" })).toBeEnabled();
  await page.getByRole("button", { name: "进入星海" }).click();
  await expect.poll(() => page.evaluate(() => window.__ASTRA__?.snapshot().started)).toBe(true);
}

test("both independent planets generate, render and support a round trip", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await enter(page);
  await expect
    .poll(() =>
      page.evaluate(() => window.__ASTRA__?.snapshot().planets.every((p) => p.stage === "ready")),
    )
    .toBe(true);
  for (const id of ["ember", "azure"]) {
    await page.locator(`[data-planet="${id}"]`).click();
    await page.locator("#warp-button").click();
    await expect(page.locator(".warp")).toBeVisible();
    await expect(page.locator(".warp")).toBeHidden();
    const state = await page.evaluate(() => window.__ASTRA__!.snapshot());
    const target = state.planets.find((p) => p.id === id)!;
    const d = Math.hypot(...state.position.map((v, axis) => v - target.position[axis]!));
    expect(d).toBeCloseTo(target.radius * 1.12, 1);
  }
  expect(errors).toEqual([]);
  await page.screenshot({ path: "test-results/astraverse.png" });
});

test("warp stays active until delayed code and generation are ready", async ({ page }) => {
  await page.route("**/planets/ember/**/planet.js", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 6_000));
    await route.continue();
  });
  await enter(page);
  const initial = await page.evaluate(() => window.__ASTRA__!.snapshot().position);
  await page.locator("#warp-button").click();
  await expect(page.locator(".warp")).toBeVisible();
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__ASTRA__!.snapshot().position)).toEqual(initial);
  await expect(page.locator(".warp")).toBeHidden();
  expect(
    await page.evaluate(
      () => window.__ASTRA__!.snapshot().planets.find((p) => p.id === "ember")!.stage,
    ),
  ).toBe("ready");
});

test("cancelled warp preserves departure position", async ({ page }) => {
  await enter(page);
  const initial = await page.evaluate(() => window.__ASTRA__!.snapshot().position);
  await page.locator("#warp-button").click();
  await page.locator("#cancel-warp").click();
  await expect(page.locator(".warp")).toBeHidden();
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => window.__ASTRA__!.snapshot().position)).toEqual(initial);
});

test("ordinary flight reaches the other surface without a warp or coordinate jump", async ({
  page,
}) => {
  await page.route("**/universe.json", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json.planets[1].position = [13000, 350, -800];
    await route.fulfill({ json });
  });
  await enter(page);
  await page.locator("#aim-button").click();
  await page.evaluate(() => {
    const samples: number[][] = [];
    const id = setInterval(() => samples.push(window.__ASTRA__!.snapshot().position), 100);
    Object.assign(window, { __travelSamples: samples, __travelTimer: id });
  });
  await page.keyboard.down("Shift");
  await page.keyboard.down("w");
  try {
    await expect
      .poll(
        async () => {
          const state = await page.evaluate(() => window.__ASTRA__!.snapshot());
          const planet = state.planets[1]!;
          return (
            Math.hypot(...state.position.map((v, axis) => v - planet.position[axis]!)) /
            planet.radius
          );
        },
        { timeout: 45_000, intervals: [250] },
      )
      .toBeLessThan(1.01);
    // Keep flying into the surface: the light dot must stop above the terrain.
    await page.waitForTimeout(1_000);
    const landed = await page.evaluate(() => window.__ASTRA__!.snapshot());
    const target = landed.planets[1]!;
    const altitude =
      Math.hypot(...landed.position.map((v, axis) => v - target.position[axis]!)) - target.radius;
    expect(altitude).toBeGreaterThanOrEqual(7.5);
    expect(altitude).toBeLessThan(10);
  } finally {
    await page.keyboard.up("w");
    await page.keyboard.up("Shift");
  }
  const result = await page.evaluate(() => {
    const state = window as unknown as { __travelSamples: number[][]; __travelTimer: number };
    clearInterval(state.__travelTimer);
    return { samples: state.__travelSamples, warp: window.__ASTRA__!.snapshot().warp };
  });
  expect(result.warp).toBe("idle");
  expect(result.samples.length).toBeGreaterThan(10);
  for (let i = 1; i < result.samples.length; i++) {
    const step = Math.hypot(
      ...result.samples[i]!.map((v, axis) => v - result.samples[i - 1]![axis]!),
    );
    expect(step).toBeLessThan(3000);
  }
});

test("opaque worker blocks actual network access and has no DOM", async ({ page }) => {
  await enter(page);
  let networkRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("forbidden-network-probe")) networkRequests++;
  });
  const result = await page.evaluate(async () => {
    const modulePath = "/src/generator/sandbox.ts";
    const { generate } = await import(modulePath);
    const source = `var AstraPlanet = { buildPlanet: async function({THREE,radius}){
      let blocked=false; try { await fetch('http://127.0.0.1:5173/forbidden-network-probe'); } catch { blocked=true; }
      if(!blocked || typeof document !== 'undefined') throw new Error('Isolation failed');
      const root=new THREE.Group();root.name='network-blocked';
      const mesh=new THREE.Mesh(new THREE.SphereGeometry(radius,8,4),new THREE.MeshBasicMaterial());
      mesh.userData.astraSurface=true;root.add(mesh);return root;
    } };`;
    return (await generate(source, { radius: 1000, seed: 1, detail: "near" })).object.name;
  });
  expect(result).toBe("network-blocked");
  expect(networkRequests).toBe(0);
});

test("a stuck generator times out while the main world remains responsive", async ({ page }) => {
  await enter(page);
  const message = await page.evaluate(async () => {
    const modulePath = "/src/generator/sandbox.ts";
    const { generate } = await import(modulePath);
    try {
      await generate(
        "var AstraPlanet={buildPlanet(){while(true){}}};",
        { radius: 1000, seed: 1, detail: "near" },
        undefined,
        400,
      );
    } catch (error) {
      return (error as Error).message;
    }
    return "unexpected";
  });
  expect(message).toContain("超时");
  await page.locator('[data-planet="azure"]').click();
  await expect(page.locator("#target-name")).toHaveText("苍蓝");
  expect(
    await page.evaluate(() => document.querySelectorAll("iframe[sandbox]").length),
  ).toBeLessThanOrEqual(1);
});

test("tampered source is rejected before execution", async ({ page }) => {
  await page.route("**/planets/azure/**/planet.js", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    await route.fulfill({
      body: body.replace("surface", "surfacf"),
      contentType: "text/javascript",
    });
  });
  await page.goto("/");
  await expect(page.locator("#intro-state")).toContainText("校验失败");
  await expect(page.getByRole("button", { name: "重新加载" })).toBeEnabled();
});

test("the documented local shader generates and compiles in the real world", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("Shader"))
      errors.push(message.text());
  });
  const example = readFileSync(new URL("../../examples/shader-planet.js", import.meta.url), "utf8");
  const source = transformSync(example, { format: "iife", globalName: "AstraPlanet" }).code;
  await replacePlanet(page, "azure", source);
  await enter(page);
  await expect
    .poll(() => page.evaluate(() => window.__ASTRA__!.snapshot().planets[0]!.stage))
    .toBe("ready");
  expect(errors).toEqual([]);
});

test("an out-of-territory planet fails without moving or breaking the current world", async ({
  page,
}) => {
  await replacePlanet(
    page,
    "ember",
    `var AstraPlanet = { buildPlanet: function({THREE,radius}) {
      const root = new THREE.Group();
      const surface = new THREE.Mesh(new THREE.SphereGeometry(radius,16,8),new THREE.MeshBasicMaterial());
      surface.userData.astraSurface = true;
      root.add(surface);
      root.add(new THREE.Mesh(new THREE.SphereGeometry(radius*3,8,4),new THREE.MeshBasicMaterial()));
      return root;
    } };`,
  );
  await enter(page);
  const initial = await page.evaluate(() => window.__ASTRA__!.snapshot().position);
  await expect
    .poll(() => page.evaluate(() => window.__ASTRA__!.snapshot().planets[1]!.stage))
    .toBe("error");
  await page.locator("#warp-button").click();
  await expect(page.locator("#toast")).toContainText("领地");
  await expect(page.locator(".warp")).toBeHidden();
  const state = await page.evaluate(() => window.__ASTRA__!.snapshot());
  expect(state.position).toEqual(initial);
  expect(state.planets[0]!.stage).toBe("ready");
  await page.locator('[data-planet="azure"]').click();
  await expect(page.locator("#target-name")).toHaveText("苍蓝");
});
