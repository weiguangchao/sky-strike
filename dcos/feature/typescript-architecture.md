# TypeScript 架构

阅读或修改 `.ts`／`.tsx` 时使用 `typescript-best-practices` skill，先应用类型系统纪律与边界纪律。重构维持战斗数值、碰撞规则、模型资源与视觉规范。

- `game/types.ts` 定义事件、弹药、补给与舰船的可辨识联合：航弹必需落点和计时，经验补给必需数量，首领只允许战列舰／航母。实体 ID 由验证过的品牌类型表示。
- `game/engine.ts` 只接收领域类型，事件作为单个完整对象发送；战斗与每帧渲染的热点保留位置参数。历史资料、音效、公告、评审与存储等非热点接口使用对象参数。
- `game/storage.ts` 负责读取 `unknown`、解析版本化存档与偏好，兼容旧值。界面只消费解析结果。
- `game/dom.ts` 在 DOM 边界验证元素的实际类；`game/model-metadata.ts` 在模型边界验证 extras 中的角色和有限正数几何数据。
- `game/model-review.ts` 在入口解析评审账本与 SHA-256 版本。已验证的版本为品牌类型，评审逻辑只接收已解析的数据；通过状态必需两个分数。标签使用穷尽 `switch`。
- `game/runtime.ts` 通过加载／就绪联合持有 Phaser 场景资源，全部基础精灵下载完成后才启动战斗帧回调。`game/render.ts` 管理完整构造的二维显示层与精灵池；`game/sprites.ts` 复用 Phaser Loader 和纹理缓存，不依赖非空或延迟赋值断言。
- 飞机／潜艇的资料键来自各自外形配置，图鉴条目保留模型 ID 类型。测试中的 JSON／DOM／几何查找在边界处验证，浏览器直接导入有类型的游戏模块。

`npm run typecheck` 先运行 `npm run lint`，再运行 TypeScript 严格检查，包括数组索引、精确可选字段、返回路径、分支贯穿和未使用声明。语法检查使用项目自带的 TypeScript 7 AST，拒绝 `any`、类型断言（保留 `as const`）、非空断言和延迟赋值断言；不增加第二套编译器或校验库。

`tests/type-contracts.ts` 验证非法领域状态必须编译失败；`tests/boundaries.test.ts` 覆盖错误存储、旧版存档、无效模型数据与品牌值验证。修改交互或渲染路径仍运行完整浏览器回归，包括真实像素识别检查。
