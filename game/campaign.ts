import type { AirKind, CampaignStage, Chapter, Mission, MissionHistory, ShipKind, WaveInfo } from './types.ts';

export const UNIT_NAMES: Record<AirKind | ShipKind, string> = {
  scout: '轻型战斗机',
  interceptor: '横切截击机',
  diver: '俯冲轰炸机',
  torpedo: '鱼雷攻击机',
  'heavy-bomber': '重型轰炸机',
  gunship: '双发护航机',
  dart: '高速突击机',
  'patrol-boat': '巡逻艇',
  destroyer: '驱逐舰',
  cruiser: '防空巡洋舰',
  battleship: '铁岳',
  'fleet-carrier': '赤潮',
  'coastal-battery': '海岛炮台',
  'oil-depot': '港口油库',
  transport: '敌方运输船',
};
export const WAVES: [WaveInfo, ...WaveInfo[]] = [
  { name: '舰队启航', objective: '从友军航母起飞，拦截前方战斗机。', air: ['scout'], sea: [] },
  { name: '外海警戒', objective: '击退横切截击机与巡逻艇。', air: ['scout', 'interceptor'], sea: ['patrol-boat'] },
  { name: '运输船队', objective: '保护蓝旗运输船，优先拦截鱼雷机与重型轰炸机。', air: ['torpedo', 'gunship'], sea: ['patrol-boat'] },
  { name: '驱逐舰防线', objective: '对准炮位自动投弹，打开舰队防线。', air: ['interceptor', 'diver'], sea: ['destroyer'] },
  { name: '铁岳决战', objective: '压制双舷防空炮，击沉战列舰「铁岳」。', air: [], sea: ['battleship'] },
  { name: '舰队补给', objective: '接收装甲和航弹补给，避开防空火力并打击油库与运输船。', air: ['scout', 'dart'], sea: ['coastal-battery', 'oil-depot', 'transport'] },
  { name: '交错火网', objective: '在巡洋舰与俯冲轰炸机的交错攻击中突围。', air: ['diver', 'gunship'], sea: ['cruiser'] },
  { name: '舰载机群', objective: '拦截鱼雷机，迎战重型轰炸机精英。', air: ['torpedo', 'interceptor'], sea: ['transport', 'patrol-boat'] },
  { name: '最后护卫线', objective: '突破驱逐舰、巡洋舰与岸防阵地。', air: ['diver', 'dart', 'interceptor'], sea: ['destroyer', 'cruiser', 'coastal-battery'] },
  { name: '赤潮终局', objective: '炸毁飞行甲板，击沉航母「赤潮」。', air: [], sea: ['fleet-carrier'] },
];

export const WAVES_PER_MISSION = WAVES.length;
export const WAVE_DURATION = 60;
export const BOSS_TIME_LIMIT = 75;

type Encounters = Partial<Record<number, WaveInfo>>;

/** Each mission replaces five of the shared waves with encounters drawn from its battle. */
function mission(id: string, name: string, history: MissionHistory, encounters: Encounters = {}): Mission {
  return { id, name, history, waves: WAVES.map((wave, index) => encounters[index + 1] ?? wave) };
}

const NHHC = 'https://www.history.navy.mil';

