# Blender 模型流程

## 资源位置

百年舰机新增独立的 `century-archive.blend`、`century-archive.json`、`scripts/blender/build_archive.py` 和20个 `archive-*.glb`；原有168个战斗／历史GLB保持独立。`npm run models:build` 重建两库，`npm run models:build:archive` 只重建新增库。新资源和逐模型双 GPT Sol ≥9.8 验收详见[百年舰机](century-archive.md)；当前全球服役目录尚未穷尽。

新增型号的独立截面与轮廓在 `game/archive-profiles.ts`，随条目一起序列化给 Blender；翼根接合、中央翼段、框式座舱、现代圆钝艇艏、旧艇艉舵和围壳潜舵均使用实际实体几何。模型测试读取导出的GLB验证结构接合，不能仅以元数据计数代替外形检查。

- 可编辑模型库：[sky-strike-ww2.blend](../../assets/blender/sky-strike-ww2.blend)。各资产保存在独立集合中，工作文件按网格排列，方便检查与修改。
- 建模与导出脚本：[build_models.py](../../scripts/blender/build_models.py)。使用 Blender Python API 创建几何体、材质、中队标记与螺旋桨节点。
- TypeScript 执行入口：[models.ts](../../scripts/models.ts)。负责寻找并启动 Blender。
- 历史舰艇定义：[naval-history.ts](../../game/naval-history.ts)，含148个条目、史料与布局。执行入口先生成 [historical-fleet.json](../../assets/blender/historical-fleet.json)，Blender 与战场部件映射使用同一组数据。
- 游戏模型：`game/public/assets/models/*.glb`。导出清单 `manifest.json` 记录生成器版本、文件名、面数和字节数。
- 二维资源：`game/public/assets/sprites/*.png`；清单：`game/sprite-manifest.json`；运行时加载：`game/sprites.ts`。

## 模型库

| 模型 ID | 内容 |
| --- | --- |
| falcon | 游隼：椭圆主翼、单发螺旋桨、橄榄迷彩 |
| swift | 雨燕：轻型单发海军战斗机、蓝灰涂装 |
| turtle | 玄武：双发动机、双尾撑、重型机体 |
| scout | 敌方侦察战斗机 |
| dart | 敌方俯冲突击机，带固定起落架整流罩 |
| gunship | 敌方双发重型飞机 |
| boss | 四发重型轰炸机精英，含炮塔和玻璃机首 |
| boss-final | 六发重型轰炸机精英 |
| carrier | 友军企业号CV-6演绎：直通甲板、右舷舰岛，起飞通道与停机分开 |
| island | 分层海岸、沙滩、植被、小路和前线营房的海岛 |
| pickup-xp | 青蓝方形补给箱，中心箭纹与明亮外框 |
| pickup-health | 绿色八角维修包，中心十字 |
| pickup-bomb | 紫色菱形航弹箱，中心航弹符号 |
| enemy-round | 红色圆弹，深色轮廓与亮色细边 |
| enemy-aimed | 玫红尖弹，深色轮廓与亮色细边 |
| interceptor | 宽直翼短机身截击机 |
| diver | 倒海鸥翼、俯冲刹车与固定轮罩 |
| torpedo | 长座舱、腹部鱼雷及尾部弹翼 |
| patrol-boat | 默认PT-109：低矮驾驶舱、四根鱼雷管与艉部机炮 |
| destroyer | 默认弗莱彻：五座单装炮、双烟囱、鱼雷发射器 |
| cruiser | 默认克利夫兰：四座三联主炮、双烟囱、舰艉弹射器 |
| battleship | 铁岳默认采用大和原型：三座三联主炮、塔桥、副炮与航空艉甲板 |
| fleet-carrier | 赤潮默认采用赤城原型：左舷舰岛、右舷下弯烟道、三部升降机与停机 |
| coastal-battery | 沙地、混凝土防空阵地 |
| oil-depot | 港口油罐、管线与地基 |
| transport | 默认约翰·布朗自由轮：五货舱、吊杆与中部驾驶台，友军运行时增加蓝旗 |
| historic-* | 其余142个舰库外观，按需载入；完整名单与来源见[历史舰库](historical-fleet.md) |

战机使用架空中队圆形识别标记与二战时期外形元素，不宣称是特定真实历史型号的精确复刻。

## 重新生成

```sh
npm run models:build
```

macOS 默认使用 `/Applications/Blender.app/Contents/MacOS/Blender`；其他平台从 PATH 寻找 `blender`。也可显式指定：

```sh
BLENDER_PATH=/path/to/blender npm run models:build
```

该命令会从脚本重新生成 `.blend` 与 GLB；手工修改 `.blend` 后，应先把需要保留的修改同步到生成脚本，或单独按相同坐标和文件名导出，再决定是否运行生成命令。

