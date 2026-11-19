import type { AirKind, ShipKind } from './types.ts';

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
export interface WaveInfo { name: string; objective: string; air: AirKind[]; sea: ShipKind[] }
export const WAVES: [WaveInfo, ...WaveInfo[]] = [
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

export function waveInfo(wave: number): WaveInfo {
  return WAVES[wave - 1] ?? WAVES[0];
}