export const CHAPTERS: readonly [Chapter, ...Chapter[]] = [
  {
    name: '第一次世界大战',
    craft: ['falcon', 'swift', 'turtle'],
    missions: [
      mission('dawn-seas', '黑尔戈兰湾海战', {
        year: 1914, date: '1914年8月28日', source: 'https://navymuseum.co.nz/explore/by-themes/world-war-one/battle-of-heligoland-bight/',
        summary: '英国轻巡洋舰与驱逐舰突袭黑尔戈兰岛外的德国巡逻线，贝蒂的战列巡洋舰随后赶到，英方共击沉三艘德国轻巡洋舰。',
        archive: [],
      }, {
        2: { name: '驱逐舰缠斗', objective: '在晨雾中拦截侦察机，击沉巡逻线上的驱逐舰与鱼雷艇。', air: ['scout', 'gunship'], sea: ['patrol-boat', 'destroyer'] },
        4: { name: '轻巡洋舰驰援', objective: '截击赶来增援的轻巡洋舰，避开它的防空火力。', air: ['interceptor', 'scout'], sea: ['cruiser'] },
        7: { name: '战列巡洋舰入场', objective: '趁主力舰赶到前压制巡洋舰与驱逐舰的侧舷火力。', air: ['diver', 'interceptor'], sea: ['cruiser', 'destroyer'] },
        8: { name: '海湾追击', objective: '拦截鱼雷机，迎战重型轰炸机精英，击沉撤退的运输船。', air: ['torpedo', 'scout'], sea: ['transport', 'destroyer'] },
        9: { name: '撤出海湾', objective: '在岸防炮台射程边缘击退追兵，撤出黑尔戈兰湾。', air: ['gunship', 'dart'], sea: ['destroyer', 'coastal-battery'] },
      }),
      mission('broad-fourteens', '布罗德十四海战', {
        year: 1914, date: '1914年9月22日', source: 'https://www.rmg.co.uk/collections/objects/rmgc-object-114092',
        summary: '德国潜艇 U-9 在北海南部的布罗德十四海域接连击沉英国装甲巡洋舰阿布基尔号、霍格号和克雷西号，一千四百余名官兵阵亡。',
        archive: [{ id: 'u9' }],
      }, {
        1: { name: '北海浅滩', objective: '从航母起飞，驱散浅滩上空的侦察机和鱼雷机。', air: ['scout', 'torpedo'], sea: [] },
        2: { name: '无护航巡逻', objective: '击沉巡逻艇，压制前出的巡洋舰。', air: ['interceptor'], sea: ['patrol-boat', 'cruiser'] },
        3: { name: '落水救援', objective: '掩护蓝旗运输船救起落水官兵，拦截鱼雷机与重型轰炸机。', air: ['torpedo', 'scout'], sea: ['destroyer'] },
        6: { name: '荷兰沿岸补给', objective: '接收舰队补给，压制沿岸炮台与敌方运输船。', air: ['dart', 'torpedo'], sea: ['coastal-battery', 'transport'] },
        8: { name: '潜望镜海域', objective: '拦截低空鱼雷机，迎战重型轰炸机精英，击沉巡逻艇。', air: ['torpedo', 'diver'], sea: ['patrol-boat', 'transport'] },
      }),
      mission('blockade-route', '多格尔沙洲海战', {
        year: 1915, date: '1915年1月24日', source: 'https://www.rmg.co.uk/collections/archive/rmgc-object-492758',
        summary: '英国战列巡洋舰在多格尔沙洲截住希佩尔的突袭编队，击沉装甲巡洋舰布吕歇尔号，英方旗舰狮号也受重创退出战斗。',
        archive: [],
      }, {
        1: { name: '沙洲外警戒', objective: '拦截侦察编队，压制巡逻艇并截停运输船。', air: ['scout', 'interceptor'], sea: ['patrol-boat', 'transport'] },
        2: { name: '追击航线', objective: '追上撤退的巡洋舰，驱散高速突击机。', air: ['dart', 'scout'], sea: ['cruiser'] },
        4: { name: '外海追击', objective: '击破警戒驱逐舰，避开沿途防空火力。', air: ['scout', 'torpedo'], sea: ['destroyer', 'coastal-battery'] },
        7: { name: '布吕歇尔断后', objective: '压制落在队尾的巡洋舰，击退护航机与鱼雷机。', air: ['gunship', 'torpedo'], sea: ['cruiser', 'patrol-boat'] },
        9: { name: '拦截补给', objective: '击退敌方护航机，摧毁补给点的油库。', air: ['interceptor', 'gunship'], sea: ['oil-depot', 'cruiser'] },
      }),
      mission('dardanelles', '达达尼尔海峡海战', {
        year: 1915, date: '1915年3月18日', source: 'https://www.iwm.org.uk/history/a-short-history-of-the-dardanelles-campaign',
        summary: '英法联合舰队强攻达达尼尔海峡，奥斯曼岸防炮台与新布设的水雷击沉三艘战列舰，海上突破失败，协约国转而登陆加里波利。',
        archive: [{ id: 'warspite', note: '同级伊丽莎白女王号' }],
      }, {
        1: { name: '海峡入口', objective: '压制入口两岸的炮台，击沉前出的巡逻艇。', air: ['scout', 'diver'], sea: ['coastal-battery', 'patrol-boat'] },
        2: { name: '扫雷船队', objective: '为扫雷船开路：压制两岸炮台，截停敌方运输船。', air: ['interceptor', 'gunship'], sea: ['coastal-battery', 'transport'] },
        4: { name: '纳罗斯要塞', objective: '在海峡最窄处压制要塞炮台和巡洋舰。', air: ['diver', 'torpedo'], sea: ['coastal-battery', 'cruiser'] },
        6: { name: '前进锚地', objective: '接收舰队补给，摧毁岸边油库与炮台。', air: ['scout', 'interceptor'], sea: ['oil-depot', 'coastal-battery'] },
        9: { name: '埃伦柯伊湾', objective: '避开新布雷区，突破驱逐舰与两岸炮台。', air: ['diver', 'gunship', 'dart'], sea: ['destroyer', 'coastal-battery'] },
      }),
      mission('fog-convoy', '日德兰海战', {
        year: 1916, date: '1916年5月31日–6月1日', source: 'https://www.rmg.co.uk/collections/archive/rmgc-object-492769',
        summary: '英国大舰队与德国公海舰队在日德兰半岛外海交战，这是一战规模最大的海战；英方损失舰艇更多，但仍维持了北海封锁。',
        archive: [{ id: 'warspite' }],
      }, {
        1: { name: '雾外前哨', objective: '拦截低空侦察机和鱼雷机，压制雾中的巡逻艇。', air: ['scout', 'torpedo'], sea: ['patrol-boat'] },
        2: { name: '舰队接触', objective: '击破驱逐舰与巡逻艇，避开防空火力。', air: ['scout', 'torpedo'], sea: ['patrol-boat', 'destroyer', 'coastal-battery'] },
        3: { name: '雾中交锋', objective: '拦截鱼雷机与重型轰炸机，掩护蓝旗运输船撤离。', air: ['torpedo', 'interceptor'], sea: ['patrol-boat'] },
        7: { name: '舰队再战', objective: '击退双发护航机，压制敌方水面编队。', air: ['scout', 'gunship'], sea: ['transport', 'destroyer'] },
        9: { name: '雾中防线', objective: '避开防空火力，压制雾中的巡洋舰。', air: ['interceptor', 'gunship'], sea: ['coastal-battery', 'cruiser'] },
      }),
      mission('tide-break', '奥特朗托海峡海战', {
        year: 1917, date: '1917年5月15日', source: `${NHHC}/our-collections/photography/numerical-list-of-images/nhhc-series/nh-series/NH-60000/NH-60197.html`,
        summary: '奥匈帝国轻巡洋舰夜袭奥特朗托海峡反潜封锁线上的漂网渔船，随后与英意舰艇交战，受伤后撤回卡塔罗。',
        archive: [],
      }, {
        1: { name: '海峡外哨', objective: '从岸防炮台和轻型战斗机的警戒圈切入。', air: ['scout', 'gunship'], sea: ['coastal-battery'] },
        2: { name: '封锁缺口', objective: '击退海峡里的巡逻艇，再摧毁补给油库。', air: ['scout', 'diver'], sea: ['patrol-boat', 'oil-depot'] },
        4: { name: '海峡巡防', objective: '突破驱逐舰与巡洋舰的双重防空。', air: ['interceptor', 'torpedo'], sea: ['destroyer', 'cruiser'] },
        6: { name: '海峡补给', objective: '接收舰队补给，压制防空火力并截击敌方运输船。', air: ['scout', 'gunship'], sea: ['coastal-battery', 'transport'] },
        9: { name: '封锁线决战', objective: '突破驱逐舰的警戒，摧毁补给油库和岸防炮台。', air: ['diver', 'scout', 'interceptor'], sea: ['oil-depot', 'coastal-battery', 'destroyer'] },
      }),
      mission('zeebrugge', '泽布吕赫突袭', {
        year: 1918, date: '1918年4月23日', source: 'https://www.rmg.co.uk/collections/objects/rmgc-object-115165',
        summary: '英国皇家海军夜袭比利时泽布吕赫港，突击队登上防波堤牵制守军，阻塞船在运河口自沉，试图封锁布鲁日的德国潜艇基地。',
        archive: [],
      }, {
        1: { name: '烟幕掩护', objective: '在烟幕后方驱散截击机，击沉港外巡逻艇。', air: ['interceptor', 'scout'], sea: ['patrol-boat', 'coastal-battery'] },
        3: { name: '渡轮靠堤', objective: '掩护蓝旗运输船靠上防波堤，拦截鱼雷机、护航机与重型轰炸机。', air: ['torpedo', 'gunship'], sea: ['coastal-battery'] },
        4: { name: '防波堤炮台', objective: '压制防波堤末端的炮台，击沉守港驱逐舰。', air: ['diver', 'scout'], sea: ['coastal-battery', 'destroyer'] },
        6: { name: '运河口外', objective: '接收舰队补给，压制运河口守军，摧毁油库与敌方运输船。', air: ['gunship', 'dart'], sea: ['oil-depot', 'transport', 'patrol-boat'] },
        9: { name: '运河出口', objective: '突破运河口的炮台与驱逐舰，掩护突击队撤离。', air: ['interceptor', 'gunship', 'dart'], sea: ['coastal-battery', 'destroyer', 'patrol-boat'] },
      }),
      mission('tondern', '通德恩空袭', {
        year: 1918, date: '1918年7月19日', source: 'https://www.usni.org/magazines/proceedings/2018/september/tondern-raid-strike-fighter-centennial',
        summary: '英国航母暴怒号放飞七架舰载型 Camel 战斗机轰炸德国通德恩飞艇基地，摧毁 L 54 和 L 60 两艘齐柏林飞艇，开创航母起飞空袭的先例。',
        archive: [{ id: 'sopwith-camel', note: '舰载型 2F.1' }],
      }, {
        1: { name: '甲板起飞', objective: '从航母起飞，驱散前来侦察的战斗机与截击机。', air: ['scout', 'interceptor'], sea: [] },
        2: { name: '丹麦海岸', objective: '沿海岸线低空突入，压制巡逻艇与岸防炮台。', air: ['scout', 'torpedo'], sea: ['patrol-boat', 'coastal-battery'] },
        7: { name: '飞艇库', objective: '轰炸飞艇库外的油库，压制周边防空炮台。', air: ['diver', 'scout'], sea: ['oil-depot', 'coastal-battery'] },
        8: { name: '返航途中', objective: '拦截追击的鱼雷机，迎战重型轰炸机精英，击沉拦在返航航线上的舰船。', air: ['torpedo', 'dart'], sea: ['destroyer', 'transport'] },
        9: { name: '甩开追兵', objective: '击退护航机与截击机，击沉追来的驱逐舰和巡洋舰。', air: ['gunship', 'interceptor', 'scout'], sea: ['destroyer', 'cruiser'] },
      }),
    ],
  },
  {
    name: '第二次世界大战',
    craft: ['falcon', 'turtle'],
    missions: [
      mission('taranto', '塔兰托空袭', {
        year: 1940, date: '1940年11月11日–12日', source: 'https://www.nationalww2museum.org/war/articles/taranto-november-1940',
        summary: '英国航母光辉号夜间放飞二十一架剑鱼式攻击机，以鱼雷重创停泊在塔兰托港的利托里奥号等三艘意大利战列舰。',
        archive: [{ id: 'illustrious' }, { id: 'littorio' }, { id: 'giulio-cesare', note: '在港未中雷' }, { id: 'maestrale', note: '同级西南风号' }],
      }, {
        1: { name: '照明弹下', objective: '在照明弹光下切入港外防空网，击退夜间截击机。', air: ['interceptor', 'scout'], sea: ['coastal-battery'] },
        2: { name: '大港防空', objective: '压制外港的防空炮台与巡洋舰。', air: ['diver', 'interceptor'], sea: ['coastal-battery', 'cruiser'] },
        4: { name: '水上飞机基地', objective: '轰炸港内油库和水上飞机基地旁的巡逻艇。', air: ['gunship', 'diver'], sea: ['oil-depot', 'patrol-boat'] },
        7: { name: '内港巡洋舰', objective: '突入内港，压制巡洋舰与驱逐舰的交叉火力。', air: ['torpedo', 'gunship'], sea: ['cruiser', 'destroyer'] },
        9: { name: '返回航母', objective: '甩开追击的战斗机，击沉拦截航线的驱逐舰与岸炮。', air: ['dart', 'scout', 'torpedo'], sea: ['destroyer', 'coastal-battery'] },
      }),
      mission('bismarck-chase', '追击俾斯麦号', {
        year: 1941, date: '1941年5月24日–27日', source: `${NHHC}/research/library/online-reading-room/title-list-alphabetically/s/sinking-of-the-bismarck/the-sinking-of-the-german-battleship-bismarck-as-described-in-the-b-d-u-commander-u-boats-war-log-24-31-may-1941.html`,
        summary: '德国战列舰俾斯麦号在丹麦海峡击沉胡德号；皇家方舟号的剑鱼式鱼雷机随后打坏其舵机，英国战列舰赶到将其击沉。',
        archive: [{ id: 'bismarck' }, { id: 'prinz-eugen' }, { id: 'hood' }, { id: 'ark-royal' }, { id: 'king-george-v' }, { id: 'rodney' }],
      }, {
        1: { name: '丹麦海峡', objective: '在冰海上空拦截侦察机和护航机，盯住巡洋舰。', air: ['scout', 'gunship'], sea: ['cruiser'] },
        3: { name: '大西洋船队', objective: '保护蓝旗运输船驶离突袭航线，拦截鱼雷机与重型轰炸机。', air: ['torpedo', 'diver'], sea: ['destroyer'] },
        4: { name: '剑鱼出击', objective: '压制巡洋舰与巡逻艇，为鱼雷机打开攻击航线。', air: ['torpedo', 'interceptor'], sea: ['cruiser', 'patrol-boat'] },
        8: { name: '雨雾搜索', objective: '在雨雾中迎战重型轰炸机精英，击沉补给运输船。', air: ['interceptor', 'scout'], sea: ['destroyer', 'transport'] },
        9: { name: '最后的追击', objective: '突破驱逐舰与巡洋舰的护卫，切断敌舰退往法国港口的航线。', air: ['gunship', 'torpedo', 'diver'], sea: ['destroyer', 'cruiser', 'transport'] },
      }),
      mission('coral-sea', '珊瑚海海战', {
        year: 1942, date: '1942年5月4日–8日', source: `${NHHC}/browse-by-topic/wars-conflicts-and-operations/world-war-ii/1942/battle-of-coral-sea.html`,
        summary: '美日航母编队在珊瑚海以舰载机相互攻击，双方舰艇始终未目视接触；列克星敦号沉没，翔鹤号重创，日军进攻莫尔兹比港的计划推迟。',
        archive: [{ id: 'lexington', note: '列克星敦号' }, { id: 'shokaku' }],
      }, {
        1: { name: '图拉吉锚地', objective: '袭击图拉吉锚地的巡逻艇与岸边油库。', air: ['scout', 'torpedo'], sea: ['patrol-boat', 'oil-depot'] },
        2: { name: '鱼雷航道', objective: '拦截低空鱼雷机，清除航道巡逻艇。', air: ['torpedo', 'scout'], sea: ['patrol-boat', 'destroyer'] },
        4: { name: '掩护编队', objective: '击退俯冲机和护航机，压制掩护编队的驱逐舰与巡洋舰。', air: ['diver', 'gunship'], sea: ['destroyer', 'cruiser'] },
        7: { name: '双重警戒', objective: '穿过巡洋舰与驱逐舰的防空火力。', air: ['diver', 'torpedo'], sea: ['cruiser', 'destroyer'] },
        9: { name: '搜索航线', objective: '沿搜索航线截击鱼雷机和截击机，击沉补给运输船。', air: ['torpedo', 'interceptor', 'dart'], sea: ['cruiser', 'transport'] },
      }),
      mission('island-counteroffensive', '中途岛海战', {
        year: 1942, date: '1942年6月4日–7日', source: `${NHHC}/browse-by-topic/wars-conflicts-and-operations/world-war-ii/1942/midway.html`,
        summary: '美军凭借密码破译预先设伏，舰载俯冲轰炸机击沉赤城、加贺、苍龙和飞龙四艘日本航母，太平洋战局由此转折。',
        archive: [{ id: 'akagi' }, { id: 'kaga' }, { id: 'soryu' }, { id: 'hiryu' }, { id: 'enterprise' }, { id: 'mogami' }],
      }, {
        1: { name: '岛链穿越', objective: '击破海岛炮台，越过敌方前哨。', air: ['scout', 'diver'], sea: ['coastal-battery'] },
        2: { name: '环礁外围', objective: '压制环礁外的巡逻艇与岸防炮台，驱散护航机。', air: ['scout', 'gunship'], sea: ['patrol-boat', 'coastal-battery'] },
        4: { name: '补给线截断', objective: '从敌驱逐舰掩护下截击运输船。', air: ['diver', 'gunship'], sea: ['transport', 'destroyer'] },
        7: { name: '俯冲时机', objective: '趁战斗机被引开，俯冲压制巡洋舰与驱逐舰。', air: ['diver', 'dart'], sea: ['cruiser', 'destroyer'] },
        9: { name: '岛上防空', objective: '摧毁岸防炮台和港口油库。', air: ['torpedo', 'diver'], sea: ['coastal-battery', 'oil-depot', 'cruiser'] },
      }),
      mission('north-cape', '北角海战', {
        year: 1943, date: '1943年12月26日', source: 'https://www.iwm.org.uk/history/hms-belfast-and-the-battle-of-north-cape',
        summary: '沙恩霍斯特号出击截击北极船队，贝尔法斯特号等巡洋舰以雷达持续跟踪，约克公爵号赶到后配合驱逐舰鱼雷将其击沉。',
        archive: [{ id: 'scharnhorst' }, { id: 'belfast' }, { id: 'king-george-v', note: '同级约克公爵号' }],
      }, {
        1: { name: '极夜航线', objective: '在极夜中起飞，拦截截击机与双发护航机。', air: ['interceptor', 'gunship'], sea: [] },
        3: { name: '北极船队', objective: '保护蓝旗运输船驶向摩尔曼斯克，拦截鱼雷机与重型轰炸机。', air: ['torpedo', 'scout'], sea: ['cruiser'] },
        4: { name: '雷达接触', objective: '循雷达回波追上驱逐舰与巡逻艇。', air: ['scout', 'diver'], sea: ['destroyer', 'patrol-boat'] },
        7: { name: '照明弹齐射', objective: '照明弹照亮海面后，压制巡洋舰与驱逐舰。', air: ['gunship', 'scout'], sea: ['cruiser', 'destroyer'] },
        9: { name: '鱼雷包夹', objective: '压制敌方驱逐舰、巡逻艇与巡洋舰，为友舰鱼雷攻击开路。', air: ['torpedo', 'gunship', 'interceptor'], sea: ['destroyer', 'patrol-boat', 'cruiser'] },
      }),
      mission('carrier-screen', '菲律宾海海战', {
        year: 1944, date: '1944年6月19日–20日', source: `${NHHC}/browse-by-topic/wars-conflicts-and-operations/world-war-ii/1944/battle-philippine-sea.html`,
        summary: '日军为阻止美军攻占马里亚纳群岛发起大规模舰载机攻击，遭美军战斗机和舰队防空大量击落；翔鹤号、大凤号被潜艇击沉。',
        archive: [{ id: 'essex' }, { id: 'independence', note: '普林斯顿号等' }, { id: 'shokaku' }, { id: 'a6m5' }],
      }, {
        1: { name: '舰队上空', objective: '在外海拦截逼近舰队的截击机和双发护航机。', air: ['interceptor', 'gunship'], sea: ['patrol-boat'] },
        2: { name: '雷道突袭', objective: '拦截鱼雷机，击沉护送它们前出的驱逐舰。', air: ['torpedo', 'gunship'], sea: ['destroyer'] },
        4: { name: '警戒弧线', objective: '击破巡洋舰的侧舷防空，再摧毁它护卫的油库。', air: ['diver', 'torpedo'], sea: ['cruiser', 'oil-depot'] },
        8: { name: '甲板上空', objective: '截击护航机和重型轰炸机，压制下方巡洋舰。', air: ['gunship', 'interceptor'], sea: ['cruiser'] },
        9: { name: '航母外圈', objective: '突破驱逐舰和巡洋舰，清开旗舰前的航路。', air: ['torpedo', 'diver', 'gunship'], sea: ['cruiser', 'destroyer'] },
      }),
      mission('leyte-gulf', '莱特湾海战', {
        year: 1944, date: '1944年10月23日–26日', source: `${NHHC}/browse-by-topic/wars-conflicts-and-operations/world-war-ii/1944/battle-of-leyte-gulf.html`,
        summary: '日军以诱饵航母调开美军主力，战列舰编队分路突入莱特湾；武藏号在锡布延海沉没，萨马岛外的护航航母与驱逐舰拼死阻击大和号编队。',
        archive: [
          { id: 'musashi' }, { id: 'yamato' }, { id: 'nagato' }, { id: 'kongo' },
          { id: 'fletcher', note: '约翰斯顿号等' }, { id: 'casablanca', note: '甘比尔湾号等' },
        ],
      }, {
        1: { name: '锡布延海', objective: '拦截俯冲机与鱼雷机，盯住穿越内海的巡洋舰。', air: ['diver', 'torpedo'], sea: ['cruiser'] },
        2: { name: '苏里高海峡', objective: '夜间穿过海峡，击沉鱼雷艇与驱逐舰。', air: ['interceptor', 'torpedo'], sea: ['patrol-boat', 'destroyer'] },
        4: { name: '恩加诺角', objective: '追击诱饵编队，击沉掉队的巡洋舰和运输船。', air: ['scout', 'dart'], sea: ['cruiser', 'transport'] },
        7: { name: '萨马岛外', objective: '借驱逐舰烟幕掩护护航航母，压制追击的巡洋舰。', air: ['gunship', 'diver'], sea: ['cruiser', 'patrol-boat'] },
        9: { name: '突入海湾', objective: '阻止战列舰编队突入莱特湾，击沉前卫驱逐舰与巡洋舰。', air: ['diver', 'torpedo', 'interceptor'], sea: ['destroyer', 'cruiser', 'transport'] },
      }),
      mission('night-harbor', '吴港空袭', {
        year: 1945, date: '1945年7月24日–28日', source: `${NHHC}/about-us/leadership/director/directors-corner/h-grams/h-gram-053/h-053-1.html`,
        summary: '美国第38特混舰队舰载机连续空袭吴港及周边锚地，击沉或重创停泊在港内的日本战列舰、航母和巡洋舰。',
        archive: [{ id: 'essex-long', note: '香格里拉号等' }, { id: 'kongo', note: '同级榛名号' }],
      }, {
        1: { name: '船坞入口', objective: '沿港湾切入，避开截击机与岸防炮台。', air: ['interceptor', 'diver'], sea: ['coastal-battery'] },
        2: { name: '坞门油库', objective: '炸毁油库，阻止巡逻艇掩护运输船撤离。', air: ['diver', 'scout'], sea: ['oil-depot', 'transport', 'patrol-boat'] },
        4: { name: '港内交锋', objective: '让驱逐舰和护航机失去对运输船的掩护。', air: ['gunship', 'interceptor'], sea: ['destroyer', 'transport'] },
        7: { name: '堤岸火网', objective: '穿过俯冲机航线，逐个击破岸防阵地。', air: ['diver', 'interceptor'], sea: ['coastal-battery', 'oil-depot'] },
        9: { name: '船坞决口', objective: '清除坞门守舰，摧毁附近油库。', air: ['torpedo', 'gunship', 'dart'], sea: ['cruiser', 'oil-depot', 'destroyer'] },
      }),
    ],
  },
  {
    name: '冷战',
    craft: ['swift', 'turtle'],
    missions: [
      mission('polar-patrol', '仁川登陆', {
        year: 1950, date: '1950年9月15日', source: `${NHHC}/browse-by-topic/wars-conflicts-and-operations/korean-war/korea-operations/inchon.html`,
        summary: '联合国军在仁川实施两栖登陆，先以舰炮和舰载机压制月尾岛，再利用大潮窗口登陆。',
        archive: [{ id: 'essex-long', note: '菲律宾海号等' }, { id: 'commencement-bay', note: '西西里号等' }],
      }, {
        1: { name: '港外遭遇', objective: '拦截高速突击机，打开通往港区的航道。', air: ['dart', 'scout'], sea: ['patrol-boat'] },
        2: { name: '飞鱼水道', objective: '沿狭窄水道推进，压制月尾岛炮台与守港驱逐舰。', air: ['gunship', 'scout'], sea: ['coastal-battery', 'destroyer'] },
        4: { name: '港口接近', objective: '避开横切机并破坏驱逐舰舰桥。', air: ['interceptor', 'dart'], sea: ['destroyer', 'patrol-boat'] },
        7: { name: '交叉航线', objective: '从高速机和护航机的交错航线穿过。', air: ['dart', 'gunship'], sea: ['cruiser', 'transport'] },
        9: { name: '潮汐窗口', objective: '在退潮前压制岸防炮台，击沉港内巡逻艇和敌方运输船。', air: ['dart', 'diver', 'torpedo'], sea: ['coastal-battery', 'transport', 'patrol-boat'] },
      }),
      mission('deep-sea-watch', '塞得港登陆', {
        year: 1956, date: '1956年11月5日–6日', source: 'https://www.nam.ac.uk/explore/suez-crisis',
        summary: '苏伊士运河危机中，英法联军以伞降、直升机机降和舰载机掩护的两栖登陆夺取塞得港，最终在国际压力下停火。',
        archive: [{ id: 'independence', note: '法国拉斐特号' }, { id: 'richelieu', note: '同级让·巴尔号' }],
      }, {
        1: { name: '运河入口', objective: '驱散侦察机与护航机，击沉运河口的巡逻艇和油库。', air: ['scout', 'gunship'], sea: ['patrol-boat', 'oil-depot'] },
        2: { name: '护卫试探', objective: '突破鱼雷机与岸防炮台的前哨。', air: ['interceptor', 'torpedo'], sea: ['coastal-battery'] },
        4: { name: '直升机机降', objective: '掩护直升机机降，压制港区炮台与运输船。', air: ['interceptor', 'scout'], sea: ['coastal-battery', 'transport'] },
        7: { name: '港外编队', objective: '躲开高速突击，压制巡洋舰防空炮。', air: ['dart', 'interceptor'], sea: ['cruiser', 'patrol-boat'] },
        9: { name: '封港行动', objective: '摧毁油库，打散驱逐舰编队。', air: ['gunship', 'interceptor'], sea: ['destroyer', 'oil-depot', 'coastal-battery'] },
      }),
      mission('trident', '特里登特行动', {
        year: 1971, date: '1971年12月4日–5日', source: 'https://usiofindia.org/pdf/OperationTridentATriumphoftheIndianNavyinthe1971IndoPakWar.pdf',
        summary: '第三次印巴战争中，印度海军导弹艇夜袭卡拉奇外海，以冥河反舰导弹击沉巴基斯坦驱逐舰开伯尔号等船只，并击中港区储油设施。',
        archive: [],
      }, {
        1: { name: '阿拉伯海夜航', objective: '在夜色中起飞，拦截高速突击机与鱼雷机。', air: ['dart', 'torpedo'], sea: [] },
        2: { name: '雷达警戒线', objective: '突破巡洋舰与巡逻艇组成的雷达警戒线。', air: ['interceptor', 'gunship'], sea: ['patrol-boat', 'cruiser'] },
        4: { name: '外海交火', objective: '击沉驱逐舰，截停为它补给的运输船。', air: ['scout', 'dart'], sea: ['destroyer', 'transport'] },
        6: { name: '前进补给', objective: '接收舰队补给，摧毁外港的油库、炮台和巡逻艇。', air: ['diver', 'scout'], sea: ['oil-depot', 'coastal-battery', 'patrol-boat'] },
        9: { name: '港区储油罐', objective: '摧毁港区储油罐，击退护航驱逐舰与运输船。', air: ['dart', 'interceptor', 'diver'], sea: ['oil-depot', 'destroyer', 'transport'] },
      }),
      mission('latakia', '拉塔基亚海战', {
        year: 1973, date: '1973年10月6日–7日', source: 'https://cimsec.org/the-impact-of-insignificance-naval-developments-from-the-yom-kippur-war/',
        summary: '第四次中东战争首夜，以色列导弹艇在叙利亚拉塔基亚外海与叙利亚舰艇交战，借助电子干扰规避冥河导弹，被视为首次导弹艇之间的海战。',
        archive: [],
      }, {
        1: { name: '海岸雷达', objective: '压制海岸雷达站旁的炮台，击沉警戒巡逻艇。', air: ['dart', 'diver'], sea: ['patrol-boat', 'coastal-battery'] },
        2: { name: '鱼雷艇前哨', objective: '拦截高速突击机，击沉前出的鱼雷艇。', air: ['torpedo', 'dart'], sea: ['patrol-boat'] },
        3: { name: '港外船队', objective: '保护蓝旗运输船，拦截护航机、截击机与重型轰炸机。', air: ['gunship', 'interceptor'], sea: ['patrol-boat', 'destroyer'] },
        7: { name: '导弹对射', objective: '在导弹艇与驱逐舰的交叉火力中寻找缺口。', air: ['interceptor', 'scout'], sea: ['patrol-boat', 'cruiser', 'destroyer'] },
        9: { name: '港口出口', objective: '封住港口出口，摧毁炮台和岸边油库。', air: ['dart', 'gunship', 'scout'], sea: ['coastal-battery', 'patrol-boat', 'oil-depot'] },
      }),
      mission('ice-passage', '圣卡洛斯湾登陆', {
        year: 1982, date: '1982年5月21日–25日', source: 'https://www.royalnavy.mod.uk/news/2021/may/21/20210521-san-carlos',
        summary: '英军在东福克兰岛圣卡洛斯湾登陆，阿根廷飞机连日低空攻击锚地，多艘护航舰艇被击沉，但登陆部队守住了滩头。',
        archive: [],
      }, {
        1: { name: '湾口巡线', objective: '避开高速机掠袭，压制巡逻艇与岸防炮台。', air: ['dart', 'scout'], sea: ['patrol-boat', 'coastal-battery'] },
        2: { name: '湾内航道', objective: '穿过截击机的横向航线，击沉运输船与护卫驱逐舰。', air: ['dart', 'interceptor'], sea: ['destroyer', 'transport'] },
        4: { name: '近岸追击', objective: '在高速机回袭前切断驱逐舰和巡逻艇的队形。', air: ['dart', 'gunship'], sea: ['destroyer', 'patrol-boat'] },
        7: { name: '锚地警戒', objective: '击破守在锚地外的炮台和巡洋舰。', air: ['interceptor', 'torpedo'], sea: ['coastal-battery', 'cruiser'] },
        9: { name: '湾口突破', objective: '穿过高速机和双发护航机的拦截，突破外海防线。', air: ['dart', 'gunship', 'interceptor'], sea: ['cruiser', 'destroyer'] },
      }),
      mission('gulf-of-sidra', '锡德拉湾之战', {
        year: 1986, date: '1986年3月24日–25日', source: `${NHHC}/our-collections/art/exhibits/communities/100th-anniversary-cno/admiral-james-d--watkins/moment-of-impact--operation-prairie-fire.html`,
        summary: '美国第六舰队在锡德拉湾演习时，利比亚岸基防空导弹向美军飞机开火，舰载机随即压制导弹阵地，并击沉、击伤多艘利比亚巡逻艇。',
        archive: [{ id: 'forrestal', note: '萨拉托加号' }, { id: 'kitty-hawk', note: '美国号' }, { id: 'midway', note: '珊瑚海号' }, { id: 'ticonderoga', note: '约克城号' }],
      }, {
        1: { name: '禁航线', objective: '越过对方宣布的禁航线，拦截前出的截击机。', air: ['interceptor', 'dart'], sea: [] },
        2: { name: '岸基导弹', objective: '压制向舰队开火的岸防导弹阵地。', air: ['diver', 'gunship'], sea: ['coastal-battery'] },
        4: { name: '导弹艇来袭', objective: '在导弹艇进入射程前将其击沉。', air: ['dart', 'diver'], sea: ['patrol-boat', 'destroyer'] },
        7: { name: '夜间第二波', objective: '再次压制重新开机的阵地，拦截夜间出港的舰艇。', air: ['interceptor', 'torpedo'], sea: ['patrol-boat', 'coastal-battery', 'cruiser'] },
        9: { name: '海湾出口', objective: '击退护航机与俯冲机，压制海湾出口的岸防和舰艇。', air: ['gunship', 'dart', 'diver'], sea: ['coastal-battery', 'cruiser', 'patrol-boat'] },
      }),
      mission('earnest-will', '真诚意志行动', {
        year: 1987, date: '1987年7月–1988年9月', source: 'https://www.cia.gov/resources/csi/static/Fighting-Iran.pdf',
        summary: '两伊战争“油轮战”期间，美国海军为改挂美国旗的科威特油轮护航；首航的布里奇顿号即触雷，美舰后来炮击了被用作据点的海上石油平台。',
        archive: [{ id: 'kidd' }, { id: 'spruance', note: '杨格号等' }, { id: 'charles-adams', note: '霍埃尔号' }],
      }, {
        2: { name: '法尔西岛外', objective: '驱散快艇群，截停可疑运输船。', air: ['scout', 'dart'], sea: ['patrol-boat', 'transport'] },
        3: { name: '油轮护航', objective: '护送蓝旗运输船穿过雷区，拦截鱼雷机与重型轰炸机。', air: ['torpedo', 'gunship'], sea: ['patrol-boat', 'oil-depot'] },
        4: { name: '石油平台', objective: '炮击被用作据点的海上石油平台，压制平台上的炮位。', air: ['interceptor', 'diver'], sea: ['oil-depot', 'coastal-battery', 'patrol-boat'] },
        6: { name: '航线补给', objective: '接收舰队补给，截停可疑运输船与随行驱逐舰。', air: ['gunship', 'torpedo'], sea: ['transport', 'destroyer'] },
        8: { name: '夜间布雷船', objective: '迎战重型轰炸机精英，击沉夜间布雷的船只。', air: ['torpedo', 'dart'], sea: ['transport', 'patrol-boat', 'cruiser'] },
      }),
      mission('relay-island', '祈祷螳螂行动', {
        year: 1988, date: '1988年4月18日', source: `${NHHC}/browse-by-topic/wars-conflicts-and-operations/middle-east/praying-mantis.html`,
        summary: '美舰塞缪尔·B·罗伯茨号在波斯湾触雷后，美国海军打击伊朗两座海上石油平台，并在随后交战中击沉、击伤多艘伊朗舰艇。',
        archive: [
          { id: 'enterprise-nuclear' }, { id: 'belknap', note: '温赖特号' },
          { id: 'spruance', note: '梅里尔号' }, { id: 'charles-adams', note: '林德·麦考密克号等' },
        ],
      }, {
        1: { name: '海上警戒', objective: '驱散侦察机，击破巡逻艇和海上补给点的油库。', air: ['scout', 'interceptor'], sea: ['patrol-boat', 'oil-depot'] },
        3: { name: '补给接力', objective: '护送蓝旗运输船，拦截逼近的鱼雷机与重型轰炸机。', air: ['torpedo', 'dart'], sea: ['destroyer'] },
        4: { name: '补给线交锋', objective: '击沉敌方运输船，摧毁海上补给点的油库。', air: ['interceptor', 'gunship'], sea: ['transport', 'oil-depot'] },
        6: { name: '前沿补给', objective: '接收舰队补给，避开横切截击机，压制炮台与巡洋舰。', air: ['dart', 'diver', 'interceptor'], sea: ['coastal-battery', 'cruiser'] },
        9: { name: '外海屏障', objective: '掩护舰队航线，打开炮台和驱逐舰把守的出口。', air: ['torpedo', 'interceptor', 'gunship'], sea: ['coastal-battery', 'destroyer'] },
      }),
    ],
  },
  {
    name: '现代',
    craft: ['falcon', 'swift'],
    missions: [
      mission('bubiyan', '布比延海战', {
        year: 1991, date: '1991年1月29日–2月2日', source: `${NHHC}/research/library/online-reading-room/title-list-alphabetically/u/us-navy-in-desert-shield-desert-storm/appendix-h-surface-warfare.html`,
        summary: '海湾战争中，伊拉克海军舰艇试图经布比延岛附近水道撤往伊朗水域，多国部队的舰载直升机和攻击机以导弹、炸弹将其大部摧毁。',
        archive: [],
      }, {
        1: { name: '北部湾区', objective: '从航母起飞，拦截侦察机、截击机和高速突击机。', air: ['scout', 'interceptor', 'dart'], sea: [] },
        2: { name: '快艇突围', objective: '击沉试图突围的快艇与随行运输船。', air: ['dart', 'torpedo'], sea: ['patrol-boat', 'transport'] },
        4: { name: '布雷舰队', objective: '压制护航驱逐舰，击沉布雷舰和巡逻艇。', air: ['gunship', 'interceptor'], sea: ['patrol-boat', 'destroyer', 'transport'] },
        7: { name: '岛间水道', objective: '在狭窄水道中截住巡洋舰、运输船与巡逻艇。', air: ['diver', 'scout'], sea: ['patrol-boat', 'cruiser', 'transport'] },
        9: { name: '水域边缘', objective: '在船队逃出射程前击沉驱逐舰与巡逻艇，压制岸炮。', air: ['torpedo', 'gunship', 'dart'], sea: ['patrol-boat', 'destroyer', 'coastal-battery'] },
      }),
      mission('kuwait-coast', '科威特外海炮击', {
        year: 1991, date: '1991年2月', source: `${NHHC}/our-collections/art/exhibits/conflicts-and-operations/the-gulf-war-1990-1991--operation-desert-shield--desert-storm-/uss-missouri-under-attack-by-iraqi-silkworm.html`,
        summary: '战列舰密苏里号和威斯康星号炮击科威特沿岸阵地；伊拉克向密苏里号发射两枚蚕式岸舰导弹，一枚坠海，另一枚被护航的格洛斯特号击落。',
        archive: [{ id: 'missouri' }, { id: 'iowa', note: '同级威斯康星号' }],
      }, {
        1: { name: '法拉卡岛', objective: '压制岛上的炮台，击沉附近的巡逻艇。', air: ['interceptor', 'diver'], sea: ['coastal-battery', 'patrol-boat'] },
        3: { name: '两栖佯动', objective: '护送蓝旗运输船进行两栖佯动，拦截鱼雷机与重型轰炸机。', air: ['torpedo', 'interceptor'], sea: ['coastal-battery', 'patrol-boat'] },
        4: { name: '扫雷航道', objective: '为扫雷编队开路，压制岸炮并截停布雷运输船。', air: ['scout', 'diver'], sea: ['transport', 'coastal-battery'] },
        6: { name: '炮击阵位', objective: '接收舰队补给，摧毁沿岸油库、岸舰导弹阵地和驱逐舰。', air: ['diver', 'dart'], sea: ['oil-depot', 'coastal-battery', 'destroyer'] },
        9: { name: '蚕式导弹', objective: '抢在下一轮导弹发射前摧毁阵地与油库。', air: ['dart', 'interceptor', 'gunship'], sea: ['coastal-battery', 'oil-depot', 'cruiser'] },
      }),
      mission('deliberate-force', '慎重武力行动', {
        year: 1995, date: '1995年8月30日–9月20日', source: 'https://www.afhistory.af.mil/FAQs/Fact-Sheets/Article/459000/operation-deliberate-force',
        summary: '波斯尼亚战争中，北约发动首次持续空中作战，盟军飞机打击塞族武装的防空、指挥和弹药设施，亚得里亚海上的航母提供支援。',
        archive: [{ id: 'nimitz', note: '西奥多·罗斯福号' }, { id: 'f16a', note: '荷兰空军等' }, { id: 'mirage2000c', note: '同系 2000N／2000D' }],
      }, {
        1: { name: '亚得里亚海', objective: '从航母起飞，拦截战斗机、护航机和截击机。', air: ['scout', 'gunship', 'interceptor'], sea: [] },
        2: { name: '防空压制', objective: '在高速机掩护下压制防空阵地。', air: ['diver', 'dart'], sea: ['coastal-battery'] },
        4: { name: '弹药库', objective: '炸毁弹药库与油库，截停补给运输船。', air: ['diver', 'gunship'], sea: ['oil-depot', 'transport'] },
        7: { name: '山地雷达', objective: '摧毁山地雷达与防空炮位，压制下方舰艇。', air: ['gunship', 'scout'], sea: ['coastal-battery', 'cruiser', 'patrol-boat'] },
        9: { name: '解除围困', objective: '突破最后的防空圈，摧毁指挥阵地和油库。', air: ['dart', 'diver', 'torpedo'], sea: ['coastal-battery', 'oil-depot', 'destroyer'] },
      }),
      mission('offshore-screen', '科索沃空中战役', {
        year: 1999, date: '1999年3月24日–6月10日', source: 'https://www.nato.int/en/what-we-do/operations-and-missions/kosovo-air-campaign-march-june-1999',
        summary: '北约对南联盟实施为期七十八天的空中打击，美军航母和水面舰艇在亚得里亚海参与作战。',
        archive: [{ id: 'nimitz', note: '西奥多·罗斯福号' }, { id: 'f16a', note: '荷兰空军等' }],
      }, {
        1: { name: '先遣屏障', objective: '拦截高速机与横切截击机。', air: ['dart', 'interceptor'], sea: ['patrol-boat'] },
        2: { name: '亚得里亚海警戒', objective: '拦截鱼雷机，压制沿岸炮台与警戒驱逐舰。', air: ['torpedo', 'gunship'], sea: ['destroyer', 'coastal-battery'] },
        4: { name: '多层防御', objective: '同时压制巡洋舰和岸防炮台。', air: ['diver', 'dart'], sea: ['cruiser', 'coastal-battery'] },
        7: { name: '夜间突防', objective: '夜间穿过截击航线，压制巡洋舰、炮台和运输船。', air: ['dart', 'interceptor'], sea: ['cruiser', 'coastal-battery', 'transport'] },
        9: { name: '战区突破', objective: '穿过三类战机协防的舰队防线。', air: ['interceptor', 'gunship', 'dart'], sea: ['destroyer', 'cruiser', 'transport'] },
      }),
      mission('strait-recovery', '阿富汗空中战役', {
        year: 2001, date: '2001年10月7日起', source: `${NHHC}/research/library/online-reading-room/title-list-alphabetically/u/us-navy-operation-enduring-freedom-2001-2002.html`,
        summary: '美英从阿拉伯海的航母和舰艇对阿富汗境内目标实施空袭和巡航导弹打击，舰载机需长途往返执行任务。',
        archive: [{ id: 'enterprise-nuclear' }, { id: 'nimitz', note: '卡尔·文森号等' }, { id: 'kitty-hawk' }],
      }, {
        1: { name: '接应航线', objective: '清理航线前方的驱逐舰，防备横切截击。', air: ['interceptor', 'dart'], sea: ['destroyer'] },
        3: { name: '航母编队护航', objective: '在航母编队周边保护蓝旗运输船，拦截鱼雷机和重型轰炸机。', air: ['torpedo', 'diver'], sea: ['patrol-boat', 'cruiser'] },
        4: { name: '海上外围警戒', objective: '拦截低空鱼雷机，击破防空巡洋舰。', air: ['dart', 'diver', 'torpedo'], sea: ['coastal-battery', 'cruiser'] },
        7: { name: '舰队换防', objective: '穿过高速突击机编队，击破巡洋舰与驱逐舰。', air: ['gunship', 'dart', 'torpedo'], sea: ['cruiser', 'destroyer'] },
        9: { name: '外海接应', objective: '击破航道前方的舰艇，避开防空火力。', air: ['torpedo', 'interceptor', 'dart'], sea: ['patrol-boat', 'destroyer', 'coastal-battery'] },
      }),
      mission('fleet-crossing', '法奥半岛登陆', {
        year: 2003, date: '2003年3月20日–21日', source: 'https://assets.publishing.service.gov.uk/media/5a7f968fe5274a2e8ab4d16a/The_Report_of_the_Iraq_Inquiry_-_Volume_VII.pdf#page=25',
        summary: '伊拉克战争开始时，英国皇家海军陆战队在舰炮支援下突击法奥半岛，夺取石油设施，为乌姆盖斯尔港航道扫雷开路。',
        archive: [],
      }, {
        1: { name: '第一道警戒', objective: '拦截高速先遣机，击沉海上警戒驱逐舰。', air: ['dart', 'gunship'], sea: ['destroyer'] },
        2: { name: '补给枢纽', objective: '切断敌方油库与运输船之间的补给线。', air: ['interceptor', 'diver'], sea: ['oil-depot', 'transport'] },
        4: { name: '防空纵深', objective: '穿过俯冲机和高速机的夹击，击破巡逻艇、驱逐舰与巡洋舰。', air: ['dart', 'diver', 'gunship'], sea: ['cruiser', 'destroyer', 'patrol-boat'] },
        7: { name: '外层编队', objective: '击沉敌巡洋舰，阻止护航机接近我方航线。', air: ['gunship', 'torpedo', 'interceptor'], sea: ['cruiser', 'patrol-boat'] },
        9: { name: '决战走廊', objective: '击穿最后的三舰防空线，为下一波首领战打开走廊。', air: ['dart', 'gunship', 'torpedo'], sea: ['destroyer', 'cruiser', 'patrol-boat'] },
      }),
      mission('gulf-of-aden', '亚丁湾反海盗行动', {
        year: 2009, date: '2009年1月起', source: 'https://www.dvidshub.net/news/28588/new-counter-piracy-task-force-established-commander-combined-maritime-forces-public-affairs',
        summary: '索马里海盗频繁劫持商船，多国海军在亚丁湾护航巡逻；2009年1月第151联合特混舰队成立，4月美舰营救了马士基·阿拉巴马号船长。',
        archive: [{ id: 'arleigh-burke', note: '马汉号、班布里奇号' }, { id: 'ticonderoga', note: '安齐奥号' }],
      }, {
        1: { name: '曼德海峡', objective: '从航母起飞，驱散高速机，盯住可疑运输船。', air: ['dart', 'scout'], sea: ['transport'] },
        3: { name: '商船护航', objective: '护送蓝旗运输船穿过走廊，拦截俯冲机与重型轰炸机。', air: ['dart', 'diver'], sea: ['patrol-boat', 'transport'] },
        6: { name: '海盗母船', objective: '接收舰队补给，击沉为快艇补给的母船并摧毁油料。', air: ['scout', 'torpedo'], sea: ['transport', 'patrol-boat', 'oil-depot'] },
        7: { name: '快艇群', objective: '击退护航机，击沉围攻商船的快艇与驱逐舰。', air: ['dart', 'gunship'], sea: ['patrol-boat', 'destroyer', 'transport'] },
        9: { name: '营救行动', objective: '在海盗撤离前截住快艇与母船，压制巡洋舰。', air: ['interceptor', 'torpedo', 'scout'], sea: ['patrol-boat', 'transport', 'cruiser'] },
      }),
      mission('skyline', '统一保护者行动', {
        year: 2011, date: '2011年3月23日–10月31日', source: 'https://www.nato.int/en/what-we-do/operations-and-missions/nato-and-libya-february-october-2011',
        summary: '北约依据联合国安理会第1973号决议，在利比亚执行武器禁运和禁飞区，并空袭威胁平民的军事目标。',
        archive: [{ id: 'rafale-c' }, { id: 'mirage2000c', note: '同系 2000-5／2000D' }, { id: 'f16a', note: '丹麦、挪威空军等' }],
      }, {
        1: { name: '禁运巡逻', objective: '驱散侦察机与护航机，查验可疑运输船。', air: ['scout', 'gunship'], sea: ['patrol-boat', 'transport'] },
        2: { name: '快速反应', objective: '拦截快速编队，为舰队打开窗口。', air: ['dart', 'gunship'], sea: ['patrol-boat', 'coastal-battery'] },
        4: { name: '海上禁运', objective: '截停运输船，压制随行的驱逐舰与巡逻艇。', air: ['interceptor', 'diver'], sea: ['transport', 'destroyer', 'patrol-boat'] },
        7: { name: '联合防空', objective: '分段压制各舰防空炮，避开高速机。', air: ['dart', 'torpedo', 'interceptor'], sea: ['cruiser', 'destroyer', 'oil-depot'] },
        9: { name: '舰队决口', objective: '打破最后的水面警戒编队。', air: ['gunship', 'diver', 'dart'], sea: ['destroyer', 'cruiser', 'coastal-battery'] },
      }),
    ],
  },
];

