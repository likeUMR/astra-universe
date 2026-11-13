# Astra · 代码星海

一个通过统一协议连接独立 GitHub 星球仓库的网页宇宙原型。
两个星球仅为简单圆球，用于验证连续航行、后台生成和跃迁等待。

**在线游览：<https://likeUMR.github.io/astra-universe/>**

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
4. 执行全部测试，提交主仓库，GitHub Actions 发布 Pages。

若三个仓库位于同一父目录，可以 `npm run sync:local` 从本地 Git 固定提交同步。
该命令读取提交对象，不读取尚未提交的工作区内容。

## 规范

- [作者协议](docs/PROTOCOL.md)
- [架构与代码约定](docs/ARCHITECTURE.md)
- [协作约束](AGENTS.md)

纯代码、无外部资产、每颗发布内容不超过 5,000,000 字节。生成程序不能额外联网。
主要依赖 Three.js；前台统一渲染，作者代码在隔离 Worker 中执行。
初版只接受人工复核过的作品，尚未面向任意恶意公开代码。

MIT License.
