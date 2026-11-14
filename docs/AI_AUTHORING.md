# Astra AI 作者详细规范

适用协议：`astra-planet/0.1`，2026-11-14 补充空间与渲染边界。
本文面向生成、修改星球仓库的 AI，也适合需要实现细节的人类作者。
正式合同是 [PROTOCOL.md](PROTOCOL.md)；人类快速入口是 [CONTRIBUTING.md](../CONTRIBUTING.md)。
不要把主仓库的引擎协作约定误当成星球作者 API。

## 1. 交付目标与权限

交付 `planet.json`、`planet.js`、`LICENSE`，可附 README。一个仓库是一颗有限的球形主体星球。
作者不能提供另一套渲染器、网页、相机、输入控制、飞船或联网后端来替代主站。
初版不提供自定义游戏逻辑、角色行为、声音、任意 JS 逐帧回调或推荐观景点。

| 内容                               | 控制者     | 作者的可用方式                                        |
| ---------------------------------- | ---------- | ----------------------------------------------------- |
| 宇宙星空、全局光照、曝光、色调映射 | 主站       | 使用默认环境；普通 Standard/Physical 材质接受主站光照 |
| 相机、移动、碰撞策略、跃迁、UI     | 主站       | 提供地表标记，不接管系统                              |
| 星球位置、注册 ID、批准版本        | 主站维护者 | 提交仓库和完整 SHA，由维护者登记                      |
| 地貌、建筑、装饰、光环、局部大气   | 星球作者   | 生成自己的局部几何，限定在 2R 领地内                  |
| 材质和 Shader                      | 星球作者   | 作用在自己的网格上；不授予全局渲染权限                |

主站当前背景在 `src/engine/world.ts` 中定义：深色太空、2,200 个程序星点、统一环境光和方向光。
星点随相机平移，形成基础远景。普通材质共享此光照；ShaderMaterial 需自己定义片元着色。
不支持星球修改 `scene.background/environment/fog`、添加全局灯光或接入 EffectComposer。

## 2. 文件与入口

`planet.json`：

```json
{
  "protocol": "astra-planet/0.1",
  "name": "My Planet",
  "entry": "planet.js",
  "seed": 42,
  "radius": 1000,
  "previewColor": "#4da6ff"
}
```

| 字段         | 约束                                        |
| ------------ | ------------------------------------------- |
| protocol     | 固定为 `astra-planet/0.1`                   |
| name         | 1–80 字符                                   |
| entry        | 固定为 `planet.js`                          |
| seed         | JavaScript 安全整数                         |
| radius       | 100–5000；本文用 R 表示                     |
| previewColor | `#RRGGBB`，用于未加载时的代理，不是天空颜色 |

`planet.js` 必须导出：

```js
export function buildPlanet({ THREE, radius, seed, random, detail }) {
  // detail is "far" or "near"; random() is a host-seeded value in [0, 1).
  const root = new THREE.Group();
  // Generate local geometry and materials here.
  return root;
}
```

允许返回 Promise。主站提供固定的 Three.js **0.187.0**，无需安装或 import。
不允许静态/动态模块依赖、远程资源或网络访问。不要依赖 DOM、Canvas、renderer、WebGPU 或主站存储。
主站只调用生成函数，完成后销毁 Worker；不要安排后续定时器、事件监听或回调。
`onBeforeCompile`、`onBeforeRender` 和自定义对象方法不会作为作者代码传到主窗口。

同一 seed 的 far/near 必须是同一颗星球，只改变密度。对固定地貌使用 `seed`、
`random()` 或确定性的坐标噪声；不要用 `Math.random()`、当前时间或随细分次数变化的随机调用序列决定布局。

## 3. 空间领地与地表

使用 Three.js 的右手坐标，Y 轴向上；初版 1 世界单位约等于 1 米。

- 返回独立、无父级的 `THREE.Group`。根变换保持 position=(0,0,0)、默认 rotation、scale=(1,1,1)。
- 星球中心由主站定位。不要把银河坐标写入根或几何。
- 子节点可以平移、旋转和缩放；计算全部父级变换及实例矩阵后，所有 CPU 顶点必须位于原点 2R 内。
- 所有局部效果也必须限于这块领地。主站检查静态顶点；粒子覆盖范围和 Shader 实际输出仍需审核。
- 地表 Mesh 设 `mesh.userData.astraSurface = true`，不能仅标记 Group。
- 标记地表的每个顶点必须在 0.5R–1.5R 内。地表应是围绕原点的封闭球形主体，
  每个径向方向有可游览的外表面；闭合、拓扑与远近一致性需要人工复核。
- 装饰不标记为地表。初版只做径向外表面碰撞，不支持复杂建筑碰撞、洞穴内部或行走系统。
- 主站保留实际地表上方 8 单位的玩家间距。近地高度显示基于名义 R，细分球面可有小误差。
- 主站为相邻星球预留不相交的 2R 领地。作者不能自行改变其他星球或把特效扩散到邻域。

GPU 位移贴图和 morph 变形不支持。地貌起伏应在生成函数内直接修改真实顶点，并重新计算法线。
Shader 顶点位移也不允许；它会绕过静态边界，并导致视觉地表与 CPU 碰撞不一致。
边界检查容差为 R×10^-5，不应依靠容差扩大作品范围。

## 4. 材质、Shader 与局部天气

可返回 Group、Object3D、Mesh、InstancedMesh、Points、Line、LineSegments。
几何最终以普通 BufferGeometry 传递；可从 SphereGeometry 等生成，主站会保留真实顶点。
支持 Standard、Physical、Basic、Shader、Points、LineBasic 材质；不支持 RawShaderMaterial。

