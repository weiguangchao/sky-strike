## Preferences

- Use **typescript-best-practices** skill when reading or editing any .ts or .tsx file.

# Sky Strike 项目约定

## 产品文档

修改游戏前，先阅读 [功能文档索引](dcos/feature/README.md)，再阅读与本次变更相关的说明：

- [游戏玩法](dcos/feature/gameplay.md)：战斗循环、战机、敌机、首领、强化和计分。
- [功能清单](dcos/feature/features.md)：界面、操作、暂停、存储、适配和声音。
- [产品特点与画风](dcos/feature/characteristics.md)：二战复古风格、Phaser 4 二维渲染和交互约束。
- [Blender 模型流程](dcos/feature/models.md)：模型源文件、导出、动画节点与资源验证。
- [Cloudflare Workers 部署](dcos/feature/deployment.md)：配置、授权、构建、资源行为与上线验证。

`dcos/feature/` 是本项目约定的产品文档目录。变更玩法、功能或视觉规范时，同步更新相应文档，确保文档描述与实际实现一致。

## 实现约束

- 游戏整体采用二战复古风格：螺旋桨飞机、轰炸机、航母、海岛、橄榄迷彩与旧式作战仪表保持一致；使用架空中队，不要求复刻真实历史机型。
- 应用、开发配置和测试使用 TypeScript，启用严格类型检查。Blender 建模脚本使用 Blender Python API。
- 运行时使用 Phaser 4 和本地二维 PNG 精灵；浏览器不得加载 Three.js 或 GLB。保留 Blender `.blend`、GLB 与可复现脚本作为离线美术源，通过 `npm run sprites:build` 生成分层精灵。
- 页面随浏览器可视窗口宽高自适应，战场保持竖版比例；机库、战斗和弹窗均不得产生页面滚动或裁切关键按钮。
- 保留电脑键盘、鼠标与手机触摸操作，切换到后台时自动暂停。
- 游戏资源在项目中提供，运行时不依赖外部图片、字体或音频服务。
- 战斗识别优先于写实色调：敌弹保持红／玫红暖色与小型圆／尖弹形状；补给为青蓝箭纹箱、绿色十字包、紫色菱形航弹箱。标记精灵保留 Blender 源资产的 unlit 色，运行时不施加光照或色调映射。
- 不得以褐灰道具、整体低饱和滤镜、雾层或过曝光照重新混淆敌弹与补给；相关改动运行 `tests/browser/visual.spec.ts` 的真实像素检查。
- 战斗 HUD 背景须在逻辑纵坐标 80 前渐隐为透明，波次横幅采用低透明度渐变，文字与阴影也须透出敌弹；像素测试覆盖字形下的敌弹，小屏截图须等待至少两帧完成窗口重绘。
- 战斗逻辑放在 `game/engine.ts`，共享类型在 `game/types.ts`，Phaser 场景、循环与输入在 `game/runtime.ts`，二维渲染在 `game/render.ts`，精灵加载在 `game/sprites.ts`；修改画风时不改变碰撞判定或战斗数值。
- `game/style.css` 负责组件外观，`game/layout.css` 负责窗口适配。保留当前工作区已有修改。

## 开发与验证

- `npm run dev`：本地开发，默认端口 5173。
- `npm run typecheck`：TypeScript 严格类型检查。
- `npm test`：战斗逻辑、完整通关模拟与导出模型验证。
- `npm run test:e2e`：游戏流程、手机触摸和窗口适配；涉及交互、渲染或布局时运行。
- `npm run build`：构建静态网站至 `dist/`。
- `npm run sprites:build`：从本地 GLB 离线生成全部二维精灵；`npm run sprites:check` 检查源指纹、图层和体积。
- `npm run models:build`：使用 Blender 重新生成模型库；可用 `BLENDER_PATH` 指定 Blender 程序。
- `npm run deploy:check`：构建并检查 Workers 部署配置；`npm run deploy` 发布；`npm run worker:dev` 使用本地 Workers 运行时验证。
- 浏览器测试优先使用本机 Google Chrome；其他环境可用 Playwright Chromium。

## Pull requests

- Never make a PR unless the developer explicitly asks you to do so.
- Conventional commit titles, plain language: `fix(web): new threads no longer spike CPU`.
- Body: the problem in a sentence or two, then how you fixed it. End with the model and harness that did the work.
- UI changes need before/after images embedded in the PR body.
- Upload PR evidence to GitHub. Never commit PR-only screenshots or other PR-only assets into the repo.
- When babysitting: call `watch_pull_request` and end your turn. T3 Code wakes you on checks, comments, or conflicts. Do not poll or sleep. Verify each bot finding against the source, fix real ones, dismiss false positives with a written reason. Stay quiet when nothing is new. Stop when the bots are green on the latest commit.
