import { AIRFRAME_PROFILES, SUBMARINE_PROFILES } from './archive-profiles.ts';
import type { AirframeProfile, SubmarineProfile } from './archive-profiles.ts';
import { HISTORICAL_SHIPS, NAVIES, historicalModel } from './naval-history.ts';

export type ArchiveCategory = 'aircraft' | 'surface' | 'submarine';
export type ArchiveModelId = `archive-${string}`;
export type ArchiveEra = 'ww1' | 'interwar-ww2' | 'cold-war' | 'modern';
type Point2 = readonly [number, number];

export interface AircraftGeometry {
  profile: AirframeProfile;
  length: number;
  span: number;
  wing: readonly Point2[];
  wingLevels: readonly number[];
  body: 'rotary' | 'inline' | 'radial' | 'jet';
  paint: 'olive' | 'silver' | 'navy' | 'grey';
  tail: 'rounded' | 'square' | 'swept' | 'delta' | 'canard';
  propellerBlades: number;
  engines: number;
  intake?: 'nose' | 'chin' | 'side';
  radiator?: 'chin' | 'belly' | 'wing';
  struts?: 'N' | 'paired';
  cockpit: number;
  tailSpan: number;
}

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
  modelId: string;
  name: string;
  country: string;
  year: number;
  kind: string;
  feature: string;
  source: string;
  references: readonly string[];
  note: string;
}
export interface AircraftEntry extends ArchiveBase { category: 'aircraft'; geometry: AircraftGeometry }
export interface SubmarineEntry extends ArchiveBase { category: 'submarine'; geometry: SubmarineGeometry }
export type NewArchiveEntry = AircraftEntry | SubmarineEntry;
export interface SurfaceEntry extends ArchiveBase { category: 'surface' }
export type ArchiveEntry = NewArchiveEntry | SurfaceEntry;

const nasm = (path: string, id: string) => `https://airandspace.si.edu/collection-objects/${path}/nasm_${id}`;
const usaf = (article: number, slug: string) => `https://www.nationalmuseum.af.mil/Visit/Museum-Exhibits/Fact-Sheets/Display/Article/${article}/${slug}/`;
const plane = (id: string, name: string, country: string, year: number, feature: string, source: string, geometry: Omit<AircraftGeometry, 'profile'>, references: readonly string[] = [], note = '按公开外形制作的低多边形识别模型；涂装为项目统一演绎。'): AircraftEntry =>
  ({ id, modelId: `archive-${id}`, name, country, year, kind: geometry.body === 'jet' ? '喷气战斗机' : geometry.wingLevels.length > 1 ? '双翼战斗机' : '螺旋桨战斗机', category: 'aircraft', feature, source, references, geometry: { ...geometry, profile: AIRFRAME_PROFILES[id] }, note });
const sub = (id: string, name: string, country: string, year: number, feature: string, source: string, geometry: Omit<SubmarineGeometry, 'profile'>, references: readonly string[] = [], note = '按舰级与所示年份外形制作；桅杆、舵面及甲板设备按像素尺寸简化。'): SubmarineEntry =>
  ({ id, modelId: `archive-${id}`, name, country, year, kind: '潜艇', category: 'submarine', feature, source, references, geometry: { ...geometry, profile: SUBMARINE_PROFILES[id] }, note });

