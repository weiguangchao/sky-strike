import type { ShipKind, PartId, Point } from './types.ts';
import { HULLS } from './campaign.ts';
import { US_CLASS_SHIPS, EXISTING_US_CLASSES } from './us-fleet.ts';

export type NavalHull = Exclude<ShipKind, 'coastal-battery' | 'oil-depot'>;
export const NAVAL_HULLS = ['patrol-boat', 'destroyer', 'cruiser', 'battleship', 'fleet-carrier', 'transport'] as const satisfies readonly NavalHull[];
export const isNavalHull = (value: unknown): value is NavalHull => NAVAL_HULLS.some(hull => hull === value);
export const NAVIES = [
  {id:'us',name:'美国'}, {id:'gb',name:'英国'}, {id:'jp',name:'日本'},
  {id:'de',name:'德国'}, {id:'it',name:'意大利'}, {id:'fr',name:'法国'},
  {id:'su',name:'苏联'}, {id:'cn',name:'中国'}, {id:'nl',name:'荷兰'},
  {id:'pl',name:'波兰'}, {id:'ca',name:'加拿大'}, {id:'au',name:'澳大利亚'},
  {id:'nz',name:'新西兰'}, {id:'no',name:'挪威'}, {id:'gr',name:'希腊'},
  {id:'yu',name:'南斯拉夫'}, {id:'fi',name:'芬兰'}, {id:'ro',name:'罗马尼亚'},
  {id:'th',name:'泰国'}, {id:'br',name:'巴西'}, {id:'in',name:'英属印度'},
  {id:'za',name:'南非'}, {id:'dk',name:'丹麦'},
] as const;
export type NavyId = typeof NAVIES[number]['id'];
export type HistoricalKind = '战列舰' | '战列巡洋舰' | '航空母舰' | '轻型航空母舰' | '护航航空母舰' | '训练航空母舰' | '大型巡洋舰' | '指挥巡洋舰' | '导弹巡洋舰' | '核动力巡洋舰' | '导弹驱逐舰' | '驱逐领舰' | '重巡洋舰' | '轻巡洋舰' | '装甲巡洋舰' | '装甲舰' | '驱逐舰' | '岸防舰' | '护卫舰' | '扫雷护航舰' | '鱼雷艇' | '武装运输船' | '炮舰';
export interface MainMount { barrels:number; y:number; x:number; raised:number; bearing:number; calibre?:number }
export interface NavalLauncher {
  kind:'twin'|'single'|'talos'|'asroc'|'alpha'|'vls'; x:number; y:number;
  rows?:number; columns?:number; bearing?:number;
}
export interface NavalGeometry {
  length:number; beam:number; calibre:number; guns:readonly MainMount[];
  funnels:readonly number[]; bridge:'tower'|'pagoda'|'tripod'|'low'|'island'; bridgeY:number;
  islandSide?:-1|1; lifts?:readonly (readonly [number,number])[];
  deck?:'wood'|'steel'|'armoured'|'linoleum'; funnelStyle?:'raked'|'trunked'|'side';
  torpedoes?:number; catapults?:number; catapultStations?:readonly (readonly [number,number,number,number?])[]; openGuns?:boolean; bowStripes?:boolean;
  secondary?:readonly MainMount[];
  flightDeck?:'angled'; aviation?:'jet'; islandless?:boolean; paddleWheels?:boolean;
  radar?:'lattice'|'planar'|'aegis'|'stealth'; launchers?:readonly NavalLauncher[];
  hangar?:boolean; helipad?:boolean; hullStyle?:'forecastle'|'tumblehome';
  bridgeWidth?:number; bridgeHeight?:number;
  torpedoTubes?:number; roundFunnels?:boolean;
  funnelCant?:number;
}
export interface HistoricalShip {
  id:string; name:string; navy:NavyId; year:number; kind:HistoricalKind; hull:NavalHull;
  source:string; feature:string; geometry:NavalGeometry;
  classId?:string; className?:string;
}
// Superfiring bores must clear the lower gunhouse at the game's pixel scale.
const mount=({ barrels, y, x = 0, raised = 0, bearing = y<0?180:0 }: { barrels: number; y: number; x?: number; raised?: number; bearing?: number }):MainMount=>({barrels,y,x,raised:raised?Math.max(.16,raised):0,bearing});
const triple=(barrels=3)=>[mount({ barrels, y: .69 }),mount({ barrels, y: .41, x: 0, raised: .10 }),mount({ barrels, y: -.58 })];
const four=(barrels=2)=>[mount({ barrels, y: .72 }),mount({ barrels, y: .46, x: 0, raised: .10 }),mount({ barrels, y: -.46, x: 0, raised: .10 }),mount({ barrels, y: -.72 })];
const two=(barrels=2)=>[mount({ barrels, y: .71 }),mount({ barrels, y: -.71 })];
const secondaryPairs=({barrels,calibre,stations}:{barrels:number;calibre:number;stations:readonly number[]})=>[-1,1].flatMap(side=>stations.map(y=>({...mount({ barrels, y, x: side*.61, raised: 0, bearing: -side*90 }),calibre})));
const fiveSingle=()=>[mount({ barrels: 1, y: .74 }),mount({ barrels: 1, y: .50, x: 0, raised: .08 }),mount({ barrels: 1, y: -.30, x: 0, raised: 0, bearing: 90 }),mount({ barrels: 1, y: -.53, x: 0, raised: .08 }),mount({ barrels: 1, y: -.75 })];
const broadside=(count:number)=>[
  mount({ barrels: 1, y: .81 }),mount({ barrels: 1, y: -.81 }),
  ...Array.from({length:(count-2)/2},(_,i)=>[-1,1].map(side=>mount({ barrels: 1, y: .49-i*.98/((count-2)/2-1), x: side*.68, raised: 0, bearing: -side*90 }))).flat(),
];
const ref=(path:string)=>`https://www.navypedia.org/ships/${path}.htm`;
function ship<const Id extends string>({ id, name, navy, year, kind, hull, path, feature, geometry }: Pick<HistoricalShip, 'name' | 'navy' | 'year' | 'kind' | 'hull' | 'feature' | 'geometry'> & { id: Id; path: string }):HistoricalShip&{id:Id} {
  return {id,name,navy,year,kind,hull,source:path.startsWith('https:')?path:ref(path),feature,geometry,...EXISTING_US_CLASSES[id]};
}