可生成 Uint8Array DataTexture，最大 512×512。禁止图片 URL、外部图、CanvasTexture、CubeTexture 和预制资产数组。
普通材质的自发光只改变自己的外观；当前不会向邻近物体投射光，也没有自动 Bloom。

ShaderMaterial 使用以下约定：

1. 顶点着色器只做正确的模型、视图、投影变换；实例网格需正确乘 `instanceMatrix`。
   不允许用裁剪空间四边形、篡改 `gl_Position` 或任意 `gl_PointSize` 绕过自己的网格范围。
2. 片元着色器可以计算表面颜色、透明度、自发光和局部程序效果，不写 `gl_FragDepth`。
3. 主站只自动更新名为 `uTime` 的 uniform，单位为秒，来自页面时钟；其余 uniform 是作者生成的静态数据。
   没有“每帧执行作者 JS”的接口，不向作者提供主站帧缓冲或其他星球的数据。
4. 深度检测必须启用，深度函数仅 LessDepth / LessEqualDepth；不写 stencil，不启用 polygonOffset，不关闭 colorWrite。
   renderOrder 保持 0。混合仅 NoBlending、NormalBlending、AdditiveBlending。
   透明层允许 `depthWrite=false`，但仍保持 `depthTest=true`。
5. PointsMaterial 必须 `sizeAttenuation=true`，size 在 (0,32] 世界单位内；其可见覆盖也应留在领地内。
6. 雾、云、极光、大气用自己的有限网格或体积表现；人在内部可充满视野。
   不修改全局 fog、背景、曝光、灯光、相机或后处理，不覆盖远处无关区域。
7. 优先使用简单、固定上限的着色计算。避免高采样、多层全屏透明、无界或数据相关的大循环；
   GPU 性能由审核确认，没有硬件无关的自动耗时保证。

[可运行的局部 Shader 示例](../examples/shader-planet.js) 仅改变自己球面的颜色，
保留正常投影、深度和碰撞，已纳入真实浏览器生成及编译测试。

## 5. 预算与失败行为

| 项目                                   | 上限                    |
| -------------------------------------- | ----------------------- |
| 发布的 manifest + 编译后代码 + LICENSE | 5,000,000 bytes         |
| 同步获取的单个源文件                   | 5,000,000 bytes         |
| 每个 far/near 生成结果的 JSON          | 32 MiB                  |
| 节点 / 层级 / 几何                     | 512 / 深度小于 32 / 256 |
| 三角形，按实例数累计                   | 100,000                 |
| CPU 顶点变换检查量，按实例数累计       | 300,000                 |
| 单个实例网格实例数                     | 10,000                  |
| 单次生成 / 单颗加载                    | 15 秒 / 45 秒           |

超限、越界、禁止的材质状态或输出类型会拒绝该星球。不要假设主站会自动裁切或缩小作品。
加载失败不能提交跃迁目的地：出发世界仍保留，玩家位置不提前改变。

## 6. 本地预览与接入

维护自己的仓库并提交；主站不要求作者自己运行服务器上线。
如需本地预览，将主站和星球仓库放在同一父目录，目录名等于对应仓库名：

```text
workspace/
  astra-universe/
  my-planet/
```

在主站 `registry/sources.json` 添加记录；本地预览的坐标也不能与已有 2R 领地重叠：

```json
{
  "id": "my-planet",
  "repository": "your-account/my-planet",
  "commit": "<实际完整的40位提交SHA，不是main或占位符>",
  "position": [160000, 0, 0]
}
```

在主仓库执行：

```sh
npm ci
npm run sync:local
npm run dev
```

`sync:local` 读取固定 Git 提交对象，未提交的改动不会出现。
示例双星回归测试固定检查测试星图；验证自定义预览后，应恢复测试星图再运行完整回归，
不能把双星测试通过误当成新作品审核通过。

上线时向主仓库提交注册 PR 或提供仓库地址及完整 SHA，由维护者分配正式坐标、复核代码/Shader、
运行 `npm run sync:planets`、检查、发布。网页从主站缓存的不可变包加载，不会直接追踪作者 main 分支。
之后更新同一个 id 的提交；不自行改坐标，不依赖实时 GitHub API。

## 7. 自动检查与审核边界

| 规则                                                    | 当前保证方式                                      |
| ------------------------------------------------------- | ------------------------------------------------- |
| 来源提交、下载大小、SHA-256、无模块依赖                 | 发布脚本 / 主窗口检查                             |
| 生成代码无 DOM、主站权限或网络                          | 不透明来源 iframe + CSP + Worker；生成结束销毁    |
| 类型、JSON/三角形预算、禁止的材质状态、renderOrder      | Worker 与主窗口验证场景数据                       |
| 静态几何、父级/实例变换、地表范围、根变换、粒子基础状态 | Worker 检查；主窗口还原后再次检查，之后才准备 GPU |
| GLSL 实际空间输出、gl_FragDepth、循环代价、透明过绘制   | 人工审查与真实 GPU 试运行                         |
| 地表闭合、远近布局一致、无伪装资产、许可证适用性        | 作者声明与维护者审核                              |

重要区别：Worker 隔离的是生成 JavaScript，**Shader 最终仍在共享 WebGL 渲染器中执行**。
给网格加父 Group 或通过 CPU 顶点检查，不构成任意 GLSL 的硬空间隔离，也不能防止 GPU 卡死。
当前是人工审核后接入的原型，不是任意恶意公开 Shader 的无人审核托管平台。
不要在 README、PR 或回复中声称已实现这种保证。

维护者若需要检查实现，对应代码为 `src/generator/validation.ts`、`territory.ts`、`sandbox.ts`
和 `src/engine/planet-loader.ts`。作者只需遵守此契约，不应修改这些主站模块来放宽自己的权限。