// Wing points describe the starboard half-planform: half-span X, half-length Y.
// These are authored outlines, not a common mesh renamed for each aircraft.
export const NEW_ARCHIVE: readonly NewArchiveEntry[] = [
  plane('sopwith-camel', '索普威思 Camel F.1', 'gb', 1917, '错列双翼与驼峰 · 旋转发动机 · 单跨支柱', nasm('sopwith-f1-camel', 'A20170105000'),
    { length: 5.72, span: 8.53, wing: [[0,0.32],[0.91,0.32],[1,0.26],[1,-0.09958],[0.91,-0.15958],[0,-0.15958]], wingLevels: [-.12,0.459534], body: 'rotary', paint: 'olive', tail: 'rounded', propellerBlades: 2, engines: 1, struts: 'paired', cockpit: -.04, tailSpan: .39 }, ['https://www.baesystems.com/heritage/page/sopwith-camel','https://brenthugh.com/flightgear/catalog/sopwithCamel-Bombable/Docs/Historical%20Docs/Flight-Sept1918/1918%20-%201019.PDF']),
  plane('spad-xiii', 'SPAD S.XIII', 'fr', 1917, '等弦双翼 · 圆形前置散热器 · 双对翼间支柱', nasm('spad-xiii-smith-iv', 'A19200001000'),
    { length: 6.25, span: 8.08, wing: [[0,0.23],[0.91,0.23],[1,0.16],[1,-0.14],[0.91,-0.21],[0,-0.21]], wingLevels: [-.13,.30], body: 'inline', paint: 'olive', tail: 'rounded', propellerBlades: 2, engines: 1, struts: 'paired', cockpit: -.09, tailSpan: .37 }, ['https://www.memorial-flight.com/spad-xiii?lang=en']),
  plane('fokker-dvii', '福克 D.VII', 'de', 1918, '厚翼双翼机 · N 形支柱 · 方截面机首', nasm('fokker-dvii', 'A19200004000'),
    { length: 7, span: 8.9, wing: [[0,0.27857],[0.96,0.27857],[1,0.23045],[1,-0.17857],[0,-0.17857]], wingLevels: [-.13,.30], body: 'inline', paint: 'olive', tail: 'square', propellerBlades: 2, engines: 1, struts: 'N', cockpit: -.10, tailSpan: .37 }, ['https://www.fokker-history.com/en-gb/d-vii']),
  plane('spitfire-ia', '喷火 Mk IA', 'gb', 1940, '椭圆主翼 · 窄机首 · 翼下散热器', 'https://www.rafmuseum.org.uk/london/exhibition-items/supermarine-spitfire-mk-ia/',
    { length: 9.12, span: 11.23, wing: [[0,0.272583],[0.4,0.221564],[0.72,0.135975],[0.92,0.020146],[1,-0.099183],[0.96,-0.189918],[0.75,-0.270442],[0.4,-0.299111],[0,-0.284434]], wingLevels: [-.12], body: 'inline', paint: 'olive', tail: 'rounded', propellerBlades: 3, engines: 1, radiator: 'wing', cockpit: -.07, tailSpan: .284987 }, ['https://stephentaylorhistorian.com/wp-content/uploads/2020/04/ap1565a-spitfire1.pdf']),
  plane('p51d', 'P-51D 野马', 'us', 1944, '梯形低翼 · 水滴座舱 · 腹部散热器', usaf(196263, 'north-american-p-51d-mustang'),
    { length: 9.83, span: 11.28, wing: [[0,0.22],[0.88,0.156606],[1,0.079461],[0.97,-0.132253],[0,-0.308]], wingLevels: [-.12], body: 'inline', paint: 'silver', tail: 'square', propellerBlades: 4, engines: 1, radiator: 'belly', cockpit: -.04, tailSpan: .35 }, ['https://www.nps.gov/articles/us-army-aircraft-p51d25na-4473287.htm','https://ntrs.nasa.gov/api/citations/20050019329/downloads/20050019329.pdf'], '翼面积按服役规格约21.9平方米；上反角另核对NACA原始P-51D报告的5°，试验构型的尺寸另记。'),
  plane('a6m5', '零式 A6M5 五二型', 'jp', 1943, '圆形发动机罩 · 圆翼尖 · 长框式座舱', nasm('mitsubishi-a6m5-reisen-zero-fighter-model-52-zeke', 'A19600335000'),
    { length: 9.1, span: 11, wing: [[0,0.292407],[0.84,0.203572],[0.98,0.123787],[1,0.016661],[0.94,-0.10057],[0,-0.304591]], wingLevels: [-.12], body: 'radial', paint: 'navy', tail: 'rounded', propellerBlades: 3, engines: 1, cockpit: -.09, tailSpan: .43 }, ['https://dl.ndl.go.jp/api/iiif/4009756/R0000010/full/1600,/0/default.jpg'], '翼面积按公开规格约21.3平方米；TAIC原始表230平方英尺约21.37平方米，差异来自原始英制数值与公制约数。'),
  plane('f86a', 'F-86A 佩刀', 'us', 1950, '后掠翼 · 机首进气 · 单尾喷口', usaf(196118, 'north-american-f-86a-sabre'),
    { length: 11.43, span: 11.30, wing: [[0,0.24],[1,-0.525374],[1,-0.805143],[0,-0.308567]], wingLevels: [-.10], body: 'jet', paint: 'silver', tail: 'swept', propellerBlades: 0, engines: 1, intake: 'nose', cockpit: .22, tailSpan: .3439115 }, ['https://ntrs.nasa.gov/api/citations/19930089401/downloads/19930089401.pdf','https://ntrs.nasa.gov/api/citations/19930086840/downloads/19930086840.pdf'], '主翼按 NACA 实测约 26.75 平方米和 0.51 梯形比校准；后掠采用四分之一弦线约 35°的口径，前缘约 38°，两者不可混用。'),
  plane('mig21pf', '米格-21PF', 'su', 1965, '三角翼 · 机首进气锥 · 独立水平尾翼', usaf(195970, 'mikoyan-gurevich-mig-21pf-fishbed-d'),
    { length: 15.76, span: 7.15, wing: [[0,0.27],[1,-0.428606],[1,-0.486982],[0,-0.488067]], wingLevels: [-.10], body: 'jet', paint: 'silver', tail: 'delta', propellerBlades: 0, engines: 1, intake: 'nose', cockpit: .21, tailSpan: .54 }, ['https://aviamuseum.com.ua/en/exposition/exposition/kb-mig/195-mig-21pf','https://mapsairmuseum.org/wp-content/uploads/2024/02/MiG-21.pdf']),
  plane('f16a', 'F-16A 战隼', 'us', 1980, '边条翼 · 腹部进气 · 单发与单垂尾', usaf(196735, 'general-dynamics-f-16a-fighting-falcon'),
    { length: 15.09, span: 9.144, wing: [[0,0.42],[0.23,0.08],[1,-0.311518],[1,-0.461286],[0,-0.461286]], wingLevels: [-.03], body: 'jet', paint: 'grey', tail: 'swept', propellerBlades: 0, engines: 1, intake: 'chin', cockpit: .39, tailSpan: 0.6009444 }, ['https://ntrs.nasa.gov/api/citations/19930022544/downloads/19930022544.pdf','https://falcon.blu3wolf.com/Docs/USAF-F16.pdf'], '主翼面板9.144米，不含翼尖挂轨和导弹。采用早期小平尾，下反10°；手册49平方英尺按露出翼面计算。'),
  plane('mirage2000c', '幻影 2000C', 'fr', 1984, '无平尾三角翼 · 两侧进气 · 单发动机', 'https://www.dassault-aviation.com/en/defense/customer-support/operational-aircraft/mirage-2000/',
    { length: 14.34, span: 9.13, wing: [[0,0.3],[0.26,0.18],[0.97,-0.546],[1,-0.58],[1,-0.675],[0.26,-0.72],[0,-0.72]], wingLevels: [-.08], body: 'jet', paint: 'grey', tail: 'delta', propellerBlades: 0, engines: 1, intake: 'side', cockpit: .36, tailSpan: 0 }, ['https://www.defense.gouv.fr/sites/default/files/air/Fiche%20technique%20Mirage%202000D.pdf'], '尺寸采用 Dassault 的全长 14.34 米；轮廓另核对法国军方册内制造商单座型三视图，该图采用 14.55 米的长度口径。'),
  plane('rafale-c', '阵风 C', 'fr', 2006, '鸭式三角翼 · 双发喷口 · 两侧进气', 'https://www.dassault-aviation.com/en/group/about-us/civil-and-military-aircraft/',
    { length: 15.3, span: 9.95, wing: [[0,.320256],[1,-.42],[1,-.55],[0,-.55]], wingLevels: [-.08], body: 'jet', paint: 'grey', tail: 'canard', propellerBlades: 0, engines: 2, intake: 'side', cockpit: .38, tailSpan: .4572864 }, ['https://www.dassault-aviation.com/fr/defense/rafale/','https://www.defense.gouv.fr/sites/default/files/air/Rafale%20F4.pdf'], '采用2006年C型外形；裸翼展约9.95米，军方图10.9米含翼尖导弹。F3-R册只核对共用机体轮廓。'),
  plane('gripen-c', 'JAS 39C 鹰狮', 'se', 2002, '近耦鸭翼 · 单发 · 翼尖挂轨', 'https://www.saab.com/products/gripen-c-series',
    { length: 14.9, span: 8.4, wing: [[0,0.25],[1,-0.35],[1,-0.49],[0,-0.48]], wingLevels: [-.08], body: 'jet', paint: 'grey', tail: 'canard', propellerBlades: 0, engines: 1, intake: 'side', cockpit: .35, tailSpan: .47 }, ['https://www.saab.com/newsroom/press-releases/2002/saab-delivers-latest-gripen-the-first-jas-39c-for-sweden','https://www.saab.com/globalassets/products/aeronautics/gripen-c-series/gripen_c_factsheet.pdf'], '全长采用 Saab 当前公布的 14.9 米（含机首突出部）；2002 年为 39C 交付并列装年份。'),
  sub('u9', 'U 9 级', 'de', 1914, '一战细长双壳 · 低矮围壳 · 双轴推进', 'https://uboat.net/wwi/types/?type=U+9',
    { length: 57.38, beam: 6, hull: 'double', sail: [[-.40,-.50],[.40,-.50],[.40,.50],[-.40,.50]], sailHeight: .08, sailLength: .08, sailY: .12, shafts: 2, blades: 3, planes: 'bow', rudder: 'cruciform', deckGun: false, casing: .76 }, [], '展示一战早期外形，不加装后期甲板炮；本级 1910 年起服役。'),
  sub('type-viic', 'VII C 型', 'de', 1941, '尖艏甲板 · 开放指挥台 · 前部甲板炮', 'https://uboat.net/types/viic.htm',
    { length: 67.1, beam: 6.2, hull: 'double', sail: [[-.34,-.56],[.38,-.46],[.43,.30],[.25,.56],[-.25,.56],[-.43,.30]], sailHeight: .11, sailLength: .13, sailY: .10, shafts: 2, blades: 3, planes: 'bow', rudder: 'cruciform', deckGun: true, casing: .82 }),
  sub('gato', '猫鲨级 Gato', 'us', 1942, '长巡航甲板 · 早期阶梯指挥台 · 后置甲板炮', 'https://www.history.navy.mil/research/histories/ship-histories/danfs/g/gato-i.html',
    { length: 95.02, beam: 8.31, hull: 'double', sail: [[-.44,-.55],[.44,-.55],[.44,.40],[.26,.58],[-.26,.58],[-.44,.40]], sailHeight: .09, sailLength: .12, sailY: .12, shafts: 2, blades: 4, planes: 'bow', rudder: 'cruciform', deckGun: true, casing: .90 }, ['https://navsource.net/archives/08/pdf/0821212.pdf'], '展示1942年早期外形，3英寸甲板炮置于围壳后方；后续围壳切削和炮位前移另记。'),
  sub('nautilus', '鹦鹉螺级 SSN-571', 'us', 1958, '早期核潜艇 · 长平甲板 · 无甲板炮与双轴', 'https://www.history.navy.mil/content/history/nhhc/research/histories/ship-histories/danfs/n/nautilus-ssn-571-iv.html',
    { length: 98.68, beam: 8.43, hull: 'double', sail: [[-.37,-.55],[.37,-.55],[.40,.34],[.16,.58],[-.16,.58],[-.40,.34]], sailHeight: .11, sailLength: .13, sailY: .25, shafts: 2, blades: 5, planes: 'bow', rudder: 'cruciform', deckGun: false, casing: .85 }, ['https://ussnautilus.org/common-questions-about-uss-nautilus-ssn-571/'], '长度按美国海军 DANFS 的 323 英尺 9 英寸；博物馆另列约 319 英尺，两种口径不混用。'),
  sub('oberon', '奥伯龙级', 'gb', 1969, '隆起艏声呐 · 高围壳 · 双轴常规动力', 'https://seapower.navy.gov.au/history/units/hmas-ovens',
    { length: 89.9, beam: 8.1, hull: 'double', sail: [[-.30,-.58],[.30,-.58],[.36,.43],[.13,.58],[-.13,.58],[-.36,.43]], sailHeight: .12, sailLength: .13, sailY: .17, shafts: 2, blades: 5, planes: 'bow', rudder: 'cruciform', deckGun: false, casing: .78 }, ['https://seapower.navy.gov.au/history/units/hmas-oxley-ii'], '英国设计的奥伯龙级；此处采用澳大利亚 Ovens 1969 年服役外形作为参考，不按运营国重复计舰级。'),
  sub('virginia-block-i', '弗吉尼亚级 Block I', 'us', 2004, '水滴形单轴艇体 · 艏水平舵 · 低矮围壳', 'https://www.navy.mil/Resources/Fact-Files/Display-FactFiles/Article/2169558/attack-submarines-ssn/',
    { length: 114.91, beam: 10.36, hull: 'streamlined', sail: [[-.24,-.56],[.24,-.56],[.32,.34],[.12,.58],[-.12,.58],[-.32,.34]], sailHeight: .09, sailLength: .12, sailY: .29, shafts: 1, blades: 7, planes: 'bow', rudder: 'cruciform', deckGun: false, casing: 0 }, ['https://www.csp.navy.mil/Media/News-Admin/Article/683783/hawaii-visits-yokosuka-during-western-pacific-deployment/'], '采用早期 Block I 外形；泵喷推进器仅表现公开的导管轮廓，不声称复原内部叶片。'),
  sub('type-212a', '212A 型 第一批', 'de', 2005, '短粗单轴艇体 · X 形尾舵 · 围壳水平舵', 'https://www.bundeswehr.de/de/ausruestung-technik-bundeswehr/seesysteme-bundeswehr/u-boot-klasse-212-a',
    { length: 56, beam: 7, hull: 'streamlined', sail: [[-.27,-.55],[.27,-.55],[.36,.30],[.17,.56],[-.17,.56],[-.36,.30]], sailHeight: .17, sailLength: .19, sailY: .15, shafts: 1, blades: 7, planes: 'sail', rudder: 'x', deckGun: false, casing: 0 }),
  sub('soryu-early', '苍龙级 初期型', 'jp', 2009, '围壳水平舵 · X 形尾舵 · 单轴推进', 'https://www.mod.go.jp/msdf/equipment/ships/ss/souryu/',
    { length: 84, beam: 9.1, hull: 'streamlined', sail: [[-.24,-.60],[.24,-.60],[.32,.38],[.15,.60],[-.15,.60],[-.32,.38]], sailHeight: .13, sailLength: .16, sailY: .26, shafts: 1, blades: 7, planes: 'sail', rudder: 'x', deckGun: false, casing: 0 }, ['https://www.mod.go.jp/atla/research/dts2012/R2-2p.pdf'], '展示 2009 年服役的初期 AIP 型，不混用后期锂电池艇配置。'),
];

export const ARCHIVE_COUNTRIES = [...NAVIES, { id: 'se', name: '瑞典' }] as const;
export const ARCHIVE: readonly ArchiveEntry[] = [
  ...HISTORICAL_SHIPS.map(ship => ({ id: ship.id, modelId: historicalModel(ship.id), name: ship.name, country: ship.navy, year: ship.year, kind: ship.kind, feature: ship.feature, source: ship.source, references: [], note: '既有舰库外观；沿用历史舰库的原型与年份口径。', category: 'surface' as const })),
  ...NEW_ARCHIVE,
];
export function archiveEra(year: number): ArchiveEra {
  return year <= 1918 ? 'ww1' : year <= 1945 ? 'interwar-ww2' : year <= 1991 ? 'cold-war' : 'modern';
}
export function filterArchive(country = 'all', category = 'all', era = 'all'): readonly ArchiveEntry[] {
  return ARCHIVE.filter(entry => (country === 'all' || entry.country === country) && (category === 'all' || entry.category === category) && (era === 'all' || archiveEra(entry.year) === era));
}
