# 二战历史舰库

收录23个国家／战时海军的72艘代表舰。名单经用户授权按主要海军与经典舰型筛选，是有明确范围的首批舰库，不宣称穷尽所有参战国或所有军舰。中国舰艇采用1937年抗战时的外观，其他舰艇采用1939—1945年的战时外观。

## 历史与画风

- 依据下表史料提炼主炮的数量、联装形式、前后布置、烟囱数量、舰桥轮廓、舰岛左右位置及直通飞行甲板。年份标明本次选用的外观时期；不使用战后导弹改装或斜角甲板。
- 同级舰保留共同结构，包括衣阿华／密苏里、大和／武藏、俾斯麦／提尔皮茨、利托里奥／罗马。不同舰级依靠结构区分，不把换色当作新舰级。
- 航母烟囱与舰岛同侧整合（赤城等右舷下弯烟道独立保留）；贝尔法斯特与悉尼的弹射器位于舰中部。
- 模型为低多边形像素化演绎，甲板宽度、炮管、桥楼和停机适度夸张。细小防空炮和涂装有简化，不宣称逐铆钉、逐年份的精密复原。战场横向放宽，使舰体、部件标记和原有单位碰撞范围保持可读；图鉴使用原始建模比例。
- 航空弹射器按舰级布置：俾斯麦级双向横向轨道位于舰中部，英德及部分巡洋舰保留中部航空区，意大利扎拉保留舰艏轨道，美日后甲板航空区按原型区别。厌战采用1942年、阿尔及利亚保留1939年、澳大利亚II采用1943年，避免混入其后拆除弹射器的状态。
- 主战役仍是架空中队与演习编队，各国原型可混合使用；舰库不将这种编队或敌我关系描述为真实历史战役。红／玫红敌弹、青蓝／绿色／紫色补给继续优先识别。

## 选择与运行

手册 → 舰库，按国家筛选并前后翻页。每页显示一艘实际3D模型、国别、参考年份、舰种、结构特征和史料链接。点击“使用本舰”将其用于对应游戏单位；飞行中更换时明确标为“下次出击使用”。选择保存在本机，出击时锁定，沉没残骸沿用该舰的模型。

历史模型按查看／选用加载本地GLB，启动阶段只加载基础26项与本机已选舰。加载期间隐藏上一艘预览，失败可重试；快速翻页与切换栏目不会被较早返回的请求覆盖。

装甲、伤害、冷却、评分、波次、碰撞算法与碰撞半径沿用原规则。为使赤城／飞龙左舷舰岛等结构与攻击目标一致，可拆部件的位置由模型定义映射到战场。岸防设施与飞机保持既有规则。

可复现定义：[naval-history.ts](../../game/naval-history.ts)；Blender输入：[historical-fleet.json](../../assets/blender/historical-fleet.json)。生成命令见[模型流程](models.md)。

## 收录与来源

表中的链接用于对应舰级的布置、尺寸及战时改装参考；同级舰共用相应舰级史料。模型不依赖这些外部网页加载。

