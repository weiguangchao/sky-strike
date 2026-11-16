# 苍穹突袭 · Sky Strike

支持电脑与手机浏览器的二战复古竖版肉鸽空战游戏。使用 **TypeScript + Vite + Phaser 4.2.1** 开发，飞机、首领、航母与海岛在 **Blender** 中建模，离线生成分层 PNG 精灵，浏览器只运行二维场景。

在线试玩：[sky-strike.tabuxiangma.workers.dev](https://sky-strike.tabuxiangma.workers.dev)。

完整产品说明见 [dcos/feature/](dcos/feature/README.md)，开发约定见 [AGENTS.md](AGENTS.md)。

## 本地运行

```sh
npm install
npm run dev
```

打开 http://localhost:5173。手机与电脑在同一局域网时，打开 `http://电脑的局域网IP:5173`。字体、精灵和音效均在本地提供，不依赖外部资源服务。

电脑使用 WASD／方向键移动、空格投放高爆航弹、P 暂停；手机按住战场拖动，点击右下角按钮投弹。机库和战斗始终适应当前窗口，不产生页面滚动。

## Blender 模型

可编辑源文件：[sky-strike-ww2.blend](assets/blender/sky-strike-ww2.blend)。模型生成与导出脚本位于 [scripts/blender/build_models.py](scripts/blender/build_models.py)。

```sh
npm run models:build
npm run sprites:build
```

macOS 默认使用已安装的 Blender；其他环境从 PATH 查找 `blender`，也可用 `BLENDER_PATH` 指定路径。命令会重新生成模型源文件和游戏 GLB。坐标、螺旋桨节点、模型清单和手工修改流程见 [模型文档](dcos/feature/models.md)。`npm run sprites:build` 使用离线栅格器生成顶视、预览、完好部件与残骸图层，不需要启动 Blender。正常开发或构建直接使用已提交的二维精灵；Three.js 仅作为离线工具和源模型测试的开发依赖。

手册“历史图鉴”统一收录原148条舰库资料与首批12型历史飞机、8级潜艇，覆盖一战至现代；舰艇可选作出击外观，飞机与潜艇用于资料浏览，全球服役名录仍在补录。独立源库为 [century-archive.blend](assets/blender/century-archive.blend)，可用 `npm run models:build:archive` 重建。每个模型必须取得两名 GPT Sol 对同一版本分别 ≥9.8 的真实评分才算通过；`npm run models:audit -- --require-approved` 校验全部条目。收录边界、史料与评审规则见 [百年舰机](dcos/feature/century-archive.md)。

## 验证与发布

```sh
npm run typecheck  # 严格检查应用、脚本、配置与测试的 TypeScript 类型
npm test          # 战斗逻辑、完整通关模拟与 Blender 导出模型验证
npm run test:e2e  # 电脑操作、手机触摸、精灵加载和 11 种窗口尺寸
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
- `game/runtime.ts`：Phaser 场景、帧循环、键盘／触摸输入与生命周期。
- `game/render.ts`：Phaser 二维战场、分层精灵、对象池、粒子与补间特效。
- `game/models.ts`：离线模型与二维资源共用的资产 ID。
- `game/sprites.ts`：Phaser 精灵加载、缓存与二维预览。
- `scripts/sprites.ts`：从原始 GLB 生成分层精灵与带 SHA-256 的清单。
- `game/main.ts`：界面、本地存储和战斗事件协调。
- `game/audio.ts`：Web Audio 合成音效。
- `game/style.css`、`game/layout.css`：二战复古组件外观与窗口适配。
- `game/public/assets/sprites/`：实际发布的 PNG 精灵；构建时验证来源与体积。
- `game/public/assets/models/`：离线 Blender 导出模型；生产构建不包含此目录。
- `assets/blender/`：可编辑 Blender 模型库。