export const HISTORICAL_SHIPS = [
  // The original international selection keeps its wartime appearance dates.
  ship({ id: 'iowa', name: '衣阿华', navy: 'us', year: 1944, kind: '战列舰', hull: 'battleship', path: 'usa/us_bb_iowa', feature: '修长舰艏 · 三座三联主炮 · 双烟囱',
    geometry: {length:270.4,beam:33,calibre:406,guns:triple(),funnels:[.06,-.26],bridge:'tower',bridgeY:.29,catapults:2,secondary:secondaryPairs({ barrels: 2, calibre: 127, stations: [.24, .07, -.10, -.27, -.43] })} }),
  ship({ id: 'south-dakota', name: '南达科他', navy: 'us', year: 1942, kind: '战列舰', hull: 'battleship', path: 'usa/us_bb_sdakota', feature: '紧凑宽舰体 · 三联主炮 · 单烟囱',
    geometry: {length:207.3,beam:33,calibre:406,guns:triple(),funnels:[-.12],bridge:'tower',bridgeY:.25,catapults:2,secondary:secondaryPairs({ barrels: 2, calibre: 127, stations: [.22, .04, -.17, -.37] })} }),
  ship({ id: 'arizona', name: '亚利桑那', navy: 'us', year: 1941, kind: '战列舰', hull: 'battleship', path: 'usa/us_bb_pennsylvania', feature: '四座三联主炮 · 三脚桅 · 单烟囱',
    geometry: {length:185.3,beam:32.4,calibre:356,guns:four(3),funnels:[-.10],bridge:'tripod',bridgeY:.27,catapults:2} }),
  ship({ id: 'enterprise', name: '企业 CV-6', navy: 'us', year: 1942, kind: '航空母舰', hull: 'fleet-carrier', path: 'usa/us_cv_yorktown', feature: '直通木甲板 · 右舷舰岛 · 三部升降机',
    geometry: {length:251.4,beam:33.4,calibre:127,guns:[],funnels:[.10],bridge:'island',bridgeY:.16,lifts:[[0,.57],[0,-.02],[0,-.61]],islandSide:1} }),
  ship({ id: 'essex', name: '埃塞克斯', navy: 'us', year: 1944, kind: '航空母舰', hull: 'fleet-carrier', path: 'usa/us_cv_essex', feature: '直通甲板 · 左舷舷侧升降机 · 大舰岛',
    geometry: {length:265.8,beam:45,calibre:127,guns:[],funnels:[.02],bridge:'island',bridgeY:.19,lifts:[[0,.57],[-.83,.04],[0,-.62]],islandSide:1} }),
  ship({ id: 'fletcher', name: '弗莱彻', navy: 'us', year: 1942, kind: '驱逐舰', hull: 'destroyer', path: 'usa/us_dd_fletcher', feature: '五座单装炮 · 双烟囱 · 两组鱼雷管',
    geometry: {length:114.7,beam:12.1,calibre:127,guns:fiveSingle(),funnels:[.15,-.08],bridge:'low',bridgeY:.38,torpedoes:2,torpedoTubes:5,deck:'steel'} }),
  ship({ id: 'cleveland', name: '克利夫兰', navy: 'us', year: 1943, kind: '轻巡洋舰', hull: 'cruiser', path: 'usa/us_cr_cleveland', feature: '四座三联炮 · 双烟囱 · 舰艉弹射器',
    geometry: {length:186,beam:20.2,calibre:152,guns:four(3),funnels:[.06,-.23],bridge:'tower',bridgeY:.29,catapults:2} }),
  ship({ id: 'brooklyn', name: '布鲁克林', navy: 'us', year: 1942, kind: '轻巡洋舰', hull: 'cruiser', path: 'usa/us_cr_brooklyn', feature: '前三后二共五座三联炮 · 双烟囱',
    geometry: {length:185.4,beam:18.8,calibre:152,guns:[mount({ barrels: 3, y: .83 }),mount({ barrels: 3, y: .64, x: 0, raised: .09 }),mount({ barrels: 3, y: .43, x: 0, raised: 0, bearing: 180 }),mount({ barrels: 3, y: -.55, x: 0, raised: .09 }),mount({ barrels: 3, y: -.79 })],funnels:[.04,-.23],bridge:'tower',bridgeY:.12,catapults:2} }),
  ship({ id: 'pt-109', name: 'PT-109', navy: 'us', year: 1943, kind: '鱼雷艇', hull: 'patrol-boat', path: 'usa/us_pt_pt103', feature: '低矮驾驶舱 · 四根鱼雷管 · 艉部机炮',
    geometry: {length:24.4,beam:6.3,calibre:20,guns:[],funnels:[],bridge:'low',bridgeY:.28,torpedoes:4,deck:'steel'} }),
  ship({ id: 'john-w-brown', name: '约翰·布朗', navy: 'us', year: 1944, kind: '武装运输船', hull: 'transport', path: 'https://www.ssjohnwbrown.org/history', feature: '自由轮 · 中部驾驶台 · 五货舱与吊杆',
    geometry: {length:134.6,beam:17.3,calibre:127,guns:[mount({ barrels: 1, y: -.85 })],funnels:[-.08],bridge:'low',bridgeY:.12,deck:'steel'} }),
  ship({ id: 'missouri', name: '密苏里', navy: 'us', year: 1945, kind: '战列舰', hull: 'battleship', path: 'usa/us_bb_iowa', feature: '衣阿华级 · 三座三联406毫米炮 · 双烟囱',
    geometry: {length:270.4,beam:33,calibre:406,guns:triple(),funnels:[.06,-.26],bridge:'tower',bridgeY:.29,catapults:2,secondary:secondaryPairs({ barrels: 2, calibre: 127, stations: [.24, .07, -.10, -.27, -.43] })} }),
  ship({ id: 'baltimore', name: '巴尔的摩', navy: 'us', year: 1944, kind: '重巡洋舰', hull: 'cruiser', path: 'usa/us_cr_baltimore', feature: '三座三联203毫米炮 · 双烟囱 · 艉部机库',
    geometry: {length:205.3,beam:21.6,calibre:203,guns:triple(),funnels:[.04,-.24],bridge:'tower',bridgeY:.29,catapults:2} }),

  ship({ id: 'warspite', name: '厌战', navy: 'gb', year: 1942, kind: '战列舰', hull: 'battleship', path: 'uk/brit_bb1_queen_elizabeth', feature: '四座双联主炮 · 重建塔桥 · 单烟囱',
    geometry: {length:196.8,beam:31.7,calibre:381,guns:four(),funnels:[-.12],bridge:'tower',bridgeY:.26,catapults:1,catapultStations:[[0,-.31,90]]} }),
  ship({ id: 'king-george-v', name: '乔治五世', navy: 'gb', year: 1941, kind: '战列舰', hull: 'battleship', path: 'uk/brit_bb1_king_george_v', feature: '前四联加双联、后四联 · 双烟囱',
    geometry: {length:227.1,beam:31.4,calibre:356,guns:[mount({ barrels: 4, y: .72 }),mount({ barrels: 2, y: .44, x: 0, raised: .12 }),mount({ barrels: 4, y: -.65 })],funnels:[.03,-.25],bridge:'tower',bridgeY:.28,catapults:1,secondary:secondaryPairs({ barrels: 2, calibre: 133, stations: [.24, .06, -.14, -.34] }),catapultStations:[[0,-.10,90]]} }),
  ship({ id: 'hood', name: '胡德', navy: 'gb', year: 1941, kind: '战列巡洋舰', hull: 'battleship', path: 'uk/brit_bb1_hood', feature: '长舰体 · 四座双联炮 · 分隔双烟囱',
    geometry: {length:262.1,beam:31.7,calibre:381,guns:four(),funnels:[.05,-.24],bridge:'tripod',bridgeY:.29} }),
  ship({ id: 'rodney', name: '罗德尼', navy: 'gb', year: 1941, kind: '战列舰', hull: 'battleship', path: 'uk/brit_bb1_nelson', feature: '三座三联炮全部前置 · 后置塔桥',
    geometry: {length:216.4,beam:32.3,calibre:406,guns:[mount({ barrels: 3, y: .75 }),mount({ barrels: 3, y: .50, x: 0, raised: .12 }),mount({ barrels: 3, y: .25, x: 0, raised: 0, bearing: 60 })],funnels:[-.43],bridge:'tower',bridgeY:-.06,secondary:secondaryPairs({ barrels: 2, calibre: 152, stations: [-.34, -.55, -.74] })} }),
  ship({ id: 'ark-royal', name: '皇家方舟', navy: 'gb', year: 1941, kind: '航空母舰', hull: 'fleet-carrier', path: 'uk/brit_cv1_ark_royal', feature: '圆弧舰艏 · 右舷舰岛 · 三部升降机',
    geometry: {length:243.8,beam:29,calibre:114,guns:[],funnels:[-.01],bridge:'island',bridgeY:.16,lifts:[[0,.57],[0,.03],[0,-.58]],islandSide:1} }),
  ship({ id: 'illustrious', name: '光辉', navy: 'gb', year: 1940, kind: '航空母舰', hull: 'fleet-carrier', path: 'uk/brit_cv1_illustrious', feature: '装甲直通甲板 · 两部升降机 · 右舷舰岛',
    geometry: {length:229.6,beam:32.5,calibre:114,guns:[],funnels:[-.01],bridge:'island',bridgeY:.18,lifts:[[0,.54],[0,-.59]],islandSide:1,deck:'armoured'} }),
  ship({ id: 'cossack', name: '哥萨克', navy: 'gb', year: 1939, kind: '驱逐舰', hull: 'destroyer', path: 'uk/brit_dd_tribal', feature: '部族级 · 四座双联主炮 · 双烟囱',
    geometry: {length:114.9,beam:11.1,calibre:120,guns:four(),funnels:[.13,-.13],bridge:'low',bridgeY:.36,torpedoes:1,deck:'steel'} }),
  ship({ id: 'belfast', name: '贝尔法斯特', navy: 'gb', year: 1943, kind: '轻巡洋舰', hull: 'cruiser', path: 'uk/brit_cr_edinburgh', feature: '四座三联152毫米炮 · 双烟囱 · 中部航空区',
    geometry: {length:187,beam:20.2,calibre:152,guns:four(3),funnels:[.09,-.25],bridge:'tower',bridgeY:.30,torpedoes:2,catapults:1,catapultStations:[[0,-.07,90]]} }),
  ship({ id: 'renown', name: '声望', navy: 'gb', year: 1944, kind: '战列巡洋舰', hull: 'battleship', path: 'uk/brit_bb1_renown16', feature: '长舰体 · 三座双联381毫米炮 · 双烟囱',
    geometry: {length:242,beam:31.3,calibre:381,guns:triple(2),funnels:[.06,-.25],bridge:'tower',bridgeY:.28} }),

  ship({ id: 'yamato', name: '大和', navy: 'jp', year: 1945, kind: '战列舰', hull: 'battleship', path: 'japan/jap_bb_yamato', feature: '三座三联巨炮 · 塔式舰桥 · 后部航空甲板',
    geometry: {length:263,beam:36.9,calibre:460,guns:triple(),funnels:[-.10],bridge:'tower',bridgeY:.06,catapults:2,secondary:[{...mount({ barrels: 3, y: .23, x: 0, raised: .40 }),calibre:155},{...mount({ barrels: 3, y: -.35, x: 0, raised: .25 }),calibre:155}]} }),
  ship({ id: 'nagato', name: '长门', navy: 'jp', year: 1944, kind: '战列舰', hull: 'battleship', path: 'japan/jap_bb_nagato', feature: '四座双联炮 · 高耸舰桥 · 单烟囱',
    geometry: {length:224.9,beam:33,calibre:410,guns:four(),funnels:[-.09],bridge:'pagoda',bridgeY:.28,catapults:1,catapultStations:[[0,-.31,90]]} }),
  ship({ id: 'kongo', name: '金刚', navy: 'jp', year: 1944, kind: '战列舰', hull: 'battleship', path: 'japan/jap_bb_kongo', feature: '修长高速舰体 · 四座双联炮 · 双烟囱',
    geometry: {length:222.1,beam:29.3,calibre:356,guns:four(),funnels:[.04,-.25],bridge:'pagoda',bridgeY:.28,catapults:1,catapultStations:[[.50,-.36,-70,1]]} }),
  ship({ id: 'akagi', name: '赤城', navy: 'jp', year: 1942, kind: '航空母舰', hull: 'fleet-carrier', path: 'japan/jap_cv_akagi', feature: '左舷舰岛 · 右舷下弯烟道 · 三部升降机',
    geometry: {length:260.7,beam:31.3,calibre:127,guns:[],funnels:[.0],bridge:'island',bridgeY:.05,lifts:[[0,.57],[0,-.02],[0,-.62]],islandSide:-1,funnelStyle:'side'} }),
  ship({ id: 'kaga', name: '加贺', navy: 'jp', year: 1942, kind: '航空母舰', hull: 'fleet-carrier', path: 'japan/jap_cv_kaga', feature: '宽阔木甲板 · 右舷舰岛 · 下弯烟道',
    geometry: {length:248.6,beam:32.5,calibre:127,guns:[],funnels:[-.08],bridge:'island',bridgeY:.24,lifts:[[0,.57],[0,-.02],[0,-.62]],islandSide:1,funnelStyle:'side'} }),
  ship({ id: 'shokaku', name: '翔鹤', navy: 'jp', year: 1942, kind: '航空母舰', hull: 'fleet-carrier', path: 'japan/jap_cv_shokaku', feature: '细长甲板 · 小舰岛 · 右舷双烟道',
    geometry: {length:257.5,beam:29,calibre:127,guns:[],funnels:[-.02,-.22],bridge:'island',bridgeY:.28,lifts:[[0,.55],[0,-.04],[0,-.61]],islandSide:1,funnelStyle:'side'} }),
  ship({ id: 'mogami', name: '最上', navy: 'jp', year: 1941, kind: '重巡洋舰', hull: 'cruiser', path: 'japan/jap_cr_mogami', feature: '改装后五座双联203毫米炮 · 集中舰桥',
    geometry: {length:200.6,beam:19,calibre:203,guns:[mount({ barrels: 2, y: .83 }),mount({ barrels: 2, y: .64, x: 0, raised: 0, bearing: 90 }),mount({ barrels: 2, y: .44, x: 0, raised: .11 }),mount({ barrels: 2, y: -.56, x: 0, raised: .09 }),mount({ barrels: 2, y: -.80 })],funnels:[.02,-.22],bridge:'pagoda',bridgeY:.24,torpedoes:4,catapults:2,funnelStyle:'trunked',deck:'linoleum',catapultStations:[[-.50,-.35,90,1],[.50,-.35,-90,1]]} }),
  ship({ id: 'fubuki', name: '吹雪', navy: 'jp', year: 1941, kind: '驱逐舰', hull: 'destroyer', path: 'japan/jap_dd_fubuki', feature: '前一后二的三座双联炮 · 三组鱼雷管',
    geometry: {length:118.4,beam:10.4,calibre:127,guns:[mount({ barrels: 2, y: .78 }),mount({ barrels: 2, y: -.52, x: 0, raised: .08 }),mount({ barrels: 2, y: -.78 })],funnels:[.21,-.05],bridge:'low',bridgeY:.43,torpedoes:3,deck:'linoleum'} }),
  ship({ id: 'hiryu', name: '飞龙', navy: 'jp', year: 1942, kind: '航空母舰', hull: 'fleet-carrier', path: 'japan/jap_cv_hiryu', feature: '左舷舰岛 · 右舷双烟道 · 三部升降机',
    geometry: {length:227.4,beam:27,calibre:127,guns:[],funnels:[.02,-.18],bridge:'island',bridgeY:.15,lifts:[[0,.55],[0,-.02],[0,-.59]],islandSide:-1,funnelStyle:'side'} }),
  ship({ id: 'soryu', name: '苍龙', navy: 'jp', year: 1942, kind: '航空母舰', hull: 'fleet-carrier', path: 'japan/jap_cv_soryu', feature: '右舷前置小舰岛 · 右舷双烟道',
    geometry: {length:227.5,beam:26,calibre:127,guns:[],funnels:[-.01,-.21],bridge:'island',bridgeY:.31,lifts:[[0,.56],[0,-.02],[0,-.59]],islandSide:1,funnelStyle:'side'} }),
  ship({ id: 'shinano', name: '信浓', navy: 'jp', year: 1944, kind: '航空母舰', hull: 'fleet-carrier', path: 'japan/jap_cv_shinano', feature: '大和级船体改装 · 装甲甲板 · 大型右舷舰岛',
    geometry: {length:266,beam:41.5,calibre:127,guns:[],funnels:[-.02],bridge:'island',bridgeY:.18,lifts:[[0,.53],[0,-.58]],islandSide:1,funnelStyle:'trunked',deck:'armoured'} }),
  ship({ id: 'musashi', name: '武藏', navy: 'jp', year: 1944, kind: '战列舰', hull: 'battleship', path: 'japan/jap_bb_yamato', feature: '大和级 · 三座三联460毫米炮 · 宽阔航空艉甲板',
    geometry: {length:263,beam:36.9,calibre:460,guns:triple(),funnels:[-.10],bridge:'tower',bridgeY:.06,catapults:2,secondary:[{...mount({ barrels: 3, y: .23, x: 0, raised: .40 }),calibre:155},{...mount({ barrels: 3, y: -.35, x: 0, raised: .25 }),calibre:155}]} }),

  ship({ id: 'bismarck', name: '俾斯麦', navy: 'de', year: 1941, kind: '战列舰', hull: 'battleship', path: 'germany/ger_bb_bismarck', feature: '前后各两座双联主炮 · 单粗烟囱',
    geometry: {length:250,beam:36,calibre:380,guns:four(),funnels:[-.09],bridge:'tower',bridgeY:.27,catapults:2,secondary:secondaryPairs({ barrels: 2, calibre: 149, stations: [.25, -.07, -.36] }),catapultStations:[[-.36,-.24,90,.70],[.36,-.24,90,.70]]} }),
  ship({ id: 'scharnhorst', name: '沙恩霍斯特', navy: 'de', year: 1943, kind: '战列舰', hull: 'battleship', path: 'germany/ger_bb_scharnhorst', feature: '三座三联283毫米炮 · 单烟囱 · 飞剪艏',
    geometry: {length:234.9,beam:30,calibre:283,guns:triple(),funnels:[-.08],bridge:'tower',bridgeY:.28,catapults:1,catapultStations:[[0,-.31,90]]} }),
  ship({ id: 'graf-spee', name: '斯佩伯爵', navy: 'de', year: 1939, kind: '装甲舰', hull: 'cruiser', path: 'germany/ger_cr_deutschland', feature: '前后两座三联283毫米炮 · 高大塔桥',
    geometry: {length:186,beam:21.7,calibre:283,guns:two(3),funnels:[-.14],bridge:'tower',bridgeY:.36,catapults:1,torpedoes:2,catapultStations:[[0,-.34,90]]} }),
  ship({ id: 'prinz-eugen', name: '欧根亲王', navy: 'de', year: 1941, kind: '重巡洋舰', hull: 'cruiser', path: 'germany/ger_cr_eugen', feature: '四座双联炮 · 单烟囱 · 艉部机库',
    geometry: {length:207.7,beam:21.7,calibre:203,guns:four(),funnels:[-.05],bridge:'tower',bridgeY:.28,catapults:1,torpedoes:4,catapultStations:[[0,-.23,90]]} }),
  ship({ id: 'tirpitz', name: '提尔皮茨', navy: 'de', year: 1943, kind: '战列舰', hull: 'battleship', path: 'germany/ger_bb_bismarck', feature: '俾斯麦级 · 四座双联主炮 · 单粗烟囱',
    geometry: {length:253.6,beam:36,calibre:380,guns:four(),funnels:[-.09],bridge:'tower',bridgeY:.27,catapults:2,secondary:secondaryPairs({ barrels: 2, calibre: 149, stations: [.25, -.07, -.36] }),catapultStations:[[-.36,-.24,90,.70],[.36,-.24,90,.70]]} }),

  ship({ id: 'littorio', name: '利托里奥', navy: 'it', year: 1942, kind: '战列舰', hull: 'battleship', path: 'italy/it_bb_vittorio_veneto', feature: '三座三联381毫米炮 · 双烟囱 · 识别条纹艏',
    geometry: {length:237.8,beam:32.8,calibre:381,guns:triple(),funnels:[.05,-.23],bridge:'tower',bridgeY:.29,catapults:1,bowStripes:true,secondary:secondaryPairs({ barrels: 3, calibre: 152, stations: [.22, -.40] })} }),
  ship({ id: 'giulio-cesare', name: '朱利奥·凯撒', navy: 'it', year: 1940, kind: '战列舰', hull: 'battleship', path: 'italy/it_bb_giulio_cesare', feature: '重建舰艏 · 三联与双联混合炮塔 · 双烟囱',
    geometry: {length:186.4,beam:28.6,calibre:320,guns:[mount({ barrels: 3, y: .80 }),mount({ barrels: 2, y: .54, x: 0, raised: .09 }),mount({ barrels: 2, y: -.52, x: 0, raised: .09 }),mount({ barrels: 3, y: -.77 })],funnels:[.05,-.23],bridge:'tower',bridgeY:.28} }),
  ship({ id: 'zara', name: '扎拉', navy: 'it', year: 1941, kind: '重巡洋舰', hull: 'cruiser', path: 'italy/it_cr_zara', feature: '四座双联203毫米炮 · 双烟囱 · 艏部弹射器',
    geometry: {length:182.8,beam:20.6,calibre:203,guns:four(),funnels:[.06,-.23],bridge:'tower',bridgeY:.28,catapults:1,bowStripes:true} }),
  ship({ id: 'maestrale', name: '西北风', navy: 'it', year: 1940, kind: '驱逐舰', hull: 'destroyer', path: 'italy/it_dd_maestrale', feature: '前后双联炮 · 双烟囱 · 两组三联鱼雷管',
    geometry: {length:106.7,beam:10.2,calibre:120,guns:two(),funnels:[.18,-.11],bridge:'low',bridgeY:.42,torpedoes:2,deck:'steel'} }),
  ship({ id: 'roma', name: '罗马', navy: 'it', year: 1943, kind: '战列舰', hull: 'battleship', path: 'italy/it_bb_vittorio_veneto', feature: '利托里奥级 · 三座三联主炮 · 加长舰艏',
    geometry: {length:240.7,beam:32.8,calibre:381,guns:triple(),funnels:[.05,-.23],bridge:'tower',bridgeY:.29,catapults:1,bowStripes:true,secondary:secondaryPairs({ barrels: 3, calibre: 152, stations: [.22, -.40] })} }),

  ship({ id: 'richelieu', name: '黎塞留', navy: 'fr', year: 1940, kind: '战列舰', hull: 'battleship', path: 'france/fr_bb_richelieu', feature: '两座四联主炮全部前置 · 烟囱与后桅合一',
    geometry: {length:247.9,beam:33,calibre:380,guns:[mount({ barrels: 4, y: .72 }),mount({ barrels: 4, y: .43, x: 0, raised: .12 })],funnels:[-.23],bridge:'tower',bridgeY:.16,catapults:2,funnelStyle:'trunked',secondary:[...secondaryPairs({ barrels: 3, calibre: 152, stations: [-.48] }),{...mount({ barrels: 3, y: -.74 }),calibre:152}]} }),
  ship({ id: 'dunkerque', name: '敦刻尔克', navy: 'fr', year: 1940, kind: '战列舰', hull: 'battleship', path: 'france/fr_bb_dunkerque', feature: '两座前置四联330毫米炮 · 长后甲板',
    geometry: {length:215.1,beam:31.1,calibre:330,guns:[mount({ barrels: 4, y: .72 }),mount({ barrels: 4, y: .43, x: 0, raised: .12 })],funnels:[-.26],bridge:'tower',bridgeY:.16,catapults:1,secondary:[...secondaryPairs({ barrels: 4, calibre: 130, stations: [-.48] }),{...mount({ barrels: 4, y: -.74 }),calibre:130},...secondaryPairs({ barrels: 2, calibre: 130, stations: [-.10] })]} }),
  ship({ id: 'algerie', name: '阿尔及利亚', navy: 'fr', year: 1939, kind: '重巡洋舰', hull: 'cruiser', path: 'france/fr_cr_algerie', feature: '四座双联炮 · 方形塔桥 · 单烟囱',
    geometry: {length:186.2,beam:20,calibre:203,guns:four(),funnels:[-.10],bridge:'tower',bridgeY:.28,torpedoes:2,catapults:1,catapultStations:[[-.55,-.04,90,.85]]} }),
  ship({ id: 'le-fantasque', name: '空想', navy: 'fr', year: 1940, kind: '驱逐舰', hull: 'destroyer', path: 'france/fr_dd_le_fantasque', feature: '五座单装炮 · 两根大烟囱 · 三组鱼雷管',
    geometry: {length:132.4,beam:12.5,calibre:139,guns:fiveSingle(),funnels:[.16,-.08],bridge:'low',bridgeY:.39,torpedoes:3,openGuns:true,deck:'steel'} }),

  ship({ id: 'marat', name: '马拉', navy: 'su', year: 1940, kind: '战列舰', hull: 'battleship', path: 'russia/ru_bb_sevastopol', feature: '四座平甲板三联炮 · 双烟囱 · 前桅塔桥',
    geometry: {length:184.9,beam:27.3,calibre:305,guns:[mount({ barrels: 3, y: .80 }),mount({ barrels: 3, y: .22, x: 0, raised: 0, bearing: 90 }),mount({ barrels: 3, y: -.30, x: 0, raised: 0, bearing: 180 }),mount({ barrels: 3, y: -.79 })],funnels:[.39,-.10],bridge:'tripod',bridgeY:.57} }),
  ship({ id: 'kirov', name: '基洛夫', navy: 'su', year: 1941, kind: '轻巡洋舰', hull: 'cruiser', path: 'russia/ru_cr_kirov', feature: '三座三联180毫米炮 · 双烟囱 · 四脚前桅',
    geometry: {length:191.3,beam:17.7,calibre:180,guns:triple(),funnels:[.06,-.24],bridge:'tripod',bridgeY:.28,torpedoes:2,catapults:1,catapultStations:[[0,-.09,90]]} }),
  ship({ id: 'tashkent', name: '塔什干', navy: 'su', year: 1942, kind: '驱逐舰', hull: 'destroyer', path: 'russia/ru_dd_tashkent', feature: '蓝灰舰体 · 三座双联炮 · 双烟囱',
    geometry: {length:139.8,beam:13.7,calibre:130,guns:[mount({ barrels: 2, y: .79 }),mount({ barrels: 2, y: -.54, x: 0, raised: .08 }),mount({ barrels: 2, y: -.79 })],funnels:[.15,-.11],bridge:'low',bridgeY:.41,torpedoes:3,deck:'steel'} }),

  ship({ id: 'ning-hai', name: '宁海', navy: 'cn', year: 1937, kind: '轻巡洋舰', hull: 'cruiser', path: 'china/ch_cr_ning_hai', feature: '三座双联140毫米炮 · 双烟囱 · 小型机库',
    geometry: {length:109.7,beam:11.9,calibre:140,guns:[mount({ barrels: 2, y: .79 }),mount({ barrels: 2, y: -.52, x: 0, raised: .09 }),mount({ barrels: 2, y: -.78 })],funnels:[.14,-.15],bridge:'tripod',bridgeY:.42,torpedoes:2} }),
  ship({ id: 'yat-sen', name: '逸仙', navy: 'cn', year: 1937, kind: '炮舰', hull: 'destroyer', path: 'china/ch_of_i_hsien', feature: '艏艉单装大炮 · 低矮上层建筑 · 单烟囱',
    geometry: {length:83.8,beam:10.5,calibre:152,guns:two(1),funnels:[-.06],bridge:'low',bridgeY:.34,openGuns:true} }),

  ship({ id: 'de-ruyter', name: '德鲁伊特', navy: 'nl', year: 1942, kind: '轻巡洋舰', hull: 'cruiser', path: 'netherlands/nl_cr_de_ruyter', feature: '三座双联加一座单装炮 · 高塔桥 · 双烟囱',
    geometry: {length:170.8,beam:15.7,calibre:149,guns:[mount({ barrels: 2, y: .80 }),mount({ barrels: 1, y: .54, x: 0, raised: .10 }),mount({ barrels: 2, y: -.53, x: 0, raised: .10 }),mount({ barrels: 2, y: -.78 })],funnels:[.05,-.23],bridge:'tower',bridgeY:.28,catapults:1,catapultStations:[[0,-.36,90]]} }),
  ship({ id: 'java', name: '爪哇', navy: 'nl', year: 1942, kind: '轻巡洋舰', hull: 'cruiser', path: 'netherlands/nl_cr_java', feature: '十座单装炮 · 舷侧炮列 · 双烟囱',
    geometry: {length:155.3,beam:16,calibre:149,guns:[mount({ barrels: 1, y: .83 }),mount({ barrels: 1, y: .61 }),mount({ barrels: 1, y: -.59 }),mount({ barrels: 1, y: -.82 }),...[-1,1].flatMap(side=>[.36,.02,-.32].map(y=>mount({ barrels: 1, y, x: side*.68, raised: 0, bearing: -side*90 })))],funnels:[.15,-.17],bridge:'tripod',bridgeY:.43,openGuns:true} }),
  ship({ id: 'kortenaer', name: '科特纳尔', navy: 'nl', year: 1942, kind: '驱逐舰', hull: 'destroyer', path: 'netherlands/nl_dd_van_ghent', feature: '四座单装炮 · 双烟囱 · 两组鱼雷管',
    geometry: {length:98.2,beam:9.53,calibre:120,guns:four(1),funnels:[.13,-.12],bridge:'low',bridgeY:.36,torpedoes:2,openGuns:true,deck:'steel'} }),

  ship({ id: 'blyskawica', name: '闪电', navy: 'pl', year: 1939, kind: '驱逐舰', hull: 'destroyer', path: 'poland/pl_dd_grom', feature: '七门120毫米炮 · 前单装与双联混合 · 双烟囱',
    geometry: {length:114,beam:11.3,calibre:120,guns:[mount({ barrels: 1, y: .82 }),mount({ barrels: 2, y: .56, x: 0, raised: .08 }),mount({ barrels: 2, y: -.54, x: 0, raised: .08 }),mount({ barrels: 2, y: -.79 })],funnels:[.13,-.12],bridge:'low',bridgeY:.35,torpedoes:2,deck:'steel'} }),
  ship({ id: 'piorun', name: '雷电', navy: 'pl', year: 1941, kind: '驱逐舰', hull: 'destroyer', path: 'poland/pl_dd_piorun', feature: '三座双联主炮 · 单烟囱 · 五联鱼雷管',
    geometry: {length:108.7,beam:10.9,calibre:120,guns:triple(2),funnels:[-.04],bridge:'low',bridgeY:.29,torpedoes:1,deck:'steel'} }),
  ship({ id: 'haida', name: '海达人', navy: 'ca', year: 1943, kind: '驱逐舰', hull: 'destroyer', path: 'canada/can_dd_iroquois', feature: '部族级 · 三座120毫米双联主炮 · 双烟囱',
    geometry: {length:114.9,beam:11.4,calibre:120,guns:[mount({ barrels: 2, y: .80 }),mount({ barrels: 2, y: .54, x: 0, raised: .08 }),mount({ barrels: 2, y: -.79 })],funnels:[.13,-.12],bridge:'low',bridgeY:.34,torpedoes:1,deck:'steel'} }),
  ship({ id: 'sackville', name: '萨克维尔', navy: 'ca', year: 1942, kind: '护卫舰', hull: 'patrol-boat', path: 'canada/can_es_flower', feature: '花级护航舰 · 艏部单装炮 · 艉部深弹架',
    geometry: {length:62.5,beam:10.1,calibre:102,guns:[mount({ barrels: 1, y: .73 })],funnels:[-.08],bridge:'low',bridgeY:.30,openGuns:true,deck:'steel'} }),
  ship({ id: 'sydney', name: '悉尼 II', navy: 'au', year: 1941, kind: '轻巡洋舰', hull: 'cruiser', path: 'australia/aus_cr_sydney', feature: '四座双联炮 · 分隔双烟囱 · 中部弹射器',
    geometry: {length:171.4,beam:17.3,calibre:152,guns:four(),funnels:[.10,-.28],bridge:'tower',bridgeY:.30,torpedoes:2,catapults:1,catapultStations:[[0,-.07,90]]} }),
  ship({ id: 'australia', name: '澳大利亚 II', navy: 'au', year: 1943, kind: '重巡洋舰', hull: 'cruiser', path: 'australia/aus_cv_australia', feature: '郡级 · 四座双联203毫米炮 · 三烟囱',
    geometry: {length:192.9,beam:20.8,calibre:203,guns:four(),funnels:[.13,-.06,-.25],bridge:'tower',bridgeY:.32,torpedoes:2,catapults:1,catapultStations:[[0,-.35,90]]} }),
  ship({ id: 'achilles', name: '阿基里斯', navy: 'nz', year: 1942, kind: '轻巡洋舰', hull: 'cruiser', path: 'new_zealand/nz_cr_achilles', feature: '利安德级 · 四座双联炮 · 单粗烟囱',
    geometry: {length:169,beam:17,calibre:152,guns:four(),funnels:[-.09],bridge:'tower',bridgeY:.28,torpedoes:2,catapults:1,catapultStations:[[0,-.29,90]]} }),
  ship({ id: 'stord', name: '斯托尔德', navy: 'no', year: 1943, kind: '驱逐舰', hull: 'destroyer', path: 'norway/no_dd_stord', feature: '四座单装炮 · 单烟囱 · 两组四联鱼雷管',
    geometry: {length:110.6,beam:10.9,calibre:120,guns:four(1),funnels:[-.04],bridge:'low',bridgeY:.29,torpedoes:2,deck:'steel'} }),
  ship({ id: 'averof', name: '阿韦罗夫', navy: 'gr', year: 1941, kind: '装甲巡洋舰', hull: 'cruiser', path: 'greece/gr_cr_averof', feature: '艏艉双联234毫米炮 · 四座舷侧双联炮 · 三烟囱',
    geometry: {length:140.8,beam:21,calibre:234,guns:[...two(),...[-1,1].flatMap(side=>[.33,-.33].map(y=>mount({ barrels: 2, y, x: side*.68, raised: 0, bearing: -side*90 })))],funnels:[.18,-.04,-.26],bridge:'tripod',bridgeY:.48} }),
  ship({ id: 'dubrovnik', name: '杜布罗夫尼克', navy: 'yu', year: 1941, kind: '驱逐舰', hull: 'destroyer', path: 'yugoslavia/yu_dd_dubrovnik', feature: '四座单装140毫米炮 · 双烟囱 · 长艏楼',
    geometry: {length:113.2,beam:10.7,calibre:140,guns:four(1),funnels:[.12,-.14],bridge:'low',bridgeY:.35,torpedoes:2,openGuns:true,deck:'steel'} }),
  ship({ id: 'ilmarinen', name: '伊尔马里宁', navy: 'fi', year: 1941, kind: '岸防舰', hull: 'cruiser', path: 'finland/fi_bb_vainamoinen', feature: '短宽舰体 · 艏艉双联254毫米炮 · 高观测桅',
    geometry: {length:93,beam:16.9,calibre:254,guns:two(),funnels:[-.13],bridge:'tower',bridgeY:.30} }),
  ship({ id: 'regele-ferdinand', name: '费迪南德国王', navy: 'ro', year: 1941, kind: '驱逐舰', hull: 'destroyer', path: 'romania/ro_dd_regele_ferdinand', feature: '五座单装炮 · 双烟囱 · 两组三联鱼雷管',
    geometry: {length:102,beam:9.6,calibre:120,guns:fiveSingle(),funnels:[.13,-.10],bridge:'low',bridgeY:.37,torpedoes:2,openGuns:true,deck:'steel'} }),
  ship({ id: 'thonburi', name: '吞武里', navy: 'th', year: 1941, kind: '岸防舰', hull: 'cruiser', path: 'thailand/th_bb_sri_ayuthia', feature: '短宽舰体 · 艏艉双联203毫米炮 · 单烟囱',
    geometry: {length:76.5,beam:14.4,calibre:203,guns:two(),funnels:[-.14],bridge:'tower',bridgeY:.28} }),
  ship({ id: 'bahia', name: '巴伊亚', navy: 'br', year: 1944, kind: '轻巡洋舰', hull: 'cruiser', path: 'brazil/br_cr_bahia', feature: '十座单装炮 · 舷侧炮列 · 改装后三烟囱',
    geometry: {length:122.4,beam:11.9,calibre:120,guns:broadside(10),funnels:[.21,0,-.21],bridge:'low',bridgeY:.46,torpedoes:2,openGuns:true} }),
  ship({ id: 'bengal', name: '孟加拉', navy: 'in', year: 1942, kind: '扫雷护航舰', hull: 'patrol-boat', path: 'india/in_ms_punjab', feature: '巴瑟斯特级 · 艏部单装炮 · 扫雷深弹艉甲板',
    geometry: {length:56.7,beam:9.5,calibre:76,guns:[mount({ barrels: 1, y: .73 })],funnels:[-.08],bridge:'low',bridgeY:.30,openGuns:true,deck:'steel'} }),
  ship({ id: 'natal', name: '纳塔尔', navy: 'za', year: 1945, kind: '护卫舰', hull: 'destroyer', path: 'south_africa/saf_es_good_hope', feature: '湖级护卫舰 · 艏部单装炮 · 艉部反潜装具',
    geometry: {length:93.6,beam:11.8,calibre:102,guns:[mount({ barrels: 1, y: .75 })],funnels:[-.12],bridge:'low',bridgeY:.31,openGuns:true,deck:'steel'} }),
  ship({ id: 'niels-juel', name: '尼尔斯·尤尔', navy: 'dk', year: 1943, kind: '岸防舰', hull: 'cruiser', path: 'denmark/dk_bb_niels_iuel', feature: '十座单装150毫米炮 · 高塔桅 · 单烟囱',
    geometry: {length:90,beam:16.3,calibre:150,guns:broadside(10),funnels:[-.20],bridge:'tower',bridgeY:.36,openGuns:true} }),
  ...US_CLASS_SHIPS,
] as const;

