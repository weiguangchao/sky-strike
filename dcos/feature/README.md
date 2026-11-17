# 苍穹突袭 · 功能文档

苍穹突袭（Sky Strike）是一款可在电脑和手机浏览器中游玩的竖版肉鸽弹幕射击游戏，采用二战复古像素风格，包含空战、舰队突袭、运输船护航与战列舰／航母首领。项目使用 TypeScript 开发，Blender 制作模型，Three.js 以低分辨率渲染 3D 战场并进行像素放大。

| 文档 | 内容 | 实现位置 |
| --- | --- | --- |
| [游戏玩法](gameplay.md) | 单局循环、舰机、十波空海战役、部件破坏、强化、计分 | `game/engine.ts`、`game/campaign.ts` |
| [功能清单](features.md) | 机库、操作、暂停、界面、存储、声音 | `game/main.ts`、`game/viewport.ts`、`game/index.html`、`game/audio.ts` |
| [产品特点与画风](characteristics.md) | 二战风格、3D 战场、色板、窗口适配约束 | `game/render.ts`、`game/style.css`、`game/layout.css` |
| [品牌 Logo](logo.md) | 像素螺旋桨飞机、字标、图标与使用规范 | `game/public/assets/brand/`、`game/icon.svg` |
| [Blender 模型流程](models.md) | 模型源文件、生成、导出、节点和坐标 | `assets/blender/`、`scripts/blender/`、`game/models.ts` |
| [历史舰库](historical-fleet.md) | 历史图鉴中的23个海军、148个条目与美国82个舰级分组、史料、筛选与外观选择 | `game/naval-history.ts`、`game/main.ts` |
| [美国舰级库](us-fleet.md) | 二战至现代82个舰级／亚级／改装分组、范围及来源 | `game/us-fleet.ts` |
| [百年舰机与双 Sol 验收](century-archive.md) | 统一历史图鉴、全球服役目录目标、首批12型飞机／8级潜艇、逐模型双9.8门槛 | `game/historical-archive.ts`、`game/model-review.ts` |
| [全球服役目录补录](inventory/README.md) | 后续型号的服役证据、改型边界及旧舰库身份待核实清单 | `dcos/feature/inventory/` |
| [Cloudflare Workers 部署](deployment.md) | 账号授权、构建、发布与资源验证 | `wrangler.jsonc`、`game/public/_headers` |
| [TypeScript 架构](typescript-architecture.md) | 领域类型、数据边界与自动检查 | `game/types.ts`、`game/storage.ts`、`scripts/type-discipline.ts` |

以上文档记录当前游戏行为和需要持续遵循的产品约束。战斗数值以 `game/engine.ts` 的实现为准；调整时同步修改文档。