## 二维精灵生成与运行时

```sh
npm run sprites:build
npm run sprites:check
```

`sprites:build` 从已提交的188个本地 GLB 读取几何，使用 TypeScript 离线正交栅格器生成 PNG，不需要 WebGL、浏览器或 Blender 进程。Three.js 只作为离线几何解析和源模型测试的开发依赖，浏览器运行时使用 Phaser 4.2.1。

- `scripts/sprites.ts` 是可复现生成入口。源 GLB、源模型评分与 Blender 文件保持独立；更新源模型后必须重新生成精灵。
- 每项资产含顶视 `top` 与斜向 `preview`；舰船另含 `part:<id>` 完好部件和 `ruin:<id>` 损毁部件。友军航母不参与损毁，不要求残骸。
- 按 `game_part`／`game_ruin` 的祖先节点拆分网格，按高度排序图层。透明精灵裁到实际像素边界，并保留相对于模型原点的锚点与世界尺寸，再以留白间隔打包到每型号一张 PNG，避免将大量透明区域传入 GPU。
- 顶视保持 glTF 的 X 为横向、−Z 为机首；二维图像的 Y 向下。战场使用模型 ID、舰种缩放及 `combat_stretch`，与既有部件目标坐标一致，碰撞和数值不变。
- 图鉴预览使用离线斜向投影，舰船沿横向展开；按实际像素边界适配 192×120，保留12%留白。机库为160×100。预览用 Canvas 2D 绘制同一张已加载 PNG，不额外创建 WebGL 上下文。
- 战场固定240×380帧缓冲，Phaser 根容器以0.5倍呈现480×760逻辑坐标。关闭抗锯齿并采用最近邻采样，CSS像素放大，DPR不改变内部栅格。
- `game/sprite-manifest.json` 记录每项源 GLB、输出 PNG 和生成器的 SHA-256、文件体积、帧边界、锚点、尺寸、舰体横向比例与螺旋桨位置。
- `game/models.ts` 只保留资产ID与映射；`game/sprites.ts` 使用 Phaser Loader 下载本地 PNG，缓存纹理并注册裁剪帧；`game/render.ts` 使用精灵池绘制舰机、部件、残骸、弹药与补给，使用 Phaser 粒子和补间绘制爆炸及冲击波。
- 螺旋桨采用二维闪动叶片，舰船损毁切换局部图层，沉没通过侧倾与透明度表现。减弱动态效果模式关闭装饰晃动和震屏。历史舰船在生成时锁定外观，残骸继续使用相同资产。
- 识别标记保留源 `signal_*` unlit 材质的精确颜色和形状。浏览器不进行灯光或色调映射；敌弹位于烟尘、补给和玩家判定点上方。
- 浏览器只请求 `game/public/assets/sprites/*.png`。原 GLB 保留于仓库供离线生成与几何验证，生产构建移除 `dist/assets/models/`。

## 源模型约定

Blender 保持 X为翼展、+Y为机首、+Z向上；GLB原点位于中心。螺旋桨节点、可拆部件和残骸 extras、炮塔与水线属性继续保留，供离线精灵和源模型验证使用。舰船外形、历史舰炮／烟囱／升降机、飞机截面与翼面等规则继续通过已有GLB几何检查，源文件和建模脚本均保留。

原始GLB的三分之四、顶视、侧视和前视审阅工具保留在 `scripts/archive-views.ts`，仅用于开发环境中的源模型评审；产品入口不引用它。二维视图工具为 `scripts/sprite-views.ts`。

源模型继续保留炮塔起始方向与间距、独立防空炮／舰桥／甲板节点、螺旋桨父节点、归一化水线尺寸和导出中心原点。`naval_lift` 区分各升降机，`naval_launcher` 区分导弹发射器，`naval_class` 保留舰级，肯尼迪 CV-67 的 `funnelCant` 保留实体外倾烟道。

## 验证

`npm run sprites:check` 检查188项精灵与源文件、生成器及PNG指纹一致，所有帧在图集内、像素非空、完好部件具有残骸（友军航母除外）。每PNG小于100KB、基础26项小于600KB、全库小于4MB。

`npm test` 继续检查原始 GLB 格式、实体几何、节点、识别色和源模型体积，并加入精灵完整性检查。`npm run test:e2e` 检查全部舰机二维预览、Phaser版本、无GLB网络请求、按需加载与失败重试、完整战役及真实像素中的敌弹／补给和HUD透视性。

图鉴原有双GPT Sol评分仍针对原始几何资产，不自动迁移为PNG评分。两种实际二维视图由浏览器测试输出到 `test-results/`，供画面检查。
