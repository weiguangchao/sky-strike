# 苍穹突袭 · 功能文档

苍穹突袭（Sky Strike）是一款可在电脑和手机浏览器中游玩的竖版肉鸽弹幕射击游戏，采用二战复古风格。项目使用 TypeScript 开发，Blender 制作模型，Three.js 渲染 3D 战场。

| 文档 | 内容 | 实现位置 |
| --- | --- | --- |
| [游戏玩法](gameplay.md) | 单局循环、战机、关卡、战斗、强化、计分 | `game/engine.ts` |
| [功能清单](features.md) | 机库、操作、暂停、界面、存储、声音 | `game/main.ts`、`game/index.html`、`game/audio.ts` |
| [产品特点与画风](characteristics.md) | 二战风格、3D 战场、色板、窗口适配约束 | `game/render.ts`、`game/style.css`、`game/layout.css` |
| [Blender 模型流程](models.md) | 模型源文件、生成、导出、节点和坐标 | `assets/blender/`、`scripts/blender/`、`game/models.ts` |
| [Cloudflare Workers 部署](deployment.md) | 账号授权、构建、发布与资源验证 | `wrangler.jsonc`、`game/public/_headers` |

以上文档记录当前游戏行为和需要持续遵循的产品约束。战斗数值以 `game/engine.ts` 的实现为准；调整时同步修改文档。
