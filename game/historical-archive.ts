import { archiveServiceCountries } from './archive-service-countries.ts';
import { AIRFRAME_PROFILES, SUBMARINE_PROFILES } from './archive-profiles.ts';
import type { AirframeProfile, Section, SubmarineProfile } from './archive-profiles.ts';
import { HISTORICAL_SHIPS, NAVIES, historicalModel, historicalShip } from './naval-history.ts';
import type { ArchiveCountryId } from './naval-history.ts';

export type ArchiveCategory = 'aircraft' | 'surface' | 'submarine';
export type ArchiveModelId = `archive-${string}`;
export type ArchiveEra = 'ww1' | 'interwar-ww2' | 'cold-war' | 'modern';
type Point2 = readonly [number, number];

interface AircraftGeometryBase {
  profile: AirframeProfile;
  length: number;
  span: number;
  wing: readonly Point2[];
  wingLevels: readonly number[];
  body: 'rotary' | 'inline' | 'radial' | 'jet' | 'glider';
  paint: 'olive' | 'silver' | 'navy' | 'grey';
  tail: 'rounded' | 'square' | 'swept' | 'delta' | 'canard';
  propellerBlades: number;
  engines: number;
  intake?: 'nose' | 'chin' | 'side';
  radiator?: 'chin' | 'belly' | 'wing';
  struts?: 'N' | 'paired';
  cockpit: number;
  tailSpan: number;
  armament?: 'unarmed';
}

interface TransportNacelleBase {
  x: number;
  z: number;
  front: number;
  radius: number;
  sections: readonly Section[];
}
type TransportNacelle = TransportNacelleBase & (
  | { gear: 'enclosed' }
  | { gear: 'partly-exposed'; wheelY: number }
);
type TransportGeometry = {
  wingZ: number;
  tailZ: number;
  cockpitRoofStations: readonly (readonly [number, number])[];
  cockpitWidth: number;
  sidePaneSubdivisions: number;
  cockpitSidePanes: readonly (readonly [number, number, number, number])[];
  cabinWindows: readonly number[];
  cabinWindowShape: 'rectangular' | 'round';
  windowZ: number;
  windowWidth: number;
  windowHeight: number;
} & (
  | { gearLayout: 'tailwheel'; tailwheelY: number; tailwheelZ: number }
  | { gearLayout: 'retracted-tricycle' }
) & (
  | { tailStructure: 'conventional'; cargoDoor: readonly [number, number, number, number] }
  | { tailStructure: 'twin-boom'; boomX: number; boomSections: readonly Section[] }
);
type TransportAircraft = {
  role: 'transport';
  body: 'radial';
  armament: 'unarmed';
} & (
  | { engines: 2; transport: TransportGeometry & { nacelles: readonly [TransportNacelle, TransportNacelle] } }
  | { engines: 4; transport: TransportGeometry & { nacelles: readonly [TransportNacelle, TransportNacelle, TransportNacelle, TransportNacelle] } }
);
export type AircraftGeometry = AircraftGeometryBase & (
  | TransportAircraft
  | { role?: 'trainer'; transport?: never }
);

export interface SubmarineGeometry {
  profile: SubmarineProfile;
  length: number;
  beam: number;
  hull: 'double' | 'streamlined';
  sail: readonly Point2[];
  sailHeight: number;
  sailLength: number;
  sailY: number;
  shafts: 1 | 2;
  blades: number;
  planes: 'bow' | 'sail';
  rudder: 'cruciform' | 'x';
  deckGun: boolean;
  casing: number;
}

interface ArchiveBase {
  id: string;
  modelId: ArchiveModelId | ReturnType<typeof historicalModel>;
  name: string;
  country: ArchiveCountryId;
  year: number;
  kind: string;
  feature: string;
  source: string;
  references: readonly string[];
  note: string;
}
export interface AircraftEntry extends ArchiveBase { modelId: ArchiveModelId; category: 'aircraft'; geometry: AircraftGeometry }
export interface SubmarineEntry extends ArchiveBase { modelId: ArchiveModelId; category: 'submarine'; geometry: SubmarineGeometry }
export type NewArchiveEntry = AircraftEntry | SubmarineEntry;
export interface SurfaceEntry extends ArchiveBase { category: 'surface' }
export type ArchiveEntry = NewArchiveEntry | SurfaceEntry;

const nasm = ({ path, id }: { path: string; id: string }) => `https://airandspace.si.edu/collection-objects/${path}/nasm_${id}`;
const usaf = ({ article, slug }: { article: number; slug: string }) => `https://www.nationalmuseum.af.mil/Visit/Museum-Exhibits/Fact-Sheets/Display/Article/${article}/${slug}/`;
type WithoutProfile<Geometry> = Geometry extends unknown ? Omit<Geometry, 'profile'> : never;
type ArchiveInput<Entry extends NewArchiveEntry, Id extends string> = Pick<Entry, 'name' | 'country' | 'year' | 'feature' | 'source'> & {
  id: Id;
  geometry: WithoutProfile<Entry['geometry']>;
  references?: Entry['references'];
  note?: Entry['note'];
};
const plane = ({ id, name, country, year, feature, source, geometry, references = [], note = '按公开外形制作的低多边形识别模型；涂装为项目统一演绎。' }: ArchiveInput<AircraftEntry, keyof typeof AIRFRAME_PROFILES>): AircraftEntry =>
  ({ id, modelId: `archive-${id}`, name, country, year, kind: geometry.role === 'transport' ? geometry.engines === 4 ? '四发军用运输机' : geometry.transport.tailStructure === 'twin-boom' ? '双尾撑军用运输机' : '双发军用运输机' : geometry.role === 'trainer' ? geometry.body === 'jet' ? '喷气教练机' : '活塞初级教练机' : geometry.body === 'glider' ? '军用运输滑翔机' : geometry.body === 'jet' ? '喷气战斗机' : geometry.wingLevels.length > 1 ? '双翼战斗机' : '螺旋桨战斗机', category: 'aircraft', feature, source, references,
    geometry: { ...geometry, profile: AIRFRAME_PROFILES[id] }, note });
const sub = ({ id, name, country, year, feature, source, geometry, references = [], note = '按舰级与所示年份外形制作；桅杆、舵面及甲板设备按像素尺寸简化。' }: ArchiveInput<SubmarineEntry, keyof typeof SUBMARINE_PROFILES>): SubmarineEntry =>
  ({ id, modelId: `archive-${id}`, name, country, year, kind: '潜艇', category: 'submarine', feature, source, references,
    geometry: { ...geometry, profile: SUBMARINE_PROFILES[id] }, note });

