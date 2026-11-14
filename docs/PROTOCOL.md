# Astra Planet Protocol 0.1

本协议是首版的实际实现合同。每个仓库维护一颗有限、球形主体的程序化星球。

人类接入入口：[CONTRIBUTING.md](../CONTRIBUTING.md)。
AI 实现细节：[AI_AUTHORING.md](AI_AUTHORING.md)。
2026-11-14 在 0.1 原型中补充空间和渲染边界；两个测试星球保持兼容。

编辑器可使用 [planet.json 的 JSON Schema](../public/schemas/planet.schema.json) 进行输入提示。

## 发布文件

发布的 `planet.json`、编译后的 `planet.js`、`LICENSE` 字节总和不得超过 **5,000,000 bytes**。
同步获取的单个源文件也不得超过该大小。
禁止模型、图片、字体、音视频、远程依赖和伪装成代码数组的预制美术资产。
运行后生成的几何和像素不计发布体积，计入运行资源。

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

半径在 100–5000 之间。种子为安全整数。名称最多 80 字符。颜色为六位十六进制。
首版不定义推荐观景点或作者控制的相机。

## 入口

```js
export function buildPlanet({ THREE, radius, seed, random, detail }) {
  const root = new THREE.Group();
  // detail: "far" | "near"; random(): deterministic [0, 1)
  // Add generated geometry, materials, DataTextures.
  // Surface meshes: mesh.userData.astraSurface = true.
  return root;
}
```

可以返回 Promise。`far` 和 `near` 必须有一致的地貌布局和半径；仅细节密度不同。
不支持模块依赖。无需 import Three.js；主站提供固定版本。

## 可用输出

- Group、Mesh、InstancedMesh、Points、Line、LineSegments。
- BufferGeometry，SDK 自动把参数化几何转换为保留真实顶点的 BufferGeometry。
- Standard、Physical、Basic、Shader、Points 和 LineBasic 材质。
- Uint8Array DataTexture，最大 512 × 512。无图片 URL、CanvasTexture、CubeTexture。
- ShaderMaterial 的 `uTime` 由主站每帧更新。无任意逐帧 JS 回调和 onBeforeCompile。
- 生成结果最多 100,000 三角形（乘实例数）、512 个节点、256 个几何、32 MiB JSON。
- 按实例数累计最多检查 300,000 个变换后 CPU 顶点。
- 标记地表必须是球面主体，位于中心的 0.5–1.5 倍半径范围内。附属结构不参与碰撞。
- 不支持相机、灯光、DOM、renderer、controls 或全屏效果接管。

每档生成最长 15 秒，单颗加载最长 45 秒。超时销毁 Worker；异常不破坏当前世界。
目前发布者应人工复核生成代码和 Shader；此原型不作为任意恶意 GPU 程序的公共托管平台。

## 宇宙背景与作者领地

主站拥有统一背景星空、基础光照、相机、曝光、色调映射、旅行和 UI。
作者仅提供自己的局部场景，不能替换背景、全局雾/环境/光照或增加全屏后处理。
局部大气可以在玩家身处内部时占满视野，效果仍须来自该星球的有限体积。

返回独立根 Group，保持原点、默认旋转和单位缩放。全部父级和实例变换后的 CPU 顶点
必须在中心 **2R** 内；标记地表顶点在 **0.5R–1.5R** 内。检查容差 R×10^-5。
局部效果也应留在 2R 内，不能扩散至其他星球。星图预留不相交的 2R 领地。
GPU 位移贴图、morph 与 Shader 顶点位移不支持；在 CPU 中直接生成地貌。

材质必须保持 depthTest，depthFunc 仅 LessDepth/ LessEqualDepth，禁止 stencilWrite、polygonOffset 和 colorWrite=false，
renderOrder=0，混合仅 NoBlending/NormalBlending/AdditiveBlending。透明材质允许 depthWrite=false。
PointsMaterial 必须随距离衰减，尺寸在 (0,32] 世界单位内。

自定义 Shader 只给自己的网格着色，保留正常几何投影；不写 gl_FragDepth，不通过 gl_Position
或 gl_PointSize 扩大实际影响区域。主站只自动更新 uTime；无作者逐帧 JS。
这些 GLSL 行为与 GPU 代价当前由人工审核；数据校验不构成任意 Shader 的硬空间或 GPU 隔离。

## 隔离与网络

主窗口下载并验证代码，代码只在 sandbox="allow-scripts" 的不透明来源页面创建的 Blob Worker 中执行。
该页面的 CSP 禁止连接和远程资源，Blob Worker 继承策略。不授予 allow-same-origin。
作者不能访问主窗口、账户、主站存储或 DOM。生成结束即结束 Worker。
发布脚本通过 esbuild 将入口 ES 模块编译成无依赖 IIFE。隔离 Worker 的 CSP 允许执行该代码，
但禁止网络；主窗口不启用 eval。经典 Blob Worker 避免不透明来源下 Module Worker 的跨源限制。
主线程再次校验生成数据，拒绝 URL 纹理等可发起请求的内容。

本方案适用于 GitHub Pages，无需自定义服务器响应头。严禁在主窗口直接 import 作者代码。

## 星图与版本

`registry/sources.json` 登记 `id`、`repository`、40 位 `commit` 和 `position`。
`scripts/sync-planets.ts` 获取固定提交，校验并编译入口，复制发布文件至静态目录。
`public/universe.json` 保存 manifest、空间坐标、源提交、文件 SHA-256 和字节数。

运行时仅下载相对路径 `planets/<id>/<sha256>/planet.js`，下载后再次校验字节数和 SHA-256。
作者仓库更新不会自动替换批准版本。更新需重新登记提交并同步。
相邻星球的 2R 领地不得重叠。重命名、版本变化不改变 id 和坐标。

## 游览与加载

世界绝对坐标使用 JavaScript number；渲染位置为 `worldPosition - playerPosition`。
普通航行持续修改玩家位置。没有关卡切换和自动传送。
地表通过标记网格径向检测，光点至少保持 8 单位高度，无复杂物理。

远距离为主站光点标记；中距离显示 far；3 倍半径内显示 near。
首版有两个星球，启动时优先出生星球和选定目标，提前生成两档并预热 GPU。
跃迁等待目标完成下载、生成、Three.js 还原、纹理上传、Shader 编译和隐藏预渲染。
跃迁动画至少 2.2 秒；目标未准备完成时继续。取消保留出发位置。

## 许可与审核

仓库必须明确允许平台构建、缓存、分发和展示。两个测试仓库及主站使用 MIT。
自动校验不能识别所有伪装资产；首版以人工登记、人工复核为准。