export type HistoricalShipId = typeof HISTORICAL_SHIPS[number]['id'];
export type HistoricalModelId = `historic-${HistoricalShipId}`;
export const DEFAULT_FLEET = {
  'patrol-boat':'pt-109', destroyer:'fletcher', cruiser:'cleveland',
  battleship:'yamato', 'fleet-carrier':'akagi', transport:'john-w-brown',
} as const satisfies Record<NavalHull,HistoricalShipId>;
export type FleetSelection = Record<NavalHull,HistoricalShipId>;
export type HistoricalEntry = HistoricalShip & {id:HistoricalShipId};
const shipsById = new Map<string,HistoricalEntry>(HISTORICAL_SHIPS.map(ship=>[ship.id,ship]));
export function historicalShip(id:string):HistoricalEntry|undefined {return shipsById.get(id);}
export function historicalModel(id:HistoricalShipId):NavalHull|HistoricalModelId {
  for(const hull of NAVAL_HULLS)if(DEFAULT_FLEET[hull]===id)return hull;
  return `historic-${id}`;
}
export function fleetSelection(value:unknown):FleetSelection {
  const result:FleetSelection={...DEFAULT_FLEET};
  if(!value||typeof value!=='object'||Array.isArray(value))return result;
  for(const hull of NAVAL_HULLS) {
    const id: unknown = Reflect.get(value, hull);
    const ship = typeof id === 'string' ? historicalShip(id) : undefined;
    if(ship?.hull===hull)result[hull]=ship.id;
  }
  return result;
}