// Wing points describe the starboard half-planform: half-span X, half-length Y.
// These are authored outlines, not a common mesh renamed for each aircraft.
export const NEW_ARCHIVE: readonly NewArchiveEntry[] = [
  plane({"id":"c54g","name":"C-54G Skymaster","country":"us","year":1960,"feature":"四发三叶桨 · 下单翼 · 收起的前三点起落架","source":"https://museumofaviation.org/portfolio/c-54g-skymaster/","references":["https://en.wikipedia.org/wiki/Douglas_C-54_Skymaster","https://www.airwar.ru/image/idop/cww2/c54/c54-1.gif"],"note":"C-54G无武装军用运输代表，1960为所选后期军用时期示意年份，不是照片日期或精确涂装复原。馆藏45-579于1945年8月交付USAAF并参加柏林空运，1964年退役。机长93英尺5英寸、翼展117英尺6英寸采用馆方口径；另一二手G型表长93英尺10英寸，差异保留。C-54D三视图仅用于家族轮廓，G型照片用于外形比较，不冒充G型原厂图。四台星形发动机、三叶桨及收起的前三点起落架；截面、窗框和桨径为低多边形近似。","geometry":{"length":28.4734,"span":35.814,"paint":"silver","role":"transport","body":"radial","propellerBlades":3,"engines":4,"armament":"unarmed","tailSpan":0.27,"wing":[[0,0.42024],[0.2,0.40896],[0.43,0.3852736],[0.85,0.336192],[0.96,0.3177632],[0.99,0.3072448],[1,0.28832],[1,0.24584],[0.99,0.2222848],[0.95,0.203584],[0.85,0.166272],[0.43,0.0898016],[0.2,0.051184],[0,0.029424]],"transport":{"wingZ":-0.28,"tailZ":0.1,"nacelles":[{"x":-0.79,"z":-0.2119676541401156,"front":1.72,"radius":0.18,"sections":[[0.3,0.025,0.03,-0.1469676541401156],[0.6,0.11,0.095,-0.1869676541401156],[1.0,0.18,0.17099999999999999,-0.2119676541401156],[1.56,0.18,0.18,-0.2119676541401156],[1.72,0.18,0.18,-0.2119676541401156]],"gear":"enclosed"},{"x":-1.6,"z":-0.12683322357491766,"front":1.61,"radius":0.18,"sections":[[0.3,0.025,0.03,-0.06183322357491766],[0.6,0.11,0.095,-0.10183322357491767],[1.0,0.18,0.17099999999999999,-0.12683322357491766],[1.4500000000000002,0.18,0.18,-0.12683322357491766],[1.61,0.18,0.18,-0.12683322357491766]],"gear":"enclosed"},{"x":0.79,"z":-0.2119676541401156,"front":1.72,"radius":0.18,"sections":[[0.3,0.025,0.03,-0.1469676541401156],[0.6,0.11,0.095,-0.1869676541401156],[1.0,0.18,0.17099999999999999,-0.2119676541401156],[1.56,0.18,0.18,-0.2119676541401156],[1.72,0.18,0.18,-0.2119676541401156]],"gear":"enclosed"},{"x":1.6,"z":-0.12683322357491766,"front":1.61,"radius":0.18,"sections":[[0.3,0.025,0.03,-0.06183322357491766],[0.6,0.11,0.095,-0.10183322357491767],[1.0,0.18,0.17099999999999999,-0.12683322357491766],[1.4500000000000002,0.18,0.18,-0.12683322357491766],[1.61,0.18,0.18,-0.12683322357491766]],"gear":"enclosed"}],"gearLayout":"retracted-tricycle","cockpitRoofStations":[[2.38,2.5],[2.53,2.64]],"cockpitWidth":0.125,"cockpitSidePanes":[[2.17,2.35,0.11,0.22],[2.38,2.51,0.06,0.13]],"cabinWindows":[2.02,1.65,1.25,0.85,0.45,0.05,-0.35,-0.75],"windowZ":0.11,"windowWidth":0.08,"windowHeight":0.07,"cargoDoor":[-1.28,-0.81,-0.22,0.22],"tailStructure":"conventional","cabinWindowShape":"rectangular","sidePaneSubdivisions":24},"wingLevels":[-0.09333333333333334],"tail":"rounded","cockpit":0.75}}),
  plane({"id":"c119c","name":"C-119C Flying Boxcar","country":"us","year":1955,"feature":"双尾撑双垂尾 · 四叶桨 · 闭合蚌壳货舱门","source":"https://museumofaviation.org/portfolio/c-119c-flying-boxcar/","references":["https://en.wikipedia.org/wiki/Fairchild_C-119_Flying_Boxcar","https://www.airwar.ru/image/idop/craft/c119/c119-1.gif"],"note":"C-119C无武装军用运输代表，1955为服役时期示意外形，不是馆藏照片日期。馆藏51-2566于1951年10月交付USAF，1966年退役；86英尺6英寸长、109英尺4英寸翼展采用馆方口径。二手C型表翼展109英尺3英寸，保留1英寸差异；R-4360制造商采用P&W，馆方误写Wright不照抄。四叶15英尺桨参考C型规格及实机；G型三视图只辅助家族布局，不套G型R-3350、J型货门或Jet-Pak。货舱、双尾撑、两面垂尾及连接平尾均为实体，水平方向和细部为游戏近似。","geometry":{"length":26.3652,"span":33.3248,"paint":"silver","role":"transport","body":"radial","propellerBlades":4,"engines":2,"armament":"unarmed","tailSpan":0.2584,"wing":[[0,0.315],[0.27,0.31419],[0.93,0.23621],[0.98,0.20756],[1,0.16],[1,0.103],[0.98,0.05556],[0.93,0.03196],[0.27,-0.06581],[0,-0.065]],"transport":{"tailStructure":"twin-boom","boomX":0.98,"boomSections":[[-3,0.025,0.055,0.3],[-2.6,0.07,0.11,0.3],[-1.7,0.12,0.16,0.29],[-0.7,0.17,0.21,0.26],[0.3,0.2,0.24,0.22],[1.1,0.21,0.23,0.18]],"wingZ":0.44,"tailZ":0.3,"nacelles":[{"x":-0.98,"z":0.18,"front":1.47,"radius":0.23,"sections":[[0.05,0.03,0.035,0.25],[0.46,0.15,0.16,0.21],[0.86,0.23,0.23,0.18],[1.3,0.23,0.23,0.18],[1.47,0.23,0.23,0.18]],"gear":"enclosed"},{"x":0.98,"z":0.18,"front":1.47,"radius":0.23,"sections":[[0.05,0.03,0.035,0.25],[0.46,0.15,0.16,0.21],[0.86,0.23,0.23,0.18],[1.3,0.23,0.23,0.18],[1.47,0.23,0.23,0.18]],"gear":"enclosed"}],"gearLayout":"retracted-tricycle","cockpitRoofStations":[[2.39,2.52],[2.55,2.68]],"cockpitWidth":0.14,"cockpitSidePanes":[[1.98,2.18,0.24,0.37],[2.21,2.39,0.16,0.27],[2.42,2.56,0.08,0.17]],"cabinWindows":[-0.85,-0.42,0.01],"windowZ":0.08,"windowWidth":0.075,"windowHeight":0.075,"cabinWindowShape":"round","sidePaneSubdivisions":24},"wingLevels":[0.14666666666666667],"tail":"rounded","cockpit":0.75}}),
  sub({"id":"type-093-early","name":"093型 商级 初期型","country":"cn","year":2010,"geometry":{"hull":"streamlined","sail":[[-0.28,-0.6],[0.28,-0.6],[0.31,0.31],[0.16,0.6],[-0.16,0.6],[-0.31,0.31]],"shafts":1,"blades":7,"planes":"sail","rudder":"cruciform","deckGun":false,"casing":0,"length":107,"beam":11,"sailLength":0.136,"sailY":0.404,"sailHeight":0.158},"feature":"初期商级 · 围壳水平舵 · 单轴螺旋桨","source":"https://www.navypedia.org/ships/china/ch_ss_cz407.htm","references":["https://www.navypedia.org/storage/images/ships/china/ch_ss_25.gif"],"note":"选长征7号407的2010年107×11米初期外形，仅采用407／408已核实历史服役。资料的2006年12月为Comp完成栏，2019在役为历史快照，不表示2026现役。不采信旧页面对初期艇垂发的推测，不混入后期093B或泵喷。公开二手侧视轮廓和照片用于低多边形识别；水下截面、俯视宽度、七叶桨及细节为近似，不宣称内部工程复原。"}),
  sub({"id":"type-092-refit","name":"092型 夏级 2001改装后","country":"cn","year":2010,"geometry":{"hull":"streamlined","sail":[[-0.28,-0.6],[0.28,-0.6],[0.31,0.31],[0.16,0.6],[-0.16,0.6],[-0.31,0.31]],"shafts":1,"blades":7,"planes":"sail","rudder":"cruciform","deckGun":false,"casing":0,"length":120,"beam":10.6,"sailLength":0.136,"sailY":0.51,"sailHeight":0.12},"feature":"短围壳与长导弹舱 · 六对闭合舱盖 · 十字尾舵","source":"https://www.navypedia.org/ships/china/ch_ss_cz406.htm","references":["https://www.navypedia.org/storage/images/ships/china/ch_ss_24.gif"],"note":"选长征406的2010年、2001改装后120×10.6米外形，12个闭合舱盖分六对。1983年8月1日为Comp完成栏，1988年7月为导弹发射事件，不冒充入役日期；2019在役快照与其他退役说法的冲突保留，不声明2026现役。公开二手侧视轮廓和照片用于低多边形识别；水下截面、俯视宽度、七叶桨及细节为近似，不宣称内部工程复原。"}),
  sub({"id":"type-091-late","country":"cn","year":2010,"geometry":{"hull":"streamlined","sail":[[-0.28,-0.6],[0.28,-0.6],[0.3,0.32],[0.12,0.6],[-0.12,0.6],[-0.3,0.32]],"shafts":1,"blades":7,"planes":"sail","rudder":"cruciform","deckGun":false,"casing":0,"length":98.0,"beam":9.0,"sailLength":0.17,"sailY":0.37,"sailHeight":0.16},"name":"091型 汉级 后三艇","feature":"加长98米艇体 · 围壳水平舵 · 单轴","source":"https://www.navypedia.org/ships/china/ch_ss_cz401.htm","references":["https://www.navypedia.org/storage/images/ships/china/ch_ss_6.gif"],"note":"选后三艇长征405的2010年98×9米外形，参照404的1996年公开照片；不套早期401／402的90米尺寸。退役和在役快照支持历史服役，2019在役不表示2026现役。402完成日期原文30/121980不自行校正。公开二手侧视轮廓和照片用于低多边形识别；水下截面、俯视宽度、螺旋桨叶数及细分为近似，不宣称内部工程复原。"}),
  sub({"id":"type-094-early","country":"cn","year":2010,"geometry":{"hull":"streamlined","sail":[[-0.28,-0.6],[0.28,-0.6],[0.3,0.32],[0.12,0.6],[-0.12,0.6],[-0.3,0.32]],"shafts":1,"blades":7,"planes":"sail","rudder":"cruciform","deckGun":false,"casing":0,"length":137.0,"beam":12.5,"sailLength":0.11,"sailY":0.52,"sailHeight":0.09},"name":"094型 初期晋级","feature":"高隆起导弹舱 · 六对闭合舱盖 · 十字尾舵","source":"https://www.navypedia.org/ships/china/ch_ss_cz409.htm","references":["https://www.navypedia.org/storage/images/ships/china/ch_ss_26.gif"],"note":"选长征411的2010年137×12.5米初期外形，12个闭合发射筒盖分六对；不套094A流线化围壳或095／096推测外形。411的2007年3月是Comp完成栏，在役2019为历史快照；不采用同页420的2019完成与building矛盾记录。公开二手侧视轮廓和照片用于低多边形识别；水下截面、俯视宽度、螺旋桨叶数及细分为近似，不宣称内部工程复原。"}),
  sub({"id":"type-035g","country":"cn","year":2000,"geometry":{"length":76.0,"beam":7.6,"hull":"double","sail":[[-0.27,-0.6],[0.27,-0.6],[0.31,0.32],[0.15,0.6],[-0.15,0.6],[-0.31,0.32]],"sailHeight":0.11,"sailLength":0.09,"sailY":0.17,"shafts":2,"blades":5,"planes":"bow","rudder":"cruciform","deckGun":false,"casing":0.7},"name":"035G型 明级","feature":"双轴 · 艏水平舵 · 两层开放围壳","source":"https://www.navypedia.org/ships/china/ch_ss_cz233.htm","references":["https://www.navypedia.org/storage/images/ships/china/ch_ss_4.gif"],"note":"长城363的2000年035G外形，76×7.6米；不混入035B长城310或78米AIP改装308。035家族实际服役及事故记载与完成栏分开；来源对长城233火灾年2005／2006有冲突，此模型不采用其事故年份。公开二手侧视轮廓和照片用于低多边形识别；水下截面、俯视宽度、螺旋桨叶数及细分为近似，不宣称内部工程复原。"}),
  sub({"id":"type-039-original","country":"cn","year":2000,"geometry":{"length":76.6,"beam":8.4,"hull":"double","sail":[[-0.27,-0.6],[0.27,-0.6],[0.34,0.3],[0.18,0.6],[-0.18,0.6],[-0.34,0.3]],"sailHeight":0.16,"sailLength":0.17,"sailY":0.275,"shafts":1,"blades":7,"planes":"sail","rudder":"cruciform","deckGun":false,"casing":0.68},"name":"039型 初期宋级","feature":"阶梯式围壳 · 围壳水平舵 · 单轴","source":"https://www.navypedia.org/ships/china/ch_ss_cz320.htm","references":["https://www.navypedia.org/storage/images/ships/china/ch_ss_11.gif"],"note":"长城320的2000年阶梯围壳初期外形，76.6×8.4米；不混用039G无阶梯图。虽称prototype，该艇Comp为1999年6月并列在役2019，属于实际服役首艇；完成日期不改称入役。039与039A分属不同身份。公开二手侧视轮廓和照片用于低多边形识别；水下截面、俯视宽度、螺旋桨叶数及细分为近似，不宣称内部工程复原。"}),
  plane({"id":"c46a","country":"us","year":1944,"name":"Curtiss C-46A Commando","feature":"双发四叶桨 · 高椭圆货舱 · 流线驾驶舱与双扇货舱门","source":"https://www.amcmuseum.org/at-the-museum/aircraft/c-46a-commando/","references":["https://www.airwar.ru/enc/cww2/c46.html","https://www.airwar.ru/image/idop/cww2/c46/c46-1.gif"],"note":"选1944年美国陆军航空军C-46A军用运输外形，主起落架收起，无武装。76英尺4英寸长、108英尺翼展采用AMC博物馆口径；战时标准四叶Curtiss-Electric桨与现馆藏后期三叶桨改装分开，保留圆翼尖及连续驾驶舱，不混入C-46E阶梯座舱或F型方翼尖。二手三视图仅供识别近似；不因1945年转CNAC认定中国军队运营。","geometry":{"length":23.2664,"span":32.9184,"paint":"olive","role":"transport","body":"radial","propellerBlades":4,"engines":2,"armament":"unarmed","tailSpan":0.325,"wing":[[0,0.5238095],[0.16,0.4449918],[0.24,0.4384236],[0.32,0.4285714],[0.48,0.3858785],[0.64,0.3399015],[0.8,0.2972085],[0.9,0.270936],[0.95,0.2545156],[0.98,0.2380952],[1,0.2052545],[0.98,0.1494253],[0.95,0.1133005],[0.9,0.090312],[0.8,0.0738916],[0.64,0.0509031],[0.48,0.0279146],[0.32,0.0082102],[0.24,0.001642],[0.16,0.0049261],[0,-0.001642]],"transport":{"wingZ":-0.27,"tailZ":0.24,"nacelles":[{"x":-1.025,"z":-0.31,"front":2.06,"radius":0.235,"sections":[[-0.24,0.025,0.035,-0.22999999999999998],[0.12,0.141,0.12925,-0.275],[0.64,0.235,0.22324999999999998,-0.31],[1.86,0.235,0.235,-0.31],[2.06,0.235,0.235,-0.31]],"gear":"enclosed"},{"x":1.025,"z":-0.31,"front":2.06,"radius":0.235,"sections":[[-0.24,0.025,0.035,-0.22999999999999998],[0.12,0.141,0.12925,-0.275],[0.64,0.235,0.22324999999999998,-0.31],[1.86,0.235,0.235,-0.31],[2.06,0.235,0.235,-0.31]],"gear":"enclosed"}],"cockpitRoofStations":[[2.38,2.51],[2.54,2.66]],"cockpitWidth":0.12,"cockpitSidePanes":[[2.17,2.37,0.2,0.3],[2.4,2.54,0.14,0.23]],"cabinWindows":[-0.8,-0.24,0.34,0.9,1.45],"windowZ":0.14,"windowWidth":0.095,"windowHeight":0.085,"cargoDoor":[-1.0,-0.2,-0.24,0.25],"tailwheelY":-2.03,"tailwheelZ":-0.18,"gearLayout":"tailwheel","tailStructure":"conventional","cabinWindowShape":"rectangular","sidePaneSubdivisions":8},"wingLevels":[-0.09000000000000001],"tail":"rounded","cockpit":0.75}}),
  plane({"id":"c47a","country":"us","year":1944,"name":"Douglas C-47A Skytrain","feature":"双发三叶桨 · 框式驾驶舱 · 双扇货舱门与半露收起轮","source":"https://www.amcmuseum.org/at-the-museum/aircraft/c-47a-skytrain/","references":["https://www.nationalmuseum.af.mil/Visit/Museum-Exhibits/Fact-Sheets/Display/Article/196271/douglas-c-47d-skytrain/","https://www.airwar.ru/image/idop/cww2/c47/c47-1.gif"],"note":"选1944年美国陆军航空军C-47A无武装运输构型；AMC博物馆42-92841履历记1944年4月编入61中队并参加诺曼底空投。63英尺9英寸机长、95英尺6英寸翼展采用该馆A型口径，不混用其他64英尺5英寸口径；识别三视图为二手资料。主起落架收起仍部分露轮，尾轮保留；不添加AC-47侧射武器或C-117加高尾翼。空军博物馆另一实物为D型涂作A型，明确分开。","geometry":{"length":19.431,"span":29.1084,"paint":"olive","role":"transport","body":"radial","propellerBlades":3,"engines":2,"armament":"unarmed","tailSpan":0.303,"wing":[[0,0.512],[0.24,0.512],[0.9,0.229],[0.97,0.189],[1,0.125],[0.98,0.085],[0.94,0.061],[0.24,0.06],[0,0.06]],"transport":{"wingZ":-0.3,"tailZ":0.21,"nacelles":[{"x":-0.91,"z":-0.34,"front":1.92,"radius":0.215,"wheelY":0.73,"sections":[[-0.24,0.025,0.035,-0.26],[0.12,0.129,0.11825000000000001,-0.30500000000000005],[0.64,0.215,0.20425,-0.34],[1.72,0.215,0.215,-0.34],[1.92,0.215,0.215,-0.34]],"gear":"partly-exposed"},{"x":0.91,"z":-0.34,"front":1.92,"radius":0.215,"wheelY":0.73,"sections":[[-0.24,0.025,0.035,-0.26],[0.12,0.129,0.11825000000000001,-0.30500000000000005],[0.64,0.215,0.20425,-0.34],[1.72,0.215,0.215,-0.34],[1.92,0.215,0.215,-0.34]],"gear":"partly-exposed"}],"cockpitRoofStations":[[2.18,2.32],[2.35,2.48]],"cockpitWidth":0.135,"cockpitSidePanes":[[1.98,2.17,0.12,0.27],[2.2,2.38,0.1,0.23]],"cabinWindows":[-0.8,-0.33,0.14,0.61,1.08,1.55],"windowZ":0.11,"windowWidth":0.13,"windowHeight":0.095,"cargoDoor":[-1.62,-0.86,-0.22,0.23],"tailwheelY":-2.08,"tailwheelZ":-0.24,"gearLayout":"tailwheel","tailStructure":"conventional","cabinWindowShape":"rectangular","sidePaneSubdivisions":8},"wingLevels":[-0.09999999999999999],"tail":"rounded","cockpit":0.75}}),
  plane({"id":"mb326","name":"Macchi MB.326 双座教练机","country":"it","year":1962,"feature":"无武装串列双座 · 翼端油箱 · 翼根两侧进气","source":"https://en.wikipedia.org/wiki/Aermacchi_MB-326","references":["https://it.wikipedia.org/wiki/Aermacchi_MB-326","https://www.airwar.ru/image/idop/attack/mb326/mb326-1.gif"],"note":"选择意大利空军1962年实际服役、无后缀MB.326双座无武装教练外形，起落架收起。MB.326A是未建造武装方案，明确排除；不将二手表的A标签当成服役型。10.65米长、10.56米翼展及19.00平方米采用意大利语百科通用口径，尚缺独立制造商尺寸。通用三视图仅作外形近似；不添加E/G/K型挂架。统一橄榄色为项目演绎。","geometry":{"length":10.65,"span":10.56,"wing":[[0,0.29],[0.96,0.055],[1,0.035],[1,-0.195],[0.96,-0.215],[0,-0.12]],"wingLevels":[-0.08],"body":"jet","paint":"olive","tail":"swept","propellerBlades":0,"engines":1,"intake":"side","cockpit":0.37,"tailSpan":0.39,"armament":"unarmed","role":"trainer"}}),
  plane({"id":"cj6a","name":"初教-6A","country":"cn","year":1962,"feature":"无武装串列双座 · 折线上反低翼 · HS6A星形发动机","source":"https://www.chinanews.com/gn/2019/02-28/8767631.shtml","references":["https://en.wikipedia.org/wiki/Nanchang_CJ-6","http://www.warbirdalley.com/cj6.htm","https://www.airwar.ru/enc/other/cj6.html"],"note":"初教6家族1962年定型服役／交付部队见中新网；所选A型采用285hp HS6A、双叶桨、无武装训练外形，起落架收起。尺寸8.46×10.22米采用Jane’s二手汇编口径；Airwar通用表翼展10.18米、翼面积22.60平方米与其他资料不一致，不据此宣称精确重现。A型生产与家族初始服役的口径分开保留。统一橄榄色为项目演绎。","geometry":{"length":8.46,"span":10.22,"wing":[[0,0.14],[0.2,0.14],[0.94,0.05],[1,0.01],[1,-0.15],[0.94,-0.1933],[0,-0.4037]],"wingLevels":[-0.1],"body":"radial","paint":"olive","tail":"square","propellerBlades":2,"engines":1,"cockpit":0.26,"tailSpan":0.335,"armament":"unarmed","role":"trainer"}}),

  plane({ id: 'cg4a', name: 'Waco CG-4A Hadrian', country: 'us', year: 1944, feature: '无动力高翼 · 宽货舱与整体开启式机首 · 双撑杆', source: usaf({ article: 196272, slug: 'waco-cg-4a-hadrian' }),
    geometry: { length: 14.732, span: 25.5016, wing: [[0,.602],[.90,.602],[.955,.576],[.985,.515],[1,.435],[.992,.37],[.95,.25],[.89,.139],[0,.139]], wingLevels: [.10], body: 'glider', paint: 'olive', tail: 'rounded', propellerBlades: 0, engines: 0, cockpit: .80, tailSpan: .255 },
    references: ['https://commons.wikimedia.org/wiki/File:WACO_CG-4A_3-view_drawing.svg'], note: '1943年7月首次用于西西里作战；此处为1944年机首关闭、保留起落轮的运输外形。尺寸依美空军博物馆口径，无动力、无武装。Kaboldy三视图（CC BY-SA 4.0）仅供外形识别，模型作低多边形近似。' }),
  plane({ id: 'sopwith-camel', name: '索普威思 Camel F.1', country: 'gb', year: 1917, feature: '错列双翼与驼峰 · 旋转发动机 · 单跨支柱', source: nasm({ path: 'sopwith-f1-camel', id: 'A20170105000' }),
    geometry: { length: 5.72, span: 8.53, wing: [[0,0.32],[0.91,0.32],[1,0.26],[1,-0.09958],[0.91,-0.15958],[0,-0.15958]], wingLevels: [-.12,0.459534], body: 'rotary', paint: 'olive', tail: 'rounded', propellerBlades: 2, engines: 1, struts: 'paired', cockpit: -.04, tailSpan: .39 }, references: ['https://www.baesystems.com/heritage/page/sopwith-camel','https://brenthugh.com/flightgear/catalog/sopwithCamel-Bombable/Docs/Historical%20Docs/Flight-Sept1918/1918%20-%201019.PDF'] }),
  plane({ id: 'spad-xiii', name: 'SPAD S.XIII', country: 'fr', year: 1917, feature: '等弦双翼 · 圆形前置散热器 · 双对翼间支柱', source: nasm({ path: 'spad-xiii-smith-iv', id: 'A19200001000' }),
    geometry: { length: 6.25, span: 8.08, wing: [[0,0.23],[0.91,0.23],[1,0.16],[1,-0.14],[0.91,-0.21],[0,-0.21]], wingLevels: [-.13,.30], body: 'inline', paint: 'olive', tail: 'rounded', propellerBlades: 2, engines: 1, struts: 'paired', cockpit: -.09, tailSpan: .37 }, references: ['https://www.memorial-flight.com/spad-xiii?lang=en'] }),
  plane({ id: 'fokker-dvii', name: '福克 D.VII', country: 'de', year: 1918, feature: '厚翼双翼机 · N 形支柱 · 方截面机首', source: nasm({ path: 'fokker-dvii', id: 'A19200004000' }),
    geometry: { length: 7, span: 8.9, wing: [[0,0.27857],[0.96,0.27857],[1,0.23045],[1,-0.17857],[0,-0.17857]], wingLevels: [-.13,.30], body: 'inline', paint: 'olive', tail: 'square', propellerBlades: 2, engines: 1, struts: 'N', cockpit: -.10, tailSpan: .37 }, references: ['https://www.fokker-history.com/en-gb/d-vii'] }),
  plane({ id: 'spitfire-ia', name: '喷火 Mk IA', country: 'gb', year: 1940, feature: '椭圆主翼 · 窄机首 · 翼下散热器', source: 'https://www.rafmuseum.org.uk/london/exhibition-items/supermarine-spitfire-mk-ia/',
    geometry: { length: 9.12, span: 11.23, wing: [[0,0.272583],[0.4,0.221564],[0.72,0.135975],[0.92,0.020146],[1,-0.099183],[0.96,-0.189918],[0.75,-0.270442],[0.4,-0.299111],[0,-0.284434]], wingLevels: [-.12], body: 'inline', paint: 'olive', tail: 'rounded', propellerBlades: 3, engines: 1, radiator: 'wing', cockpit: -.07, tailSpan: .284987 }, references: ['https://stephentaylorhistorian.com/wp-content/uploads/2020/04/ap1565a-spitfire1.pdf'] }),
  plane({ id: 'p51d', name: 'P-51D 野马', country: 'us', year: 1944, feature: '梯形低翼 · 水滴座舱 · 腹部散热器', source: usaf({ article: 196263, slug: 'north-american-p-51d-mustang' }),
    geometry: { length: 9.83, span: 11.28, wing: [[0,0.22],[0.88,0.156606],[1,0.079461],[0.97,-0.132253],[0,-0.308]], wingLevels: [-.12], body: 'inline', paint: 'silver', tail: 'square', propellerBlades: 4, engines: 1, radiator: 'belly', cockpit: -.04, tailSpan: .35 }, references: ['https://www.nps.gov/articles/us-army-aircraft-p51d25na-4473287.htm','https://ntrs.nasa.gov/api/citations/20050019329/downloads/20050019329.pdf'], note: '翼面积按服役规格约21.9平方米；上反角另核对NACA原始P-51D报告的5°，试验构型的尺寸另记。' }),
  plane({ id: 'a6m5', name: '零式 A6M5 五二型', country: 'jp', year: 1943, feature: '圆形发动机罩 · 圆翼尖 · 长框式座舱', source: nasm({ path: 'mitsubishi-a6m5-reisen-zero-fighter-model-52-zeke', id: 'A19600335000' }),
    geometry: { length: 9.1, span: 11, wing: [[0,0.292407],[0.84,0.203572],[0.98,0.123787],[1,0.016661],[0.94,-0.10057],[0,-0.304591]], wingLevels: [-.12], body: 'radial', paint: 'navy', tail: 'rounded', propellerBlades: 3, engines: 1, cockpit: -.09, tailSpan: .43 }, references: ['https://dl.ndl.go.jp/api/iiif/4009756/R0000010/full/1600,/0/default.jpg'], note: '翼面积按公开规格约21.3平方米；TAIC原始表230平方英尺约21.37平方米，差异来自原始英制数值与公制约数。' }),
  plane({ id: 'f86a', name: 'F-86A 佩刀', country: 'us', year: 1950, feature: '后掠翼 · 机首进气 · 单尾喷口', source: usaf({ article: 196118, slug: 'north-american-f-86a-sabre' }),
    geometry: { length: 11.43, span: 11.30, wing: [[0,0.24],[1,-0.525374],[1,-0.805143],[0,-0.308567]], wingLevels: [-.10], body: 'jet', paint: 'silver', tail: 'swept', propellerBlades: 0, engines: 1, intake: 'nose', cockpit: .22, tailSpan: .3439115 }, references: ['https://ntrs.nasa.gov/api/citations/19930089401/downloads/19930089401.pdf','https://ntrs.nasa.gov/api/citations/19930086840/downloads/19930086840.pdf'], note: '主翼按 NACA 实测约 26.75 平方米和 0.51 梯形比校准；后掠采用四分之一弦线约 35°的口径，前缘约 38°，两者不可混用。' }),
  plane({ id: 'mig21pf', name: '米格-21PF', country: 'ru', year: 1965, feature: '三角翼 · 机首进气锥 · 独立水平尾翼', source: usaf({ article: 195970, slug: 'mikoyan-gurevich-mig-21pf-fishbed-d' }),
    geometry: { length: 15.76, span: 7.15, wing: [[0,0.27],[1,-0.428606],[1,-0.486982],[0,-0.488067]], wingLevels: [-.10], body: 'jet', paint: 'silver', tail: 'delta', propellerBlades: 0, engines: 1, intake: 'nose', cockpit: .21, tailSpan: .54 }, references: ['https://aviamuseum.com.ua/en/exposition/exposition/kb-mig/195-mig-21pf','https://mapsairmuseum.org/wp-content/uploads/2024/02/MiG-21.pdf'] }),
  plane({ id: 'f16a', name: 'F-16A 战隼', country: 'us', year: 1980, feature: '边条翼 · 腹部进气 · 单发与单垂尾', source: usaf({ article: 196735, slug: 'general-dynamics-f-16a-fighting-falcon' }),
    geometry: { length: 15.09, span: 9.144, wing: [[0,0.42],[0.23,0.08],[1,-0.311518],[1,-0.461286],[0,-0.461286]], wingLevels: [-.03], body: 'jet', paint: 'grey', tail: 'swept', propellerBlades: 0, engines: 1, intake: 'chin', cockpit: .39, tailSpan: 0.6009444 }, references: ['https://ntrs.nasa.gov/api/citations/19930022544/downloads/19930022544.pdf','https://falcon.blu3wolf.com/Docs/USAF-F16.pdf'], note: '主翼面板9.144米，不含翼尖挂轨和导弹。采用早期小平尾，下反10°；手册49平方英尺按露出翼面计算。' }),
  plane({ id: 'mirage2000c', name: '幻影 2000C', country: 'fr', year: 1984, feature: '无平尾三角翼 · 两侧进气 · 单发动机', source: 'https://www.dassault-aviation.com/en/defense/customer-support/operational-aircraft/mirage-2000/',
    geometry: { length: 14.34, span: 9.13, wing: [[0,0.3],[0.26,0.18],[0.97,-0.546],[1,-0.58],[1,-0.675],[0.26,-0.72],[0,-0.72]], wingLevels: [-.08], body: 'jet', paint: 'grey', tail: 'delta', propellerBlades: 0, engines: 1, intake: 'side', cockpit: .36, tailSpan: 0 }, references: ['https://www.defense.gouv.fr/sites/default/files/air/Fiche%20technique%20Mirage%202000D.pdf'], note: '尺寸采用 Dassault 的全长 14.34 米；轮廓另核对法国军方册内制造商单座型三视图，该图采用 14.55 米的长度口径。' }),
  plane({ id: 'rafale-c', name: '阵风 C', country: 'fr', year: 2006, feature: '鸭式三角翼 · 双发喷口 · 两侧进气', source: 'https://www.dassault-aviation.com/en/group/about-us/civil-and-military-aircraft/',
    geometry: { length: 15.3, span: 9.95, wing: [[0,.320256],[1,-.42],[1,-.55],[0,-.55]], wingLevels: [-.08], body: 'jet', paint: 'grey', tail: 'canard', propellerBlades: 0, engines: 2, intake: 'side', cockpit: .38, tailSpan: .4572864 }, references: ['https://www.dassault-aviation.com/fr/defense/rafale/','https://www.defense.gouv.fr/sites/default/files/air/Rafale%20F4.pdf'], note: '采用2006年C型外形；裸翼展约9.95米，军方图10.9米含翼尖导弹。F3-R册只核对共用机体轮廓。' }),
  sub({ id: 'u9', name: 'U 9 级', country: 'de', year: 1914, feature: '一战细长双壳 · 低矮围壳 · 双轴推进', source: 'https://uboat.net/wwi/types/?type=U+9',
    geometry: { length: 57.38, beam: 6, hull: 'double', sail: [[-.40,-.50],[.40,-.50],[.40,.50],[-.40,.50]], sailHeight: .08, sailLength: .08, sailY: .12, shafts: 2, blades: 3, planes: 'bow', rudder: 'cruciform', deckGun: false, casing: .76 }, references: [], note: '展示一战早期外形，不加装后期甲板炮；本级 1910 年起服役。' }),
  sub({ id: 'type-viic', name: 'VII C 型', country: 'de', year: 1941, feature: '尖艏甲板 · 开放指挥台 · 前部甲板炮', source: 'https://uboat.net/types/viic.htm',
    geometry: { length: 67.1, beam: 6.2, hull: 'double', sail: [[-.34,-.56],[.38,-.46],[.43,.30],[.25,.56],[-.25,.56],[-.43,.30]], sailHeight: .11, sailLength: .13, sailY: .10, shafts: 2, blades: 3, planes: 'bow', rudder: 'cruciform', deckGun: true, casing: .82 } }),
  sub({ id: 'gato', name: '猫鲨级 Gato', country: 'us', year: 1942, feature: '长巡航甲板 · 早期阶梯指挥台 · 后置甲板炮', source: 'https://www.history.navy.mil/research/histories/ship-histories/danfs/g/gato-i.html',
    geometry: { length: 95.02, beam: 8.31, hull: 'double', sail: [[-.44,-.55],[.44,-.55],[.44,.40],[.26,.58],[-.26,.58],[-.44,.40]], sailHeight: .09, sailLength: .12, sailY: .12, shafts: 2, blades: 4, planes: 'bow', rudder: 'cruciform', deckGun: true, casing: .90 }, references: ['https://navsource.net/archives/08/pdf/0821212.pdf'], note: '展示1942年早期外形，3英寸甲板炮置于围壳后方；后续围壳切削和炮位前移另记。' }),
  sub({ id: 'nautilus', name: '鹦鹉螺级 SSN-571', country: 'us', year: 1958, feature: '早期核潜艇 · 长平甲板 · 无甲板炮与双轴', source: 'https://www.history.navy.mil/content/history/nhhc/research/histories/ship-histories/danfs/n/nautilus-ssn-571-iv.html',
    geometry: { length: 98.68, beam: 8.43, hull: 'double', sail: [[-.37,-.55],[.37,-.55],[.40,.34],[.16,.58],[-.16,.58],[-.40,.34]], sailHeight: .11, sailLength: .13, sailY: .25, shafts: 2, blades: 5, planes: 'bow', rudder: 'cruciform', deckGun: false, casing: .85 }, references: ['https://ussnautilus.org/common-questions-about-uss-nautilus-ssn-571/'], note: '长度按美国海军 DANFS 的 323 英尺 9 英寸；博物馆另列约 319 英尺，两种口径不混用。' }),
  sub({ id: 'oberon', name: '奥伯龙级', country: 'gb', year: 1969, feature: '隆起艏声呐 · 高围壳 · 双轴常规动力', source: 'https://seapower.navy.gov.au/history/units/hmas-ovens',
    geometry: { length: 89.9, beam: 8.1, hull: 'double', sail: [[-.30,-.58],[.30,-.58],[.36,.43],[.13,.58],[-.13,.58],[-.36,.43]], sailHeight: .12, sailLength: .13, sailY: .17, shafts: 2, blades: 5, planes: 'bow', rudder: 'cruciform', deckGun: false, casing: .78 }, references: ['https://seapower.navy.gov.au/history/units/hmas-oxley-ii'], note: '英国设计的奥伯龙级；此处采用澳大利亚 Ovens 1969 年服役外形作为参考，不按运营国重复计舰级。' }),
  sub({ id: 'virginia-block-i', name: '弗吉尼亚级 Block I', country: 'us', year: 2004, feature: '水滴形单轴艇体 · 艏水平舵 · 低矮围壳', source: 'https://www.navy.mil/Resources/Fact-Files/Display-FactFiles/Article/2169558/attack-submarines-ssn/',
    geometry: { length: 114.91, beam: 10.36, hull: 'streamlined', sail: [[-.24,-.56],[.24,-.56],[.32,.34],[.12,.58],[-.12,.58],[-.32,.34]], sailHeight: .09, sailLength: .12, sailY: .29, shafts: 1, blades: 7, planes: 'bow', rudder: 'cruciform', deckGun: false, casing: 0 }, references: ['https://www.csp.navy.mil/Media/News-Admin/Article/683783/hawaii-visits-yokosuka-during-western-pacific-deployment/'], note: '采用早期 Block I 外形；泵喷推进器仅表现公开的导管轮廓，不声称复原内部叶片。' }),
  sub({ id: 'type-212a', name: '212A 型 第一批', country: 'de', year: 2005, feature: '短粗单轴艇体 · X 形尾舵 · 围壳水平舵', source: 'https://www.bundeswehr.de/de/ausruestung-technik-bundeswehr/seesysteme-bundeswehr/u-boot-klasse-212-a',
    geometry: { length: 56, beam: 7, hull: 'streamlined', sail: [[-.27,-.55],[.27,-.55],[.36,.30],[.17,.56],[-.17,.56],[-.36,.30]], sailHeight: .17, sailLength: .19, sailY: .15, shafts: 1, blades: 7, planes: 'sail', rudder: 'x', deckGun: false, casing: 0 } }),
  sub({ id: 'soryu-early', name: '苍龙级 初期型', country: 'jp', year: 2009, feature: '围壳水平舵 · X 形尾舵 · 单轴推进', source: 'https://www.mod.go.jp/msdf/equipment/ships/ss/souryu/',
    geometry: { length: 84, beam: 9.1, hull: 'streamlined', sail: [[-.24,-.60],[.24,-.60],[.32,.38],[.15,.60],[-.15,.60],[-.32,.38]], sailHeight: .13, sailLength: .16, sailY: .26, shafts: 1, blades: 7, planes: 'sail', rudder: 'x', deckGun: false, casing: 0 }, references: ['https://www.mod.go.jp/atla/research/dts2012/R2-2p.pdf'], note: '展示 2009 年服役的初期 AIP 型，不混用后期锂电池艇配置。' }),
  sub({ id: 'type-039a', name: '039A 型 元级', country: 'cn', year: 2010, feature: '常规动力艇壳 · 高围壳水平舵 · 十字尾舵', source: 'https://www.navypedia.org/ships/china/ch_ss_cz330.htm',
    geometry: { length: 72, beam: 8.4, hull: 'double', sail: [[-.28,-.60],[.28,-.60],[.35,.34],[.14,.60],[-.14,.60],[-.35,.34]], sailHeight: .17, sailLength: .19, sailY: .37, shafts: 1, blades: 7, planes: 'sail', rudder: 'cruciform', deckGun: false, casing: .68 }, note: '采用资料中长城330的2010年039A外形，长度72米与艇壳宽8.4米沿用该页口径；公开长度存在其他估计，不混用039B／039C外形、推测垂发或内部动力结构。' }),
  sub({ id: 'rubis-amethyste', name: '红宝石级 AMÉTHYSTE 改装', country: 'fr', year: 2003, feature: '改装圆钝艇艏 · 高围壳舵 · 紧凑核潜艇', source: 'https://www.navypedia.org/ships/france/fr_ss_rubis.htm',
    geometry: { length: 73.6, beam: 7.6, hull: 'double', sail: [[-.25,-.60],[.25,-.60],[.29,.39],[.10,.60],[-.10,.60],[-.29,.39]], sailHeight: .18, sailLength: .17, sailY: .38, shafts: 1, blades: 7, planes: 'sail', rudder: 'cruciform', deckGun: false, casing: .52 }, note: '红宝石级1983年起服役；此模型采用1993年完成AMÉTHYSTE改装后的2003年参考外形及73.6米长度，不套用初成72.1米的艇艏。' }),
  sub({ id: 'project-971', name: '971 型 鲨鱼级／Щука-Б', country: 'ru', year: 1988, feature: '低矮流线围壳 · 单轴十字尾舵 · 艉部拖曳阵列舱', source: 'https://www.navypedia.org/ships/russia/ru_ss_k284.htm',
    geometry: { length: 110.3, beam: 13.8, hull: 'double', sail: [[-.28,-.60],[.28,-.60],[.36,.19],[.22,.49],[0,.60],[-.22,.49],[-.36,.19]], sailHeight: .11, sailLength: .22, sailY: .19, shafts: 1, blades: 7, planes: 'bow', rudder: 'cruciform', deckGun: false, casing: .50 }, note: '采用早期971型110.3米艇体及13.8米艇壳宽，不将最大外廓15.4米或后续113.1米延长型混入。1984年起实际服役；艉舱仅表现公开外部轮廓。' }),
  sub({ id: 'sauro-first-series', name: '纳扎里奥·萨乌罗级 首批', country: 'it', year: 1980, feature: '平缓甲板壳 · 围壳水平舵 · 单轴十字尾舵', source: 'https://www.navypedia.org/ships/italy/it_ss_sauro.htm',
    geometry: { length: 63.9, beam: 6.83, hull: 'double', sail: [[-.25,-.60],[.25,-.60],[.31,.35],[.12,.60],[-.12,.60],[-.31,.35]], sailHeight: .15, sailLength: .16, sailY: .32, shafts: 1, blades: 7, planes: 'sail', rudder: 'cruciform', deckGun: false, casing: .56 }, note: '采用首批1980年外形与资料63.9米约数，排除后续加长批次和1990年代武器改装；参考页对首艇交付日期的叙述存在差异，1980年不作为全级最早入役年份。' }),
];

