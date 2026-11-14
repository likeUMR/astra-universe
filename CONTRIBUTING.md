# 用一段代码，加入 Astra

你维护一颗星球，主站负责把它放进共同的宇宙。无需做网站、飞船或联网服务。

## 从这里开始

1. 复制 [苍蓝测试星球](https://github.com/likeUMR/astra-planet-azure) 到自己的仓库。
2. 修改 `planet.js`，在 `planet.json` 填名称、种子、半径和预览颜色，保留 `LICENSE`。
3. 提交代码，把仓库地址和完整提交 SHA 提交给主站维护者；维护者分配坐标、审核并登记上线。

最小入口如下，Three.js 由主站提供，不需要 import：

```js
export function buildPlanet({ THREE, radius, detail }) {
  const root = new THREE.Group();
  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(radius, detail === "near" ? 64 : 24, 32),
    new THREE.MeshStandardMaterial({ color: 0x4da6ff }),
  );
  surface.userData.astraSurface = true;
  root.add(surface);
  return root;
}
```

## 你能决定什么

你可以设计地貌、建筑、植被、浮空装饰、光环、局部大气、程序生成的纹理和材质动画。
初版仍以一颗球形星球为主体；复杂物理、洞穴内部和任意游戏逻辑尚未接入。

设半径为 R：星球中心由主站定位，**你的全部几何和局部效果应留在中心 2R 内**；
标记为地表的网格顶点在 0.5R–1.5R 内。根 Group 保持原点、默认旋转和单位缩放。

**主站提供统一星空、基础光照、相机、玩家和旅行系统。**
你的 Shader 用于自己的网格材质，可以做颜色、发光、流水和局部大气效果；
不能修改整个宇宙的天空、光照、雾、曝光或后处理，也不能把自身画成绕过深度检测的全屏覆盖层。
身处局部大气内部时，它可以占满视野，但效果仍必须来自你的有限空间。

只提交代码：不用外部模型、图片、远程依赖或网络请求。发布内容不超过 5 MB；
远近两档保持同一世界布局。建议先用普通材质跑通，再参考 [局部 Shader 示例](examples/shader-planet.js)。

## 交给 AI 时

把 [AI 作者详细规范](docs/AI_AUTHORING.md) 和模板仓库一起交给 AI：

> 按 Astra AI 作者规范，为我生成 planet.json、planet.js 和 LICENSE。使用主站提供的 Three.js，所有内容保持在自己的星球范围内，并说明如何验证和接入。

系统会检查静态几何边界和基本渲染状态；**任意 GLSL 的视觉越界和 GPU 耗时仍需人工审核**。
更详细的 API、预算、预览步骤和审核要求见 AI 规范；正式规则以 [协议](docs/PROTOCOL.md) 为准。
