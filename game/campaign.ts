import type { AirKind, ShipKind } from './types.ts';

export interface UnitInfo { id: AirKind | ShipKind; name: string; role: string; tactic: string; silhouette: string }
export const UNIT_INFO: UnitInfo[] = [
  { id: 'scout', name: '轻型战斗机', role: '空中 · 编队巡航', tactic: '机炮拦截，留意单发瞄准弹。', silhouette: '单发螺旋桨 / 椭圆翼' },
  { id: 'interceptor', name: '横切截击机', role: '空中 · 侧翼突入', tactic: '从两侧横穿航线，提前向前方射击。', silhouette: '短机身 / 宽直翼' },
  { id: 'diver', name: '俯冲轰炸机', role: '空中 · 预警后直线俯冲', tactic: '虚线锁定后移开，俯冲方向不会追踪。', silhouette: '倒海鸥翼 / 固定起落架' },
  { id: 'torpedo', name: '鱼雷攻击机', role: '空中 · 低空袭舰', tactic: '优先拦截，海面鱼雷会威胁护航运输船。', silhouette: '长机身 / 腹部鱼雷' },
  { id: 'heavy-bomber', name: '重型轰炸机', role: '空中 · 精英编队', tactic: '集中火力击破，航弹能快速清理护航机。', silhouette: '多发动机 / 双垂尾' },
  { id: 'gunship', name: '双发护航机', role: '空中 · 扇形射击', tactic: '穿过扇形弹幕间隙，避开中央机身。', silhouette: '双发动机 / 重装机翼' },
  { id: 'dart', name: '高速突击机', role: '空中 · 快速穿场', tactic: '保持机动，留出迎面交错空间。', silhouette: '收窄机翼 / 轻型机身' },
  { id: 'patrol-boat', name: '巡逻艇', role: '海面 · 单座防空炮', tactic: '横向对准船体，自动投弹即可击破。', silhouette: '细长艇身 / 低矮驾驶舱' },
  { id: 'destroyer', name: '驱逐舰', role: '海面 · 双舷防空', tactic: '对准两侧炮位投弹，可逐一压制火力。', silhouette: '修长舰体 / 双烟囱' },
  { id: 'cruiser', name: '防空巡洋舰', role: '海面 · 密集交错弹', tactic: '先拆一侧防空炮，为下一轮进攻打开通道。', silhouette: '宽甲板 / 多座高射炮' },
  { id: 'battleship', name: '铁岳', role: '第 5 波首领 · 战列舰', tactic: '拆防空炮减少弹幕，摧毁舰桥减慢齐射。舰体始终可攻击。', silhouette: '三联装主炮 / 厚重舰桥' },
  { id: 'fleet-carrier', name: '赤潮', role: '第 10 波首领 · 航母', tactic: '摧毁飞行甲板停止新机起飞，已升空敌机仍需拦截。', silhouette: '全通飞行甲板 / 右舷舰岛' },
  { id: 'coastal-battery', name: '海岛炮台', role: '岸防 · 固定防空阵地', tactic: '对准炮位自动投弹，摧毁后不再射击。', silhouette: '沙地工事 / 双联炮管' },
  { id: 'oil-depot', name: '港口油库', role: '岸防 · 连锁爆炸', tactic: '击破油罐能打击附近敌军并清除局部敌弹。', silhouette: '储油罐 / 港口栈桥' },
  { id: 'transport', name: '敌方运输船', role: '海面 · 补给目标', tactic: '击沉获得额外补给；蓝旗运输船则是友军。', silhouette: '货箱 / 吊杆 / 小型舰桥' },
];
export interface WaveInfo { name: string; objective: string; air: AirKind[]; sea: ShipKind[] }
export const WAVES: WaveInfo[] = [
  { name: '舰队启航', objective: '从友军航母起飞，拦截前方战斗机。', air: ['scout'], sea: [] },
  { name: '外海警戒', objective: '击退横切截击机与巡逻艇。', air: ['scout', 'interceptor'], sea: ['patrol-boat'] },
  { name: '运输船队', objective: '保护蓝旗运输船，优先拦截鱼雷机与重型轰炸机。', air: ['torpedo', 'gunship'], sea: ['patrol-boat'] },
  { name: '驱逐舰防线', objective: '对准炮位自动投弹，打开舰队防线。', air: ['interceptor', 'diver'], sea: ['destroyer'] },
  { name: '铁岳决战', objective: '压制双舷防空炮，击沉战列舰「铁岳」。', air: [], sea: ['battleship'] },
  { name: '海岛补给站', objective: '装甲与航弹补给，摧毁炮台、港口油库及运输船。', air: ['scout', 'dart'], sea: ['coastal-battery', 'oil-depot', 'transport'] },
  { name: '交错火网', objective: '在巡洋舰与俯冲轰炸机的交错攻击中突围。', air: ['diver', 'gunship'], sea: ['cruiser'] },
  { name: '舰载机群', objective: '拦截鱼雷机，迎战重型轰炸机精英。', air: ['torpedo', 'interceptor'], sea: ['transport', 'patrol-boat'] },
  { name: '最后护卫线', objective: '突破驱逐舰、巡洋舰与岸防阵地。', air: ['diver', 'dart', 'interceptor'], sea: ['destroyer', 'cruiser', 'coastal-battery'] },
  { name: '赤潮终局', objective: '炸毁飞行甲板，击沉航母「赤潮」。', air: [], sea: ['fleet-carrier'] },
];
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