export const ARCHIVE_COUNTRIES = NAVIES;
export const ARCHIVE: readonly ArchiveEntry[] = [
  ...HISTORICAL_SHIPS.map(ship => ({ id: ship.id, modelId: historicalModel(ship.id), name: ship.name, country: ship.navy === 'su' ? 'ru' : ship.navy, year: ship.year, kind: ship.kind, feature: ship.feature, source: ship.source, references: [], note: '既有舰库外观；沿用历史舰库的原型与年份口径。', category: 'surface' as const })),
  ...NEW_ARCHIVE,
];
export const ARCHIVE_SURFACE_HULLS = ['fleet-carrier', 'cruiser', 'destroyer', 'battleship'] as const;
/** Handbook entries can be removed while retaining assets used in combat and art provenance. */
export const HANDBOOK_ARCHIVE = ARCHIVE.filter(entry => entry.category !== 'surface'
  || ARCHIVE_SURFACE_HULLS.some(hull => historicalShip(entry.id)?.hull === hull));
export function archiveEra(year: number): ArchiveEra {
  return year <= 1918 ? 'ww1' : year <= 1945 ? 'interwar-ww2' : year <= 1991 ? 'cold-war' : 'modern';
}
export function filterArchive({ country = 'all', category = 'all', era = 'all' }: { country?: string; category?: string; era?: string }): readonly ArchiveEntry[] {
  return HANDBOOK_ARCHIVE.filter(entry => (country === 'all' || archiveServiceCountries(entry).some(operator => operator === country)) && (category === 'all' || entry.category === category) && (era === 'all' || archiveEra(entry.year) === era));
}
