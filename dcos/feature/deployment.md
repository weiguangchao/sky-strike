# Cloudflare Workers 部署

## 当前发布

- 在线地址：[sky-strike.tabuxiangma.workers.dev](https://sky-strike.tabuxiangma.workers.dev)。
- Worker：`sky-strike`。
- 首次发布时间：2026-11-14。
- 首次版本：`0fbe7740-a3b1-4488-8611-1e70ee1c3dff`。
- 2026-11-14版本：`9d944818-bf5a-45b6-8b5c-713deef7b2d3`。后续发布的版本ID以Wrangler返回和对应PR发布记录为准。
- 本次更新包含十波空海战役、23个海军的148个舰库条目、168项本地GLB、手机沉浸布局，以及本地中英文像素字体。保留鲜明敌弹／补给识别和渐隐HUD／横幅。
- 2026-11-14发布已核验入口与当时22项资源SHA-256；本次发布重新核验当前构建的全部公开文件（含字体、模型和授权文件）、真实浏览器出击及缺失资源／源码404。

## 结构与环境

游戏运行在浏览器，使用 Cloudflare Workers Static Assets 托管 `dist/` 中的网页、脚本、字体与 GLB 模型。

- 配置文件：[wrangler.jsonc](../../wrangler.jsonc)，Worker 名称为 `sky-strike`。
- 部署时由 Wrangler 执行 `npm run build`，先完成 TypeScript 类型检查，再生成生产资源。
- 不需要数据库、KV、R2 或游戏运行时环境变量；最高分和飞行偏好继续保存在玩家浏览器。
- Node.js 与 npm 只用于开发、构建和发布；线上不运行 Node 开发服务器，也不需要 Blender。
- Blender 源文件、建模脚本和 TypeScript 源文件不作为公开静态资源上传。

## 账号授权

部署需要 Cloudflare 账号及 Workers 发布权限。可使用 Wrangler 官方 OAuth 登录：

```sh
npx wrangler login
npx wrangler whoami
```

自动化环境可以使用 `CLOUDFLARE_API_TOKEN`。`wrangler.jsonc` 已通过 `account_id` 指定本项目的部署账号，该标识不属于凭据；如需部署到其他账号，应明确修改目标账号。Token 仅用于部署，不写入源码、构建产物或公开配置。

## 检查与发布

```sh
npm ci
npm run deploy:check  # 构建并执行 Wrangler dry-run，不发布
npm run worker:dev    # 在 http://localhost:8787 使用本地 Workers 运行时验证
npm run deploy       # 构建并发布到 Cloudflare Workers
```

成功后以 Wrangler 返回的 `workers.dev` URL 为准。后续更新继续执行 `npm run deploy`，更新同一个 Worker。自定义域名需要另外绑定，不是当前游戏运行的前提。

## 资源行为与验证

- `game/public/_headers` 对入口页面使用重新验证策略，对未带哈希的模型文件要求缓存重新验证，避免更新后长期加载旧模型。
- 找不到的资源返回 404，不把缺失的 GLB 或 JavaScript 请求错误地回退成 HTML。
- 使用生产构建进行浏览器检查时，可设置 `PLAYWRIGHT_BASE_URL`，复用不依赖 Vite 开发模块的模型加载检查：

```sh
PLAYWRIGHT_BASE_URL=http://localhost:8787 npm run test:e2e -- --grep 'Blender models load locally'
```

发布后检查入口、构建脚本与模型的 HTTP 状态，并用部署 URL 执行同样的浏览器检查。

Cloudflare 机制参见 [Workers Static Assets 文档](https://developers.cloudflare.com/workers/static-assets/)。
