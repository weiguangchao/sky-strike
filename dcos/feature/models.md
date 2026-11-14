# Blender 模型流程

## 资源位置

- 可编辑模型库：[sky-strike-ww2.blend](../../assets/blender/sky-strike-ww2.blend)。各资产保存在独立集合中，工作文件按网格排列，方便检查与修改。
- 建模与导出脚本：[build_models.py](../../scripts/blender/build_models.py)。使用 Blender Python API 创建几何体、材质、中队标记与螺旋桨节点。
- TypeScript 执行入口：[models.ts](../../scripts/models.ts)。负责寻找并启动 Blender。
- 游戏模型：`game/public/assets/models/*.glb`。导出清单 `manifest.json` 记录生成器版本、文件名、面数和字节数。
- 运行时加载器：`game/models.ts`，渲染入口：`game/render.ts`。

## 模型库

| 模型 ID | 内容 |
| --- | --- |
| falcon | 游隼：椭圆主翼、单发螺旋桨、橄榄迷彩 |
| swift | 雨燕：轻型单发海军战斗机、蓝灰涂装 |
| turtle | 玄武：双发动机、双尾撑、重型机体 |
| scout | 敌方侦察战斗机 |
| dart | 敌方俯冲突击机，带固定起落架整流罩 |
| gunship | 敌方双发重型飞机 |
| boss | 四发轰炸机首领，含炮塔和玻璃机首 |
| boss-final | 六发轰炸机首领 |
| carrier | 木质飞行甲板、阻拦索、舰桥、雷达桅杆与防空平台的航母 |
| island | 分层海岸、沙滩、植被、小路和前线营房的海岛 |
| pickup-xp | 青蓝方形补给箱，中心箭纹与明亮外框 |
| pickup-health | 绿色八角维修包，中心十字 |
| pickup-bomb | 紫色菱形航弹箱，中心航弹符号 |
| enemy-round | 红色圆弹，深色轮廓与亮色细边 |
| enemy-aimed | 玫红尖弹，深色轮廓与亮色细边 |

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

## 坐标、动画与性能

- Blender 使用 X 为翼展、+Y 为机首、+Z 为上方；glTF 转换为 X 翼展、−Z 机首、+Y 朝上。
- 导出各模型时原点位于中心。工作文件中用于排列模型的位置不写入游戏导出。
- 螺旋桨父节点命名为 `propeller_00` 等；运行时绕局部 Z 轴旋转，保留真正的 3D 叶片。
- 静态几何合并，保留共享材质；模型实例共享几何与材质，敌机使用对象池。
- 合并静态网格后在 Blender 应用旋转与缩放，使导出节点的变换与几何尺寸一致。
- 子弹、补给、火焰与烟尘采用实例化绘制；移动设备的像素比上限为 1.5。
- 顶视正交投影与 480 × 760 逻辑坐标一致，视觉上的高度与倾斜不改变受击判定。
- 模型完全本地化，GLB 内嵌几何与材质，不从外部网址加载模型或纹理。
- 道具与敌弹的 `signal_*` 材质在 Blender 中使用纯颜色输出节点，导出为 `KHR_materials_unlit`；运行时关闭 tone mapping，避免曝光、日光和电影色调映射把辨识色冲淡。
- 道具与敌弹直接使用这些 GLB 的几何与符号，按材质拆成共享实例批次，不为每个掉落物创建独立的模型绘制调用。
- 实例矩阵每帧只上传当前使用的前缀，空批次不上传，避免低端手机反复传输整个预分配缓冲。

## 验证

`npm test` 检查 GLB 格式、几何数据、螺旋桨节点、导出原点、资源体积和识别色；`npm run test:e2e` 检查浏览器中模型载入、WebGL、完整流程，以及实际像素中的道具和敌弹颜色。