/** Authoring units shared by Blender and hit-marker placement; +y points down-screen. */
export function navalShape(ship:HistoricalShip) {
  const hull=HULLS[ship.hull];
  const halfLength=hull.halfLength/hull.scale;
  // Widen the measured beam modestly so turret and deck layers survive the pixel raster.
  const halfBeam=halfLength*ship.geometry.beam/ship.geometry.length*1.4;
  const combatStretch=(hull.halfWidth/hull.scale*.86)/halfBeam;
  const parts:Partial<Record<PartId,Point>>={};
  if(ship.hull!=='transport') {
    const patrol=ship.hull==='patrol-boat';
    parts['aa-port']={x:patrol?0:-halfBeam*.73,y:halfLength*(patrol?.72:.15)};
    if(!patrol) {
      parts['aa-starboard']={x:halfBeam*.73,y:halfLength*.15};
      parts.bridge={x:ship.hull==='fleet-carrier'?(ship.geometry.islandSide??1)*halfBeam*.79:0,y:-halfLength*ship.geometry.bridgeY};
    }
    if(ship.hull==='fleet-carrier')parts['flight-deck']={x:0,y:halfLength*.34};
  }
  return {halfLength,halfBeam,combatStretch,parts};
}

// Blender positive Z rotation maps a forward barrel toward port in Three.js.
export const combatMainBearing=(localX:number):number=>localX>0?-Math.PI/2:Math.PI/2;