export const CAMPAIGN_STAGES = CHAPTERS.flatMap(chapter => chapter.missions.map(mission => ({ chapter, mission })));
export const DEFAULT_STAGE: CampaignStage = { chapter: CHAPTERS[0], mission: CHAPTERS[0].missions[0] };

export function stageAt(index: number): CampaignStage {
  return CAMPAIGN_STAGES[index] ?? DEFAULT_STAGE;
}

export function firstUnclearedStageIndex(cleared: ReadonlySet<string>): number {
  return CAMPAIGN_STAGES.findIndex(stage => !cleared.has(stage.mission.id));
}

// The sixteen-mission release unlocked missions in this order before later battles were inserted between them.
const SIXTEEN_MISSION_ORDER = [
  'dawn-seas', 'blockade-route', 'fog-convoy', 'tide-break', 'coral-sea', 'island-counteroffensive', 'carrier-screen', 'night-harbor',
  'polar-patrol', 'deep-sea-watch', 'ice-passage', 'relay-island', 'offshore-screen', 'strait-recovery', 'fleet-crossing', 'skyline',
];

/**
 * A stage opens once every earlier stage on the timeline is cleared. A save from the sixteen-mission release also keeps
 * the next mission of that order open, so inserted battles never relock the progress it had already reached.
 */