| 海军 | 舰名 | 年份 | 舰种 | 识别特征与史料 |
| --- | --- | --- | --- | --- |
| 美国 | 衣阿华 | 1944 | 战列舰 | [修长舰艏 · 三座三联主炮 · 双烟囱](https://www.navypedia.org/ships/usa/us_bb_iowa.htm) |
| 美国 | 南达科他 | 1942 | 战列舰 | [紧凑宽舰体 · 三联主炮 · 单烟囱](https://www.navypedia.org/ships/usa/us_bb_sdakota.htm) |
| 美国 | 亚利桑那 | 1941 | 战列舰 | [四座三联主炮 · 三脚桅 · 单烟囱](https://www.navypedia.org/ships/usa/us_bb_pennsylvania.htm) |
| 美国 | 企业 CV-6 | 1942 | 航空母舰 | [直通木甲板 · 右舷舰岛 · 三部升降机](https://www.navypedia.org/ships/usa/us_cv_yorktown.htm) |
| 美国 | 埃塞克斯 | 1944 | 航空母舰 | [直通甲板 · 左舷舷侧升降机 · 大舰岛](https://www.navypedia.org/ships/usa/us_cv_essex.htm) |
| 美国 | 弗莱彻 | 1942 | 驱逐舰 | [五座单装炮 · 双烟囱 · 两组鱼雷管](https://www.navypedia.org/ships/usa/us_dd_fletcher.htm) |
| 美国 | 克利夫兰 | 1943 | 轻巡洋舰 | [四座三联炮 · 双烟囱 · 舰艉弹射器](https://www.navypedia.org/ships/usa/us_cr_cleveland.htm) |
| 美国 | 布鲁克林 | 1942 | 轻巡洋舰 | [前三后二共五座三联炮 · 双烟囱](https://www.navypedia.org/ships/usa/us_cr_brooklyn.htm) |
| 美国 | PT-109 | 1943 | 鱼雷艇 | [低矮驾驶舱 · 四根鱼雷管 · 艉部机炮](https://www.navypedia.org/ships/usa/us_pt_pt103.htm) |
| 美国 | 约翰·布朗 | 1944 | 武装运输船 | [自由轮 · 中部驾驶台 · 五货舱与吊杆](https://www.ssjohnwbrown.org/history) |
| 美国 | 密苏里 | 1945 | 战列舰 | [衣阿华级 · 三座三联406毫米炮 · 双烟囱](https://www.navypedia.org/ships/usa/us_bb_iowa.htm) |
| 美国 | 巴尔的摩 | 1944 | 重巡洋舰 | [三座三联203毫米炮 · 双烟囱 · 艉部机库](https://www.navypedia.org/ships/usa/us_cr_baltimore.htm) |
| 英国 | 厌战 | 1942 | 战列舰 | [四座双联主炮 · 重建塔桥 · 单烟囱](https://www.navypedia.org/ships/uk/brit_bb1_queen_elizabeth.htm) |
| 英国 | 乔治五世 | 1941 | 战列舰 | [前四联加双联、后四联 · 双烟囱](https://www.navypedia.org/ships/uk/brit_bb1_king_george_v.htm) |
| 英国 | 胡德 | 1941 | 战列巡洋舰 | [长舰体 · 四座双联炮 · 分隔双烟囱](https://www.navypedia.org/ships/uk/brit_bb1_hood.htm) |
| 英国 | 罗德尼 | 1941 | 战列舰 | [三座三联炮全部前置 · 后置塔桥](https://www.navypedia.org/ships/uk/brit_bb1_nelson.htm) |
| 英国 | 皇家方舟 | 1941 | 航空母舰 | [圆弧舰艏 · 右舷舰岛 · 三部升降机](https://www.navypedia.org/ships/uk/brit_cv1_ark_royal.htm) |
| 英国 | 光辉 | 1940 | 航空母舰 | [装甲直通甲板 · 两部升降机 · 右舷舰岛](https://www.navypedia.org/ships/uk/brit_cv1_illustrious.htm) |
| 英国 | 哥萨克 | 1939 | 驱逐舰 | [部族级 · 四座双联主炮 · 双烟囱](https://www.navypedia.org/ships/uk/brit_dd_tribal.htm) |
| 英国 | 贝尔法斯特 | 1943 | 轻巡洋舰 | [四座三联152毫米炮 · 双烟囱 · 中部航空区](https://www.navypedia.org/ships/uk/brit_cr_edinburgh.htm) |
| 英国 | 声望 | 1944 | 战列巡洋舰 | [长舰体 · 三座双联381毫米炮 · 双烟囱](https://www.navypedia.org/ships/uk/brit_bb1_renown16.htm) |
| 日本 | 大和 | 1945 | 战列舰 | [三座三联巨炮 · 塔式舰桥 · 后部航空甲板](https://www.navypedia.org/ships/japan/jap_bb_yamato.htm) |
| 日本 | 长门 | 1944 | 战列舰 | [四座双联炮 · 高耸舰桥 · 单烟囱](https://www.navypedia.org/ships/japan/jap_bb_nagato.htm) |
| 日本 | 金刚 | 1944 | 战列舰 | [修长高速舰体 · 四座双联炮 · 双烟囱](https://www.navypedia.org/ships/japan/jap_bb_kongo.htm) |
| 日本 | 赤城 | 1942 | 航空母舰 | [左舷舰岛 · 右舷下弯烟道 · 三部升降机](https://www.navypedia.org/ships/japan/jap_cv_akagi.htm) |
| 日本 | 加贺 | 1942 | 航空母舰 | [宽阔木甲板 · 右舷舰岛 · 下弯烟道](https://www.navypedia.org/ships/japan/jap_cv_kaga.htm) |
| 日本 | 翔鹤 | 1942 | 航空母舰 | [细长甲板 · 小舰岛 · 右舷双烟道](https://www.navypedia.org/ships/japan/jap_cv_shokaku.htm) |
| 日本 | 最上 | 1941 | 重巡洋舰 | [改装后五座双联203毫米炮 · 集中舰桥](https://www.navypedia.org/ships/japan/jap_cr_mogami.htm) |
| 日本 | 吹雪 | 1941 | 驱逐舰 | [前一后二的三座双联炮 · 三组鱼雷管](https://www.navypedia.org/ships/japan/jap_dd_fubuki.htm) |
| 日本 | 飞龙 | 1942 | 航空母舰 | [左舷舰岛 · 右舷双烟道 · 三部升降机](https://www.navypedia.org/ships/japan/jap_cv_hiryu.htm) |
| 日本 | 苍龙 | 1942 | 航空母舰 | [右舷前置小舰岛 · 右舷双烟道](https://www.navypedia.org/ships/japan/jap_cv_soryu.htm) |
| 日本 | 信浓 | 1944 | 航空母舰 | [大和级船体改装 · 装甲甲板 · 大型右舷舰岛](https://www.navypedia.org/ships/japan/jap_cv_shinano.htm) |
| 日本 | 武藏 | 1944 | 战列舰 | [大和级 · 三座三联460毫米炮 · 宽阔航空艉甲板](https://www.navypedia.org/ships/japan/jap_bb_yamato.htm) |
| 德国 | 俾斯麦 | 1941 | 战列舰 | [前后各两座双联主炮 · 单粗烟囱](https://www.navypedia.org/ships/germany/ger_bb_bismarck.htm) |
| 德国 | 沙恩霍斯特 | 1943 | 战列舰 | [三座三联283毫米炮 · 单烟囱 · 飞剪艏](https://www.navypedia.org/ships/germany/ger_bb_scharnhorst.htm) |
| 德国 | 斯佩伯爵 | 1939 | 装甲舰 | [前后两座三联283毫米炮 · 高大塔桥](https://www.navypedia.org/ships/germany/ger_cr_deutschland.htm) |
| 德国 | 欧根亲王 | 1941 | 重巡洋舰 | [四座双联炮 · 单烟囱 · 艉部机库](https://www.navypedia.org/ships/germany/ger_cr_eugen.htm) |
| 德国 | 提尔皮茨 | 1943 | 战列舰 | [俾斯麦级 · 四座双联主炮 · 单粗烟囱](https://www.navypedia.org/ships/germany/ger_bb_bismarck.htm) |
| 意大利 | 利托里奥 | 1942 | 战列舰 | [三座三联381毫米炮 · 双烟囱 · 识别条纹艏](https://www.navypedia.org/ships/italy/it_bb_vittorio_veneto.htm) |
| 意大利 | 朱利奥·凯撒 | 1940 | 战列舰 | [重建舰艏 · 三联与双联混合炮塔 · 双烟囱](https://www.navypedia.org/ships/italy/it_bb_giulio_cesare.htm) |
| 意大利 | 扎拉 | 1941 | 重巡洋舰 | [四座双联203毫米炮 · 双烟囱 · 艏部弹射器](https://www.navypedia.org/ships/italy/it_cr_zara.htm) |
| 意大利 | 西北风 | 1940 | 驱逐舰 | [前后双联炮 · 双烟囱 · 两组三联鱼雷管](https://www.navypedia.org/ships/italy/it_dd_maestrale.htm) |
| 意大利 | 罗马 | 1943 | 战列舰 | [利托里奥级 · 三座三联主炮 · 加长舰艏](https://www.navypedia.org/ships/italy/it_bb_vittorio_veneto.htm) |
| 法国 | 黎塞留 | 1940 | 战列舰 | [两座四联主炮全部前置 · 烟囱与后桅合一](https://www.navypedia.org/ships/france/fr_bb_richelieu.htm) |
| 法国 | 敦刻尔克 | 1940 | 战列舰 | [两座前置四联330毫米炮 · 长后甲板](https://www.navypedia.org/ships/france/fr_bb_dunkerque.htm) |
| 法国 | 阿尔及利亚 | 1939 | 重巡洋舰 | [四座双联炮 · 方形塔桥 · 单烟囱](https://www.navypedia.org/ships/france/fr_cr_algerie.htm) |
| 法国 | 空想 | 1940 | 驱逐舰 | [五座单装炮 · 两根大烟囱 · 三组鱼雷管](https://www.navypedia.org/ships/france/fr_dd_le_fantasque.htm) |
| 苏联 | 马拉 | 1940 | 战列舰 | [四座平甲板三联炮 · 双烟囱 · 前桅塔桥](https://www.navypedia.org/ships/russia/ru_bb_sevastopol.htm) |
| 苏联 | 基洛夫 | 1941 | 轻巡洋舰 | [三座三联180毫米炮 · 双烟囱 · 四脚前桅](https://www.navypedia.org/ships/russia/ru_cr_kirov.htm) |
| 苏联 | 塔什干 | 1942 | 驱逐舰 | [蓝灰舰体 · 三座双联炮 · 双烟囱](https://www.navypedia.org/ships/russia/ru_dd_tashkent.htm) |
| 中国 | 宁海 | 1937 | 轻巡洋舰 | [三座双联140毫米炮 · 双烟囱 · 小型机库](https://www.navypedia.org/ships/china/ch_cr_ning_hai.htm) |
| 中国 | 逸仙 | 1937 | 炮舰 | [艏艉单装大炮 · 低矮上层建筑 · 单烟囱](https://www.navypedia.org/ships/china/ch_of_i_hsien.htm) |
| 荷兰 | 德鲁伊特 | 1942 | 轻巡洋舰 | [三座双联加一座单装炮 · 高塔桥 · 双烟囱](https://www.navypedia.org/ships/netherlands/nl_cr_de_ruyter.htm) |
| 荷兰 | 爪哇 | 1942 | 轻巡洋舰 | [十座单装炮 · 舷侧炮列 · 双烟囱](https://www.navypedia.org/ships/netherlands/nl_cr_java.htm) |
| 荷兰 | 科特纳尔 | 1942 | 驱逐舰 | [四座单装炮 · 双烟囱 · 两组鱼雷管](https://www.navypedia.org/ships/netherlands/nl_dd_van_ghent.htm) |
| 波兰 | 闪电 | 1939 | 驱逐舰 | [七门120毫米炮 · 前单装与双联混合 · 双烟囱](https://www.navypedia.org/ships/poland/pl_dd_grom.htm) |
| 波兰 | 雷电 | 1941 | 驱逐舰 | [三座双联主炮 · 单烟囱 · 五联鱼雷管](https://www.navypedia.org/ships/poland/pl_dd_piorun.htm) |
| 加拿大 | 海达人 | 1943 | 驱逐舰 | [部族级 · 三座120毫米双联主炮 · 双烟囱](https://www.navypedia.org/ships/canada/can_dd_iroquois.htm) |
| 加拿大 | 萨克维尔 | 1942 | 护卫舰 | [花级护航舰 · 艏部单装炮 · 艉部深弹架](https://www.navypedia.org/ships/canada/can_es_flower.htm) |
| 澳大利亚 | 悉尼 II | 1941 | 轻巡洋舰 | [四座双联炮 · 分隔双烟囱 · 中部弹射器](https://www.navypedia.org/ships/australia/aus_cr_sydney.htm) |
| 澳大利亚 | 澳大利亚 II | 1943 | 重巡洋舰 | [郡级 · 四座双联203毫米炮 · 三烟囱](https://www.navypedia.org/ships/australia/aus_cv_australia.htm) |
| 新西兰 | 阿基里斯 | 1942 | 轻巡洋舰 | [利安德级 · 四座双联炮 · 单粗烟囱](https://www.navypedia.org/ships/new_zealand/nz_cr_achilles.htm) |
| 挪威 | 斯托尔德 | 1943 | 驱逐舰 | [四座单装炮 · 单烟囱 · 两组四联鱼雷管](https://www.navypedia.org/ships/norway/no_dd_stord.htm) |
| 希腊 | 阿韦罗夫 | 1941 | 装甲巡洋舰 | [艏艉双联234毫米炮 · 四座舷侧双联炮 · 三烟囱](https://www.navypedia.org/ships/greece/gr_cr_averof.htm) |
| 南斯拉夫 | 杜布罗夫尼克 | 1941 | 驱逐舰 | [四座单装140毫米炮 · 双烟囱 · 长艏楼](https://www.navypedia.org/ships/yugoslavia/yu_dd_dubrovnik.htm) |
| 芬兰 | 伊尔马里宁 | 1941 | 岸防舰 | [短宽舰体 · 艏艉双联254毫米炮 · 高观测桅](https://www.navypedia.org/ships/finland/fi_bb_vainamoinen.htm) |
| 罗马尼亚 | 费迪南德国王 | 1941 | 驱逐舰 | [五座单装炮 · 双烟囱 · 两组三联鱼雷管](https://www.navypedia.org/ships/romania/ro_dd_regele_ferdinand.htm) |
| 泰国 | 吞武里 | 1941 | 岸防舰 | [短宽舰体 · 艏艉双联203毫米炮 · 单烟囱](https://www.navypedia.org/ships/thailand/th_bb_sri_ayuthia.htm) |
| 巴西 | 巴伊亚 | 1944 | 轻巡洋舰 | [十座单装炮 · 舷侧炮列 · 改装后三烟囱](https://www.navypedia.org/ships/brazil/br_cr_bahia.htm) |
| 英属印度 | 孟加拉 | 1942 | 扫雷护航舰 | [巴瑟斯特级 · 艏部单装炮 · 扫雷深弹艉甲板](https://www.navypedia.org/ships/india/in_ms_punjab.htm) |
| 南非 | 纳塔尔 | 1945 | 护卫舰 | [湖级护卫舰 · 艏部单装炮 · 艉部反潜装具](https://www.navypedia.org/ships/south_africa/saf_es_good_hope.htm) |
| 丹麦 | 尼尔斯·尤尔 | 1943 | 岸防舰 | [十座单装150毫米炮 · 高塔桅 · 单烟囱](https://www.navypedia.org/ships/denmark/dk_bb_niels_iuel.htm) |

## 补充史料

- [美国海军历史与遗产司令部：企业CV-6](https://www.history.navy.mil/content/history/nhhc/browse-by-topic/ships/aircraft-carriers/big-e.html)、[弗莱彻DD-445](https://www.history.navy.mil/research/histories/ship-histories/danfs/f/fletcher.html)。
- [NOAA：赤城残骸与左舷舰岛](https://oceanexplorer.noaa.gov/photogrammetry/akagi/)。
- [加拿大海军：海达人](https://www.canada.ca/en/navy/services/history/ships-histories/haida.html)、[萨克维尔](https://www.canada.ca/en/navy/services/history/ships-histories/sackville.html)。
- [希腊海军阿韦罗夫博物馆：主炮与舷侧炮](https://averof.hellenicnavy.gr/en/battleship-g-averof/history/launching-and-extra-features/)。
- [波兰海军博物馆：闪电](https://muzeummw.pl/en/orp-blyskawica-a-real-war-veteran/)。
- [新西兰政府：二战海军](https://nzhistory.govt.nz/war/royal-new-zealand-navy/second-world-war)。
- [荷兰国家档案馆：爪哇海海战舰艇](https://www.nationaalarchief.nl/beleven/nieuws/1942-engelandvaarders-in-de-slag-in-de-javazee)。

- [澳大利亚战争纪念馆：悉尼1940年舰中部飞机处理区与弹射器照片](https://www.awm.gov.au/collection/C261159)。
- [美国海军历史与遗产司令部：企业号1942年舰岛与烟囱照片](https://www.history.navy.mil/our-collections/photography/numerical-list-of-images/nhhc-series/nh-series/NH-83000/NH-83990.html)。

## 验证约定

模型回归核对全舰库身份、原点、主炮联装形式、全72艘主炮／副炮在图鉴与战斗姿态下避开其他炮座、舰桥与烟囱、航母舷侧烟囱、中部弹射器、可拆部件坐标、水线、停机轮廓和资源预算；浏览器检查全部舰船预览、国家筛选、异步请求顺序、失败重试、选择存储、实际战斗及手机可视安全区域。战场像素测试继续覆盖船体、残骸上方的敌弹与补给。
