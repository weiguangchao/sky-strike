import type { AirKind, CampaignStage, Chapter, Mission, ShipKind, WaveInfo } from './types.ts';

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

function mission(id: string, name: string, encounters: Partial<Record<number, WaveInfo>> = {}): Mission {
  return { id, name, waves: WAVES.map((wave, index) => encounters[index + 1] ?? wave) };
}

export const CHAPTERS: readonly [Chapter, ...Chapter[]] = [
  {
    name: '第一次世界大战',
    craft: ['falcon', 'swift', 'turtle'],
    missions: [
      mission('dawn-seas', '黑尔戈兰湾海战'),
      mission('blockade-route', '多格尔沙洲海战', {
        1: { name: '沙洲外警戒', objective: '拦截侦察编队，压制海上巡逻艇。', air: ['scout', 'interceptor'], sea: ['patrol-boat'] },
        4: { name: '外海追击', objective: '击破警戒驱逐舰，避开沿途防空火力。', air: ['scout', 'torpedo'], sea: ['destroyer', 'coastal-battery'] },
        9: { name: '拦截补给', objective: '击退敌方护航机，摧毁补给点的油库。', air: ['interceptor', 'gunship'], sea: ['oil-depot', 'cruiser'] },
      }),
      mission('fog-convoy', '日德兰海战', {
        1: { name: '雾外前哨', objective: '拦截低空侦察机和鱼雷机，压制雾中的巡逻艇。', air: ['scout', 'torpedo'], sea: ['patrol-boat'] },
        2: { name: '舰队接触', objective: '击破驱逐舰与巡逻艇，避开防空火力。', air: ['scout', 'torpedo'], sea: ['patrol-boat', 'destroyer', 'coastal-battery'] },
        3: { name: '雾中交锋', objective: '拦截鱼雷机与重型轰炸机，掩护蓝旗运输船撤离。', air: ['torpedo', 'interceptor'], sea: ['patrol-boat'] },
        7: { name: '舰队再战', objective: '击退双发护航机，压制敌方水面编队。', air: ['scout', 'gunship'], sea: ['transport', 'destroyer'] },
        9: { name: '雾中防线', objective: '避开防空火力，压制雾中的巡洋舰。', air: ['interceptor', 'gunship'], sea: ['coastal-battery', 'cruiser'] },
      }),
      mission('tide-break', '奥特朗托海峡海战', {
        1: { name: '海峡外哨', objective: '从岸防炮台和轻型战斗机的警戒圈切入。', air: ['scout', 'gunship'], sea: ['coastal-battery'] },
        2: { name: '封锁缺口', objective: '击退海峡里的巡逻艇，再摧毁补给油库。', air: ['scout', 'diver'], sea: ['patrol-boat', 'oil-depot'] },
        4: { name: '海峡巡防', objective: '突破驱逐舰与巡洋舰的双重防空。', air: ['interceptor', 'torpedo'], sea: ['destroyer', 'cruiser'] },
        6: { name: '海峡补给', objective: '接收舰队补给，压制防空火力并截击敌方运输船。', air: ['scout', 'gunship'], sea: ['coastal-battery', 'transport'] },
        9: { name: '封锁线决战', objective: '突破驱逐舰的警戒，摧毁补给油库和岸防炮台。', air: ['diver', 'scout', 'interceptor'], sea: ['oil-depot', 'coastal-battery', 'destroyer'] },
      }),
    ],
  },
  {
    name: '第二次世界大战',
    craft: ['falcon', 'turtle'],
    missions: [
      mission('coral-sea', '珊瑚海海战', {
        2: { name: '鱼雷航道', objective: '拦截低空鱼雷机，清除航道巡逻艇。', air: ['torpedo', 'scout'], sea: ['patrol-boat', 'destroyer'] },
        7: { name: '双重警戒', objective: '穿过巡洋舰与驱逐舰的防空火力。', air: ['diver', 'torpedo'], sea: ['cruiser', 'destroyer'] },
      }),
      mission('island-counteroffensive', '中途岛海战', {
        1: { name: '岛链穿越', objective: '击破海岛炮台，越过敌方前哨。', air: ['scout', 'diver'], sea: ['coastal-battery'] },
        4: { name: '补给线截断', objective: '从敌驱逐舰掩护下截击运输船。', air: ['diver', 'gunship'], sea: ['transport', 'destroyer'] },
        9: { name: '岛上防空', objective: '摧毁岸防炮台和港口油库。', air: ['torpedo', 'diver'], sea: ['coastal-battery', 'oil-depot', 'cruiser'] },
      }),
      mission('carrier-screen', '菲律宾海海战', {
        1: { name: '舰队上空', objective: '在外海拦截逼近舰队的截击机和双发护航机。', air: ['interceptor', 'gunship'], sea: ['patrol-boat'] },
        2: { name: '雷道突袭', objective: '拦截鱼雷机，击沉护送它们前出的驱逐舰。', air: ['torpedo', 'gunship'], sea: ['destroyer'] },
        4: { name: '警戒弧线', objective: '击破巡洋舰的侧舷防空，再摧毁它护卫的油库。', air: ['diver', 'torpedo'], sea: ['cruiser', 'oil-depot'] },
        8: { name: '甲板上空', objective: '截击护航机和重型轰炸机，压制下方巡洋舰。', air: ['gunship', 'interceptor'], sea: ['cruiser'] },
        9: { name: '航母外圈', objective: '突破驱逐舰和巡洋舰，清开旗舰前的航路。', air: ['torpedo', 'diver', 'gunship'], sea: ['cruiser', 'destroyer'] },
      }),
      mission('night-harbor', '吴港空袭', {
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
        1: { name: '港外遭遇', objective: '拦截高速突击机，打开通往港区的航道。', air: ['dart', 'scout'], sea: ['patrol-boat'] },
        4: { name: '港口接近', objective: '避开横切机并破坏驱逐舰舰桥。', air: ['interceptor', 'dart'], sea: ['destroyer', 'patrol-boat'] },
        7: { name: '交叉航线', objective: '从高速机和护航机的交错航线穿过。', air: ['dart', 'gunship'], sea: ['cruiser', 'transport'] },
      }),
      mission('deep-sea-watch', '塞得港登陆', {
        2: { name: '护卫试探', objective: '突破鱼雷机与岸防炮台的前哨。', air: ['interceptor', 'torpedo'], sea: ['coastal-battery'] },
        7: { name: '港外编队', objective: '躲开高速突击，压制巡洋舰防空炮。', air: ['dart', 'interceptor'], sea: ['cruiser', 'patrol-boat'] },
        9: { name: '封港行动', objective: '摧毁油库，打散驱逐舰编队。', air: ['gunship', 'interceptor'], sea: ['destroyer', 'oil-depot', 'coastal-battery'] },
      }),
      mission('ice-passage', '圣卡洛斯湾登陆', {
        1: { name: '湾口巡线', objective: '避开高速机掠袭，压制巡逻艇与岸防炮台。', air: ['dart', 'scout'], sea: ['patrol-boat', 'coastal-battery'] },
        2: { name: '湾内航道', objective: '穿过截击机的横向航线，击沉运输船与护卫驱逐舰。', air: ['dart', 'interceptor'], sea: ['destroyer', 'transport'] },
        4: { name: '近岸追击', objective: '在高速机回袭前切断驱逐舰和巡逻艇的队形。', air: ['dart', 'gunship'], sea: ['destroyer', 'patrol-boat'] },
        7: { name: '锚地警戒', objective: '击破守在锚地外的炮台和巡洋舰。', air: ['interceptor', 'torpedo'], sea: ['coastal-battery', 'cruiser'] },
        9: { name: '湾口突破', objective: '穿过高速机和双发护航机的拦截，突破外海防线。', air: ['dart', 'gunship', 'interceptor'], sea: ['cruiser', 'destroyer'] },
      }),
      mission('relay-island', '祈祷螳螂行动', {
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
      mission('offshore-screen', '科索沃空中战役', {
        1: { name: '先遣屏障', objective: '拦截高速机与横切截击机。', air: ['dart', 'interceptor'], sea: ['patrol-boat'] },
        4: { name: '多层防御', objective: '同时压制巡洋舰和岸防炮台。', air: ['diver', 'dart'], sea: ['cruiser', 'coastal-battery'] },
        9: { name: '战区突破', objective: '穿过三类战机协防的舰队防线。', air: ['interceptor', 'gunship', 'dart'], sea: ['destroyer', 'cruiser', 'transport'] },
      }),
      mission('strait-recovery', '阿富汗空中战役', {
        1: { name: '接应航线', objective: '清理航线前方的驱逐舰，防备横切截击。', air: ['interceptor', 'dart'], sea: ['destroyer'] },
        3: { name: '航母编队护航', objective: '在航母编队周边保护蓝旗运输船，拦截鱼雷机和重型轰炸机。', air: ['torpedo', 'diver'], sea: ['patrol-boat', 'cruiser'] },
        4: { name: '海上外围警戒', objective: '拦截低空鱼雷机，击破防空巡洋舰。', air: ['dart', 'diver', 'torpedo'], sea: ['coastal-battery', 'cruiser'] },
        7: { name: '舰队换防', objective: '穿过高速突击机编队，击破巡洋舰与驱逐舰。', air: ['gunship', 'dart', 'torpedo'], sea: ['cruiser', 'destroyer'] },
        9: { name: '外海接应', objective: '击破航道前方的舰艇，避开防空火力。', air: ['torpedo', 'interceptor', 'dart'], sea: ['patrol-boat', 'destroyer', 'coastal-battery'] },
      }),
      mission('fleet-crossing', '法奥半岛登陆', {
        1: { name: '第一道警戒', objective: '拦截高速先遣机，击沉海上警戒驱逐舰。', air: ['dart', 'gunship'], sea: ['destroyer'] },
        2: { name: '补给枢纽', objective: '切断敌方油库与运输船之间的补给线。', air: ['interceptor', 'diver'], sea: ['oil-depot', 'transport'] },
        4: { name: '防空纵深', objective: '穿过俯冲机和高速机的夹击，击破巡逻艇、驱逐舰与巡洋舰。', air: ['dart', 'diver', 'gunship'], sea: ['cruiser', 'destroyer', 'patrol-boat'] },
        7: { name: '外层编队', objective: '击沉敌巡洋舰，阻止护航机接近我方航线。', air: ['gunship', 'torpedo', 'interceptor'], sea: ['cruiser', 'patrol-boat'] },
        9: { name: '决战走廊', objective: '击穿最后的三舰防空线，为下一波首领战打开走廊。', air: ['dart', 'gunship', 'torpedo'], sea: ['destroyer', 'cruiser', 'patrol-boat'] },
      }),
      mission('skyline', '统一保护者行动', {
        2: { name: '快速反应', objective: '拦截快速编队，为舰队打开窗口。', air: ['dart', 'gunship'], sea: ['patrol-boat', 'coastal-battery'] },
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

export function isStageUnlocked(index: number, cleared: ReadonlySet<string>): boolean {
  const stage = CAMPAIGN_STAGES[index];
  return !!stage && (cleared.has(stage.mission.id) || index === firstUnclearedStageIndex(cleared));
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
