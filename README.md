# Astra · 代码星海

一个通过统一协议连接独立 GitHub 星球仓库的网页宇宙原型。
两个星球仅为简单圆球，用于验证连续航行、后台生成和跃迁等待。

**在线游览：<https://likeUMR.github.io/astra-universe/>**

## 制作自己的星球

- **人类快速入口：[用代码加入 Astra](CONTRIBUTING.md)**，了解能做什么、不能接管什么，以及如何提交。
- **交给 AI：[AI 作者详细规范](docs/AI_AUTHORING.md)**，包含完整参数、空间/Shader 边界、预算、预览和审核要求。
- [局部 Shader 示例](examples/shader-planet.js) 可直接作为作者入口参考，不会替换主站背景。

主站提供统一宇宙背景、基础光照和旅行；作者创作自己的有限星球。
静态几何有 2R 领地校验，任意 Shader 的实际视觉范围和 GPU 耗时仍需审核。

## 启动

需要 Node.js 24+。

```sh
npm ci
npm run dev
```

打开输出的本地地址。点击“进入星海”，点击画面控制朝向，Esc 释放鼠标。
WASD 航行，空格/Ctrl 升降，Shift 加速；右侧选择目标、对准或按 F 跃迁。
也可以持续普通航行抵达另一颗星球，不会自动传送。

```sh
npm run check
npm run test:e2e
npm run build
npm run preview
```

浏览器测试本机默认使用已安装 Chrome；CI 安装 Playwright Chromium。
可设置 `PLAYWRIGHT_CHANNEL=chromium` 使用 Playwright 自带浏览器。

## 仓库分工

- 主站：<https://github.com/likeUMR/astra-universe>
- 蓝色测试星球：<https://github.com/likeUMR/astra-planet-azure>
- 橙色测试星球：<https://github.com/likeUMR/astra-planet-ember>

作者维护 `planet.json`、`planet.js` 和许可。主站登记具体提交并缓存批准文件。
网页运行时从本主仓库发布目录加载，避免依赖 GitHub API 配额和作者分支状态。

## 接入与更新

1. 复制一个测试星球仓库，编辑生成函数。
2. 在 `registry/sources.json` 加入仓库、完整提交 SHA、唯一 ID 和坐标。
3. `npm run sync:planets` 从 GitHub 固定提交获取并校验内容。
4. 提交并推送主仓库，执行 `npm run publish:pages`；全部本地测试通过后发布静态分支。

若三个仓库位于同一父目录，可以 `npm run sync:local` 从本地 Git 固定提交同步。
该命令读取提交对象，不读取尚未提交的工作区内容。

## 发布网站

当前 GitHub Pages 的发布源是 `gh-pages` 分支根目录；源码在 `main`。
主站已部署至上面的在线地址，无需后端服务。

```sh
git push origin main
npm run publish:pages
```

发布命令要求 main 的改动已提交并推送，然后执行代码检查、全部单元测试、
浏览器测试和带 `/astra-universe/` 子路径的生产构建。全部通过才更新 `gh-pages`，
并写入 `release.json` 记录源提交。最后等待仓库的 Pages 部署任务成功。
不会修改 main 工作区或强制覆盖远端发布历史。

2026-11-13 首次自定义 Actions 作业因账号账单锁定未能启动；不依赖该作业的 Pages 静态分支发布已经成功。
`.github/workflows/pages.yml` 保留为手动云端验证与部署配置。
恢复账号后，可将 Pages Source 切换至 GitHub Actions，再手动执行该配置。
详细已执行结果见 [验证记录](docs/VALIDATION.md)。

## 规范

- [作者协议](docs/PROTOCOL.md)
- [架构与代码约定](docs/ARCHITECTURE.md)
- [协作约束](AGENTS.md)

纯代码、无外部资产、每颗发布内容不超过 5,000,000 字节。生成程序不能额外联网。
主要依赖 Three.js；前台统一渲染，作者代码在隔离 Worker 中执行。
初版只接受人工复核过的作品，尚未面向任意恶意公开代码。

MIT License.