export function isStageUnlocked(index: number, cleared: ReadonlySet<string>, sixteenMissionSave = false): boolean {
  const stage = CAMPAIGN_STAGES[index];
  if (!stage) return false;
  return cleared.has(stage.mission.id) || index === firstUnclearedStageIndex(cleared)
    || (sixteenMissionSave && index === sixteenMissionFrontier(cleared));
}

/** The stage a sixteen-mission save would have flown next in that release's order, or -1 once all sixteen are cleared. */
export function sixteenMissionFrontier(cleared: ReadonlySet<string>): number {
  const id = SIXTEEN_MISSION_ORDER.find(mission => !cleared.has(mission));
  return CAMPAIGN_STAGES.findIndex(stage => stage.mission.id === id);
}

export interface HullSpec { hp: number; halfWidth: number; halfLength: number; speed: number; scale: number; score: number }
export const HULLS: Record<ShipKind, HullSpec> = {
  'patrol-boat': { hp: 150, halfWidth: 19, halfLength: 39, speed: 34, scale: 24, score: 180 },
  destroyer: { hp: 390, halfWidth: 28, halfLength: 74, speed: 25, scale: 36, score: 360 },
  cruiser: { hp: 620, halfWidth: 38, halfLength: 95, speed: 21, scale: 44, score: 520 },
  battleship: { hp: 2800, halfWidth: 58, halfLength: 139, speed: 57, scale: 58, score: 3500 },
  'fleet-carrier': { hp: 4400, halfWidth: 66, halfLength: 168, speed: 57, scale: 57, score: 5000 },
  'coastal-battery': { hp: 220, halfWidth: 36, halfLength: 42, speed: 24, scale: 29, score: 240 },
  'oil-depot': { hp: 180, halfWidth: 39, halfLength: 45, speed: 24, scale: 30, score: 300 },
  transport: { hp: 230, halfWidth: 25, halfLength: 66, speed: 29, scale: 32, score: 320 },
};

export function waveInfo(wave: number, mission = DEFAULT_STAGE.mission): WaveInfo {
  return mission.waves[wave - 1] ?? WAVES[0];
}
