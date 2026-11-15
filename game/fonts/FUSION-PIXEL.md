# Fusion Pixel 中文像素字体

- 上游：<https://github.com/TakWolf/fusion-pixel-font>
- 固定版本：2026.11.10；原始发布包：`fusion-pixel-font-12px-proportional-otf.woff2-v2026.11.10.zip`。
- 本地文件：`fusion-pixel-12px.woff2`，原始 `fusion-pixel-12px-proportional-zh_hans.otf.woff2`，未修改字体内容、未裁剪字形。
- SHA-256：`4f0ccc75b874c97b79d0cbfa5babcd51d1fdc7da5be4ddc7f2895ccae3bc301d`。
- 体积：694824字节。比例模式的简体字形覆盖中文、拉丁字母、数字和标点；正文、按钮、手册与舰名使用此字体。英文品牌与仪表使用原VT323，并以此字体回退中日韩字形。
- CSS家族别名：`Flight Pixel`，不改变原字体内部名称。保留上游原始OFL与字形来源授权于 `game/public/licenses/fusion-pixel/`，生产构建复制至 `/licenses/fusion-pixel/`，与网站一同分发。
- 运行时仅请求同站字体，随入口样式发现并加载此WOFF2，不额外预载，避免WebKit因CORS模式不同而重复下载。`font-display: swap` 在下载失败时回退系统字体，保留可读操作。关闭模拟粗体；用字号和颜色建立层级。中文主要标题和正常主按钮优先使用12像素网格的整倍数字号，小屏仍优先保证可读字号和完整按钮。

更新时从上游固定版本下载原始简体WOFF2，保留其全部授权文件并更新版本、哈希和体积；不要静默改用外部字体服务。
