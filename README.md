# 苍穹突袭 · Sky Strike

支持电脑与手机浏览器的二战复古竖版肉鸽空战游戏。使用 **TypeScript + Vite + Three.js** 开发，飞机、首领、航母与海岛在 **Blender** 中建模，浏览器加载本地 GLB 实时渲染。

在线试玩：[sky-strike.tabuxiangma.workers.dev](https://sky-strike.tabuxiangma.workers.dev)。

完整产品说明见 [dcos/feature/](dcos/feature/README.md)，开发约定见 [AGENTS.md](AGENTS.md)。

## 本地运行

```sh
npm install
npm run dev
```

打开 http://localhost:5173。手机与电脑在同一局域网时，打开 `http://电脑的局域网IP:5173`。字体、模型和音效均在本地提供，不依赖外部资源服务。

电脑使用 WASD／方向键移动、空格投放高爆航弹、P 暂停；手机按住战场拖动，点击右下角按钮投弹。机库和战斗始终适应当前窗口，不产生页面滚动。

## Blender 模型

可编辑源文件：[sky-strike-ww2.blend](assets/blender/sky-strike-ww2.blend)。模型生成与导出脚本位于 [scripts/blender/build_models.py](scripts/blender/build_models.py)。

```sh
npm run models:build
```

macOS 默认使用已安装的 Blender；其他环境从 PATH 查找 `blender`，也可用 `BLENDER_PATH` 指定路径。命令会重新生成模型源文件和游戏 GLB。坐标、螺旋桨节点、模型清单和手工修改流程见 [模型文档](dcos/feature/models.md)。正常开发或构建直接使用已生成的模型，无须每次启动 Blender。

## 验证与发布

```sh
npm run typecheck  # 严格检查应用、脚本、配置与测试的 TypeScript 类型
npm test          # 战斗逻辑、完整通关模拟与 Blender 导出模型验证
npm run test:e2e  # 电脑操作、手机触摸、模型加载和 11 种窗口尺寸
npm run build     # 类型检查后构建到 dist/
npm run preview   # 预览构建结果
```

浏览器测试在 macOS 上优先使用 Google Chrome；其他环境可运行 `npx playwright install chromium`。将 `dist/` 部署到静态网站服务即可游玩。

部署到 Cloudflare Workers：

```sh
npx wrangler login
npm run deploy:check
npm run deploy
```

无需数据库或运行时环境变量。部署命令会先构建，再发布 `dist/` 中的资源。配置、授权方式与验证步骤见 [部署文档](dcos/feature/deployment.md)。

## 产品文档

- [游戏玩法](dcos/feature/gameplay.md)：战机、波次、首领、随机改装与计分。
- [功能清单](dcos/feature/features.md)：界面、操作、暂停、记录与窗口适配。
- [产品特点与画风](dcos/feature/characteristics.md)：二战航空氛围、材质、场景与界面。
- [Blender 模型流程](dcos/feature/models.md)：源文件、生成、导出与运行时约定。

## 代码结构

- `game/engine.ts`：独立于渲染的战斗与成长逻辑。
- `game/types.ts`：状态、输入、战机、敌机、武器和事件类型。
- `game/render.ts`：Three.js 顶视战场、投影、压翼、螺旋桨与实例化特效。
- `game/models.ts`：本地 GLB 载入、共享资源与模型实例。
- `game/main.ts`：界面、输入、本地存储和游戏循环。
- `game/audio.ts`：Web Audio 合成音效。
- `game/style.css`、`game/layout.css`：二战复古组件外观与窗口适配。
- `game/public/assets/models/`：Blender 导出模型及生成清单。
- `assets/blender/`：可编辑 Blender 模型库。
