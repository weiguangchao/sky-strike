import type { ShipKind, PartId, Point } from './types.ts';
import { HULLS } from './campaign.ts';

export type NavalHull = Exclude<ShipKind, 'coastal-battery' | 'oil-depot'>;
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
export type HistoricalKind = '战列舰' | '战列巡洋舰' | '航空母舰' | '重巡洋舰' | '轻巡洋舰' | '装甲巡洋舰' | '装甲舰' | '驱逐舰' | '岸防舰' | '护卫舰' | '扫雷护航舰' | '鱼雷艇' | '武装运输船' | '炮舰';
export interface MainMount { barrels:number; y:number; x:number; raised:number; bearing:number; calibre?:number }
export interface NavalGeometry {
  length:number; beam:number; calibre:number; guns:readonly MainMount[];
  funnels:readonly number[]; bridge:'tower'|'pagoda'|'tripod'|'low'|'island'; bridgeY:number;
  islandSide?:-1|1; lifts?:readonly (readonly [number,number])[];
  deck?:'wood'|'steel'|'armoured'|'linoleum'; funnelStyle?:'raked'|'trunked'|'side';
  torpedoes?:number; catapults?:number; catapultStations?:readonly (readonly [number,number,number,number?])[]; openGuns?:boolean; bowStripes?:boolean;
  secondary?:readonly MainMount[];
}
export interface HistoricalShip {
  id:string; name:string; navy:NavyId; year:number; kind:HistoricalKind; hull:NavalHull;
  source:string; feature:string; geometry:NavalGeometry;
}
// Superfiring bores must clear the lower gunhouse at the game's pixel scale.
const mount=(barrels:number,y:number,x=0,raised=0,bearing=y<0?180:0):MainMount=>({barrels,y,x,raised:raised?Math.max(.16,raised):0,bearing});
const triple=(barrels=3)=>[mount(barrels,.69),mount(barrels,.41,0,.10),mount(barrels,-.58)];
const four=(barrels=2)=>[mount(barrels,.72),mount(barrels,.46,0,.10),mount(barrels,-.46,0,.10),mount(barrels,-.72)];
const two=(barrels=2)=>[mount(barrels,.71),mount(barrels,-.71)];
const secondaryPairs=(barrels:number,calibre:number,...stations:number[])=>[-1,1].flatMap(side=>stations.map(y=>({...mount(barrels,y,side*.61,0,-side*90),calibre})));
const fiveSingle=()=>[mount(1,.74),mount(1,.50,0,.08),mount(1,-.30,0,0,90),mount(1,-.53,0,.08),mount(1,-.75)];
const broadside=(count:number)=>[
  mount(1,.81),mount(1,-.81),
  ...Array.from({length:(count-2)/2},(_,i)=>[-1,1].map(side=>mount(1,.49-i*.98/((count-2)/2-1),side*.68,0,-side*90))).flat(),
];
const ref=(path:string)=>`https://www.navypedia.org/ships/${path}.htm`;
function ship<const Id extends string>(id:Id,name:string,navy:NavyId,year:number,kind:HistoricalKind,hull:NavalHull,path:string,feature:string,geometry:NavalGeometry):HistoricalShip&{id:Id} {
  return {id,name,navy,year,kind,hull,source:path.startsWith('https:')?path:ref(path),feature,geometry};
}

export const HISTORICAL_SHIPS = [
  // Sources and appearance dates deliberately exclude post-war missile/angled-deck refits.
  ship('iowa','衣阿华','us',1944,'战列舰','battleship','usa/us_bb_iowa','修长舰艏 · 三座三联主炮 · 双烟囱',
    {length:270.4,beam:33,calibre:406,guns:triple(),funnels:[.06,-.26],bridge:'tower',bridgeY:.29,catapults:2,secondary:secondaryPairs(2,127,.24,.07,-.10,-.27,-.43)}),
  ship('south-dakota','南达科他','us',1942,'战列舰','battleship','usa/us_bb_sdakota','紧凑宽舰体 · 三联主炮 · 单烟囱',
    {length:207.3,beam:33,calibre:406,guns:triple(),funnels:[-.12],bridge:'tower',bridgeY:.25,catapults:2,secondary:secondaryPairs(2,127,.22,.04,-.17,-.37)}),
  ship('arizona','亚利桑那','us',1941,'战列舰','battleship','usa/us_bb_pennsylvania','四座三联主炮 · 三脚桅 · 单烟囱',
    {length:185.3,beam:32.4,calibre:356,guns:four(3),funnels:[-.10],bridge:'tripod',bridgeY:.27,catapults:2}),
  ship('enterprise','企业 CV-6','us',1942,'航空母舰','fleet-carrier','usa/us_cv_yorktown','直通木甲板 · 右舷舰岛 · 三部升降机',
    {length:251.4,beam:33.4,calibre:127,guns:[],funnels:[.10],bridge:'island',bridgeY:.16,lifts:[[0,.57],[0,-.02],[0,-.61]],islandSide:1}),
  ship('essex','埃塞克斯','us',1944,'航空母舰','fleet-carrier','usa/us_cv_essex','直通甲板 · 左舷舷侧升降机 · 大舰岛',
    {length:265.8,beam:45,calibre:127,guns:[],funnels:[.02],bridge:'island',bridgeY:.19,lifts:[[0,.57],[-.83,.04],[0,-.62]],islandSide:1}),
  ship('fletcher','弗莱彻','us',1942,'驱逐舰','destroyer','usa/us_dd_fletcher','五座单装炮 · 双烟囱 · 两组鱼雷管',
    {length:114.7,beam:12.1,calibre:127,guns:fiveSingle(),funnels:[.15,-.08],bridge:'low',bridgeY:.38,torpedoes:2,deck:'steel'}),
  ship('cleveland','克利夫兰','us',1943,'轻巡洋舰','cruiser','usa/us_cr_cleveland','四座三联炮 · 双烟囱 · 舰艉弹射器',
    {length:186,beam:20.2,calibre:152,guns:four(3),funnels:[.06,-.23],bridge:'tower',bridgeY:.29,catapults:2}),
  ship('brooklyn','布鲁克林','us',1942,'轻巡洋舰','cruiser','usa/us_cr_brooklyn','前三后二共五座三联炮 · 双烟囱',
    {length:185.4,beam:18.8,calibre:152,guns:[mount(3,.83),mount(3,.64,0,.09),mount(3,.43,0,0,180),mount(3,-.55,0,.09),mount(3,-.79)],funnels:[.04,-.23],bridge:'tower',bridgeY:.12,catapults:2}),
  ship('pt-109','PT-109','us',1943,'鱼雷艇','patrol-boat','usa/us_pt_pt103','低矮驾驶舱 · 四根鱼雷管 · 艉部机炮',
    {length:24.4,beam:6.3,calibre:20,guns:[],funnels:[],bridge:'low',bridgeY:.28,torpedoes:4,deck:'steel'}),
  ship('john-w-brown','约翰·布朗','us',1944,'武装运输船','transport','https://www.ssjohnwbrown.org/history','自由轮 · 中部驾驶台 · 五货舱与吊杆',
    {length:134.6,beam:17.3,calibre:127,guns:[mount(1,-.85)],funnels:[-.08],bridge:'low',bridgeY:.12,deck:'steel'}),
  ship('missouri','密苏里','us',1945,'战列舰','battleship','usa/us_bb_iowa','衣阿华级 · 三座三联406毫米炮 · 双烟囱',
    {length:270.4,beam:33,calibre:406,guns:triple(),funnels:[.06,-.26],bridge:'tower',bridgeY:.29,catapults:2,secondary:secondaryPairs(2,127,.24,.07,-.10,-.27,-.43)}),
  ship('baltimore','巴尔的摩','us',1944,'重巡洋舰','cruiser','usa/us_cr_baltimore','三座三联203毫米炮 · 双烟囱 · 艉部机库',
    {length:205.3,beam:21.6,calibre:203,guns:triple(),funnels:[.04,-.24],bridge:'tower',bridgeY:.29,catapults:2}),

  ship('warspite','厌战','gb',1942,'战列舰','battleship','uk/brit_bb1_queen_elizabeth','四座双联主炮 · 重建塔桥 · 单烟囱',
    {length:196.8,beam:31.7,calibre:381,guns:four(),funnels:[-.12],bridge:'tower',bridgeY:.26,catapults:1,catapultStations:[[0,-.31,90]]}),
  ship('king-george-v','乔治五世','gb',1941,'战列舰','battleship','uk/brit_bb1_king_george_v','前四联加双联、后四联 · 双烟囱',
    {length:227.1,beam:31.4,calibre:356,guns:[mount(4,.72),mount(2,.44,0,.12),mount(4,-.65)],funnels:[.03,-.25],bridge:'tower',bridgeY:.28,catapults:1,secondary:secondaryPairs(2,133,.24,.06,-.14,-.34),catapultStations:[[0,-.10,90]]}),
  ship('hood','胡德','gb',1941,'战列巡洋舰','battleship','uk/brit_bb1_hood','长舰体 · 四座双联炮 · 分隔双烟囱',
    {length:262.1,beam:31.7,calibre:381,guns:four(),funnels:[.05,-.24],bridge:'tripod',bridgeY:.29}),
  ship('rodney','罗德尼','gb',1941,'战列舰','battleship','uk/brit_bb1_nelson','三座三联炮全部前置 · 后置塔桥',
    {length:216.4,beam:32.3,calibre:406,guns:[mount(3,.75),mount(3,.50,0,.12),mount(3,.25,0,0,60)],funnels:[-.43],bridge:'tower',bridgeY:-.06,secondary:secondaryPairs(2,152,-.34,-.55,-.74)}),
  ship('ark-royal','皇家方舟','gb',1941,'航空母舰','fleet-carrier','uk/brit_cv1_ark_royal','圆弧舰艏 · 右舷舰岛 · 三部升降机',
    {length:243.8,beam:29,calibre:114,guns:[],funnels:[-.01],bridge:'island',bridgeY:.16,lifts:[[0,.57],[0,.03],[0,-.58]],islandSide:1}),
  ship('illustrious','光辉','gb',1940,'航空母舰','fleet-carrier','uk/brit_cv1_illustrious','装甲直通甲板 · 两部升降机 · 右舷舰岛',
    {length:229.6,beam:32.5,calibre:114,guns:[],funnels:[-.01],bridge:'island',bridgeY:.18,lifts:[[0,.54],[0,-.59]],islandSide:1,deck:'armoured'}),
  ship('cossack','哥萨克','gb',1939,'驱逐舰','destroyer','uk/brit_dd_tribal','部族级 · 四座双联主炮 · 双烟囱',
    {length:114.9,beam:11.1,calibre:120,guns:four(),funnels:[.13,-.13],bridge:'low',bridgeY:.36,torpedoes:1,deck:'steel'}),
  ship('belfast','贝尔法斯特','gb',1943,'轻巡洋舰','cruiser','uk/brit_cr_edinburgh','四座三联152毫米炮 · 双烟囱 · 中部航空区',
    {length:187,beam:20.2,calibre:152,guns:four(3),funnels:[.09,-.25],bridge:'tower',bridgeY:.30,torpedoes:2,catapults:1,catapultStations:[[0,-.07,90]]}),
  ship('renown','声望','gb',1944,'战列巡洋舰','battleship','uk/brit_bb1_renown16','长舰体 · 三座双联381毫米炮 · 双烟囱',
    {length:242,beam:31.3,calibre:381,guns:triple(2),funnels:[.06,-.25],bridge:'tower',bridgeY:.28}),

  ship('yamato','大和','jp',1945,'战列舰','battleship','japan/jap_bb_yamato','三座三联巨炮 · 塔式舰桥 · 后部航空甲板',
    {length:263,beam:36.9,calibre:460,guns:triple(),funnels:[-.10],bridge:'tower',bridgeY:.06,catapults:2,secondary:[{...mount(3,.23,0,.40),calibre:155},{...mount(3,-.35,0,.25),calibre:155}]}),
  ship('nagato','长门','jp',1944,'战列舰','battleship','japan/jap_bb_nagato','四座双联炮 · 高耸舰桥 · 单烟囱',
    {length:224.9,beam:33,calibre:410,guns:four(),funnels:[-.09],bridge:'pagoda',bridgeY:.28,catapults:1,catapultStations:[[0,-.31,90]]}),
  ship('kongo','金刚','jp',1944,'战列舰','battleship','japan/jap_bb_kongo','修长高速舰体 · 四座双联炮 · 双烟囱',
    {length:222.1,beam:29.3,calibre:356,guns:four(),funnels:[.04,-.25],bridge:'pagoda',bridgeY:.28,catapults:1,catapultStations:[[.50,-.36,-70,1]]}),
  ship('akagi','赤城','jp',1942,'航空母舰','fleet-carrier','japan/jap_cv_akagi','左舷舰岛 · 右舷下弯烟道 · 三部升降机',
    {length:260.7,beam:31.3,calibre:127,guns:[],funnels:[.0],bridge:'island',bridgeY:.05,lifts:[[0,.57],[0,-.02],[0,-.62]],islandSide:-1,funnelStyle:'side'}),
  ship('kaga','加贺','jp',1942,'航空母舰','fleet-carrier','japan/jap_cv_kaga','宽阔木甲板 · 右舷舰岛 · 下弯烟道',
    {length:248.6,beam:32.5,calibre:127,guns:[],funnels:[-.08],bridge:'island',bridgeY:.24,lifts:[[0,.57],[0,-.02],[0,-.62]],islandSide:1,funnelStyle:'side'}),
  ship('shokaku','翔鹤','jp',1942,'航空母舰','fleet-carrier','japan/jap_cv_shokaku','细长甲板 · 小舰岛 · 右舷双烟道',
    {length:257.5,beam:29,calibre:127,guns:[],funnels:[-.02,-.22],bridge:'island',bridgeY:.28,lifts:[[0,.55],[0,-.04],[0,-.61]],islandSide:1,funnelStyle:'side'}),
  ship('mogami','最上','jp',1941,'重巡洋舰','cruiser','japan/jap_cr_mogami','改装后五座双联203毫米炮 · 集中舰桥',
    {length:200.6,beam:19,calibre:203,guns:[mount(2,.83),mount(2,.64,0,0,90),mount(2,.44,0,.11),mount(2,-.56,0,.09),mount(2,-.80)],funnels:[.02,-.22],bridge:'pagoda',bridgeY:.24,torpedoes:4,catapults:2,funnelStyle:'trunked',deck:'linoleum',catapultStations:[[-.50,-.35,90,1],[.50,-.35,-90,1]]}),
  ship('fubuki','吹雪','jp',1941,'驱逐舰','destroyer','japan/jap_dd_fubuki','前一后二的三座双联炮 · 三组鱼雷管',
    {length:118.4,beam:10.4,calibre:127,guns:[mount(2,.78),mount(2,-.52,0,.08),mount(2,-.78)],funnels:[.21,-.05],bridge:'low',bridgeY:.43,torpedoes:3,deck:'linoleum'}),
  ship('hiryu','飞龙','jp',1942,'航空母舰','fleet-carrier','japan/jap_cv_hiryu','左舷舰岛 · 右舷双烟道 · 三部升降机',
    {length:227.4,beam:27,calibre:127,guns:[],funnels:[.02,-.18],bridge:'island',bridgeY:.15,lifts:[[0,.55],[0,-.02],[0,-.59]],islandSide:-1,funnelStyle:'side'}),
  ship('soryu','苍龙','jp',1942,'航空母舰','fleet-carrier','japan/jap_cv_soryu','右舷前置小舰岛 · 右舷双烟道',
    {length:227.5,beam:26,calibre:127,guns:[],funnels:[-.01,-.21],bridge:'island',bridgeY:.31,lifts:[[0,.56],[0,-.02],[0,-.59]],islandSide:1,funnelStyle:'side'}),
  ship('shinano','信浓','jp',1944,'航空母舰','fleet-carrier','japan/jap_cv_shinano','大和级船体改装 · 装甲甲板 · 大型右舷舰岛',
    {length:266,beam:41.5,calibre:127,guns:[],funnels:[-.02],bridge:'island',bridgeY:.18,lifts:[[0,.53],[0,-.58]],islandSide:1,funnelStyle:'trunked',deck:'armoured'}),
  ship('musashi','武藏','jp',1944,'战列舰','battleship','japan/jap_bb_yamato','大和级 · 三座三联460毫米炮 · 宽阔航空艉甲板',
    {length:263,beam:36.9,calibre:460,guns:triple(),funnels:[-.10],bridge:'tower',bridgeY:.06,catapults:2,secondary:[{...mount(3,.23,0,.40),calibre:155},{...mount(3,-.35,0,.25),calibre:155}]}),

  ship('bismarck','俾斯麦','de',1941,'战列舰','battleship','germany/ger_bb_bismarck','前后各两座双联主炮 · 单粗烟囱',
    {length:250,beam:36,calibre:380,guns:four(),funnels:[-.09],bridge:'tower',bridgeY:.27,catapults:2,secondary:secondaryPairs(2,149,.25,-.07,-.36),catapultStations:[[-.36,-.24,90,.70],[.36,-.24,90,.70]]}),
  ship('scharnhorst','沙恩霍斯特','de',1943,'战列舰','battleship','germany/ger_bb_scharnhorst','三座三联283毫米炮 · 单烟囱 · 飞剪艏',
    {length:234.9,beam:30,calibre:283,guns:triple(),funnels:[-.08],bridge:'tower',bridgeY:.28,catapults:1,catapultStations:[[0,-.31,90]]}),
  ship('graf-spee','斯佩伯爵','de',1939,'装甲舰','cruiser','germany/ger_cr_deutschland','前后两座三联283毫米炮 · 高大塔桥',
    {length:186,beam:21.7,calibre:283,guns:two(3),funnels:[-.14],bridge:'tower',bridgeY:.36,catapults:1,torpedoes:2,catapultStations:[[0,-.34,90]]}),
  ship('prinz-eugen','欧根亲王','de',1941,'重巡洋舰','cruiser','germany/ger_cr_eugen','四座双联炮 · 单烟囱 · 艉部机库',
    {length:207.7,beam:21.7,calibre:203,guns:four(),funnels:[-.05],bridge:'tower',bridgeY:.28,catapults:1,torpedoes:4,catapultStations:[[0,-.23,90]]}),
  ship('tirpitz','提尔皮茨','de',1943,'战列舰','battleship','germany/ger_bb_bismarck','俾斯麦级 · 四座双联主炮 · 单粗烟囱',
    {length:253.6,beam:36,calibre:380,guns:four(),funnels:[-.09],bridge:'tower',bridgeY:.27,catapults:2,secondary:secondaryPairs(2,149,.25,-.07,-.36),catapultStations:[[-.36,-.24,90,.70],[.36,-.24,90,.70]]}),

  ship('littorio','利托里奥','it',1942,'战列舰','battleship','italy/it_bb_vittorio_veneto','三座三联381毫米炮 · 双烟囱 · 识别条纹艏',
    {length:237.8,beam:32.8,calibre:381,guns:triple(),funnels:[.05,-.23],bridge:'tower',bridgeY:.29,catapults:1,bowStripes:true,secondary:secondaryPairs(3,152,.22,-.40)}),
  ship('giulio-cesare','朱利奥·凯撒','it',1940,'战列舰','battleship','italy/it_bb_giulio_cesare','重建舰艏 · 三联与双联混合炮塔 · 双烟囱',
    {length:186.4,beam:28.6,calibre:320,guns:[mount(3,.80),mount(2,.54,0,.09),mount(2,-.52,0,.09),mount(3,-.77)],funnels:[.05,-.23],bridge:'tower',bridgeY:.28}),
  ship('zara','扎拉','it',1941,'重巡洋舰','cruiser','italy/it_cr_zara','四座双联203毫米炮 · 双烟囱 · 艏部弹射器',
    {length:182.8,beam:20.6,calibre:203,guns:four(),funnels:[.06,-.23],bridge:'tower',bridgeY:.28,catapults:1,bowStripes:true}),
  ship('maestrale','西北风','it',1940,'驱逐舰','destroyer','italy/it_dd_maestrale','前后双联炮 · 双烟囱 · 两组三联鱼雷管',
    {length:106.7,beam:10.2,calibre:120,guns:two(),funnels:[.18,-.11],bridge:'low',bridgeY:.42,torpedoes:2,deck:'steel'}),
  ship('roma','罗马','it',1943,'战列舰','battleship','italy/it_bb_vittorio_veneto','利托里奥级 · 三座三联主炮 · 加长舰艏',
    {length:240.7,beam:32.8,calibre:381,guns:triple(),funnels:[.05,-.23],bridge:'tower',bridgeY:.29,catapults:1,bowStripes:true,secondary:secondaryPairs(3,152,.22,-.40)}),

  ship('richelieu','黎塞留','fr',1940,'战列舰','battleship','france/fr_bb_richelieu','两座四联主炮全部前置 · 烟囱与后桅合一',
    {length:247.9,beam:33,calibre:380,guns:[mount(4,.72),mount(4,.43,0,.12)],funnels:[-.23],bridge:'tower',bridgeY:.16,catapults:2,funnelStyle:'trunked',secondary:[...secondaryPairs(3,152,-.48),{...mount(3,-.74),calibre:152}]}),
  ship('dunkerque','敦刻尔克','fr',1940,'战列舰','battleship','france/fr_bb_dunkerque','两座前置四联330毫米炮 · 长后甲板',
    {length:215.1,beam:31.1,calibre:330,guns:[mount(4,.72),mount(4,.43,0,.12)],funnels:[-.26],bridge:'tower',bridgeY:.16,catapults:1,secondary:[...secondaryPairs(4,130,-.48),{...mount(4,-.74),calibre:130},...secondaryPairs(2,130,-.10)]}),
  ship('algerie','阿尔及利亚','fr',1939,'重巡洋舰','cruiser','france/fr_cr_algerie','四座双联炮 · 方形塔桥 · 单烟囱',
    {length:186.2,beam:20,calibre:203,guns:four(),funnels:[-.10],bridge:'tower',bridgeY:.28,torpedoes:2,catapults:1,catapultStations:[[-.55,-.04,90,.85]]}),
  ship('le-fantasque','空想','fr',1940,'驱逐舰','destroyer','france/fr_dd_le_fantasque','五座单装炮 · 两根大烟囱 · 三组鱼雷管',
    {length:132.4,beam:12.5,calibre:139,guns:fiveSingle(),funnels:[.16,-.08],bridge:'low',bridgeY:.39,torpedoes:3,openGuns:true,deck:'steel'}),

  ship('marat','马拉','su',1940,'战列舰','battleship','russia/ru_bb_sevastopol','四座平甲板三联炮 · 双烟囱 · 前桅塔桥',
    {length:184.9,beam:27.3,calibre:305,guns:[mount(3,.80),mount(3,.22,0,0,90),mount(3,-.30,0,0,180),mount(3,-.79)],funnels:[.39,-.10],bridge:'tripod',bridgeY:.57}),
  ship('kirov','基洛夫','su',1941,'轻巡洋舰','cruiser','russia/ru_cr_kirov','三座三联180毫米炮 · 双烟囱 · 四脚前桅',
    {length:191.3,beam:17.7,calibre:180,guns:triple(),funnels:[.06,-.24],bridge:'tripod',bridgeY:.28,torpedoes:2,catapults:1,catapultStations:[[0,-.09,90]]}),
  ship('tashkent','塔什干','su',1942,'驱逐舰','destroyer','russia/ru_dd_tashkent','蓝灰舰体 · 三座双联炮 · 双烟囱',
    {length:139.8,beam:13.7,calibre:130,guns:[mount(2,.79),mount(2,-.54,0,.08),mount(2,-.79)],funnels:[.15,-.11],bridge:'low',bridgeY:.41,torpedoes:3,deck:'steel'}),

  ship('ning-hai','宁海','cn',1937,'轻巡洋舰','cruiser','china/ch_cr_ning_hai','三座双联140毫米炮 · 双烟囱 · 小型机库',
    {length:109.7,beam:11.9,calibre:140,guns:[mount(2,.79),mount(2,-.52,0,.09),mount(2,-.78)],funnels:[.14,-.15],bridge:'tripod',bridgeY:.42,torpedoes:2}),
  ship('yat-sen','逸仙','cn',1937,'炮舰','destroyer','china/ch_of_i_hsien','艏艉单装大炮 · 低矮上层建筑 · 单烟囱',
    {length:83.8,beam:10.5,calibre:152,guns:two(1),funnels:[-.06],bridge:'low',bridgeY:.34,openGuns:true}),

  ship('de-ruyter','德鲁伊特','nl',1942,'轻巡洋舰','cruiser','netherlands/nl_cr_de_ruyter','三座双联加一座单装炮 · 高塔桥 · 双烟囱',
    {length:170.8,beam:15.7,calibre:149,guns:[mount(2,.80),mount(1,.54,0,.10),mount(2,-.53,0,.10),mount(2,-.78)],funnels:[.05,-.23],bridge:'tower',bridgeY:.28,catapults:1,catapultStations:[[0,-.36,90]]}),
  ship('java','爪哇','nl',1942,'轻巡洋舰','cruiser','netherlands/nl_cr_java','十座单装炮 · 舷侧炮列 · 双烟囱',
    {length:155.3,beam:16,calibre:149,guns:[mount(1,.83),mount(1,.61),mount(1,-.59),mount(1,-.82),...[-1,1].flatMap(side=>[.36,.02,-.32].map(y=>mount(1,y,side*.68,0,-side*90)))],funnels:[.15,-.17],bridge:'tripod',bridgeY:.43,openGuns:true}),
  ship('kortenaer','科特纳尔','nl',1942,'驱逐舰','destroyer','netherlands/nl_dd_van_ghent','四座单装炮 · 双烟囱 · 两组鱼雷管',
    {length:98.2,beam:9.53,calibre:120,guns:four(1),funnels:[.13,-.12],bridge:'low',bridgeY:.36,torpedoes:2,openGuns:true,deck:'steel'}),

  ship('blyskawica','闪电','pl',1939,'驱逐舰','destroyer','poland/pl_dd_grom','七门120毫米炮 · 前单装与双联混合 · 双烟囱',
    {length:114,beam:11.3,calibre:120,guns:[mount(1,.82),mount(2,.56,0,.08),mount(2,-.54,0,.08),mount(2,-.79)],funnels:[.13,-.12],bridge:'low',bridgeY:.35,torpedoes:2,deck:'steel'}),
  ship('piorun','雷电','pl',1941,'驱逐舰','destroyer','poland/pl_dd_piorun','三座双联主炮 · 单烟囱 · 五联鱼雷管',
    {length:108.7,beam:10.9,calibre:120,guns:triple(2),funnels:[-.04],bridge:'low',bridgeY:.29,torpedoes:1,deck:'steel'}),
  ship('haida','海达人','ca',1943,'驱逐舰','destroyer','canada/can_dd_iroquois','部族级 · 三座120毫米双联主炮 · 双烟囱',
    {length:114.9,beam:11.4,calibre:120,guns:[mount(2,.80),mount(2,.54,0,.08),mount(2,-.79)],funnels:[.13,-.12],bridge:'low',bridgeY:.34,torpedoes:1,deck:'steel'}),
  ship('sackville','萨克维尔','ca',1942,'护卫舰','patrol-boat','canada/can_es_flower','花级护航舰 · 艏部单装炮 · 艉部深弹架',
    {length:62.5,beam:10.1,calibre:102,guns:[mount(1,.73)],funnels:[-.08],bridge:'low',bridgeY:.30,openGuns:true,deck:'steel'}),
  ship('sydney','悉尼 II','au',1941,'轻巡洋舰','cruiser','australia/aus_cr_sydney','四座双联炮 · 分隔双烟囱 · 中部弹射器',
    {length:171.4,beam:17.3,calibre:152,guns:four(),funnels:[.10,-.28],bridge:'tower',bridgeY:.30,torpedoes:2,catapults:1,catapultStations:[[0,-.07,90]]}),
  ship('australia','澳大利亚 II','au',1943,'重巡洋舰','cruiser','australia/aus_cv_australia','郡级 · 四座双联203毫米炮 · 三烟囱',
    {length:192.9,beam:20.8,calibre:203,guns:four(),funnels:[.13,-.06,-.25],bridge:'tower',bridgeY:.32,torpedoes:2,catapults:1,catapultStations:[[0,-.35,90]]}),
  ship('achilles','阿基里斯','nz',1942,'轻巡洋舰','cruiser','new_zealand/nz_cr_achilles','利安德级 · 四座双联炮 · 单粗烟囱',
    {length:169,beam:17,calibre:152,guns:four(),funnels:[-.09],bridge:'tower',bridgeY:.28,torpedoes:2,catapults:1,catapultStations:[[0,-.29,90]]}),
  ship('stord','斯托尔德','no',1943,'驱逐舰','destroyer','norway/no_dd_stord','四座单装炮 · 单烟囱 · 两组四联鱼雷管',
    {length:110.6,beam:10.9,calibre:120,guns:four(1),funnels:[-.04],bridge:'low',bridgeY:.29,torpedoes:2,deck:'steel'}),
  ship('averof','阿韦罗夫','gr',1941,'装甲巡洋舰','cruiser','greece/gr_cr_averof','艏艉双联234毫米炮 · 四座舷侧双联炮 · 三烟囱',
    {length:140.8,beam:21,calibre:234,guns:[...two(),...[-1,1].flatMap(side=>[.33,-.33].map(y=>mount(2,y,side*.68,0,-side*90)))],funnels:[.18,-.04,-.26],bridge:'tripod',bridgeY:.48}),
  ship('dubrovnik','杜布罗夫尼克','yu',1941,'驱逐舰','destroyer','yugoslavia/yu_dd_dubrovnik','四座单装140毫米炮 · 双烟囱 · 长艏楼',
    {length:113.2,beam:10.7,calibre:140,guns:four(1),funnels:[.12,-.14],bridge:'low',bridgeY:.35,torpedoes:2,openGuns:true,deck:'steel'}),
  ship('ilmarinen','伊尔马里宁','fi',1941,'岸防舰','cruiser','finland/fi_bb_vainamoinen','短宽舰体 · 艏艉双联254毫米炮 · 高观测桅',
    {length:93,beam:16.9,calibre:254,guns:two(),funnels:[-.13],bridge:'tower',bridgeY:.30}),
  ship('regele-ferdinand','费迪南德国王','ro',1941,'驱逐舰','destroyer','romania/ro_dd_regele_ferdinand','五座单装炮 · 双烟囱 · 两组三联鱼雷管',
    {length:102,beam:9.6,calibre:120,guns:fiveSingle(),funnels:[.13,-.10],bridge:'low',bridgeY:.37,torpedoes:2,openGuns:true,deck:'steel'}),
  ship('thonburi','吞武里','th',1941,'岸防舰','cruiser','thailand/th_bb_sri_ayuthia','短宽舰体 · 艏艉双联203毫米炮 · 单烟囱',
    {length:76.5,beam:14.4,calibre:203,guns:two(),funnels:[-.14],bridge:'tower',bridgeY:.28}),
  ship('bahia','巴伊亚','br',1944,'轻巡洋舰','cruiser','brazil/br_cr_bahia','十座单装炮 · 舷侧炮列 · 改装后三烟囱',
    {length:122.4,beam:11.9,calibre:120,guns:broadside(10),funnels:[.21,0,-.21],bridge:'low',bridgeY:.46,torpedoes:2,openGuns:true}),
  ship('bengal','孟加拉','in',1942,'扫雷护航舰','patrol-boat','india/in_ms_punjab','巴瑟斯特级 · 艏部单装炮 · 扫雷深弹艉甲板',
    {length:56.7,beam:9.5,calibre:76,guns:[mount(1,.73)],funnels:[-.08],bridge:'low',bridgeY:.30,openGuns:true,deck:'steel'}),
  ship('natal','纳塔尔','za',1945,'护卫舰','destroyer','south_africa/saf_es_good_hope','湖级护卫舰 · 艏部单装炮 · 艉部反潜装具',
    {length:93.6,beam:11.8,calibre:102,guns:[mount(1,.75)],funnels:[-.12],bridge:'low',bridgeY:.31,openGuns:true,deck:'steel'}),
  ship('niels-juel','尼尔斯·尤尔','dk',1943,'岸防舰','cruiser','denmark/dk_bb_niels_iuel','十座单装150毫米炮 · 高塔桅 · 单烟囱',
    {length:90,beam:16.3,calibre:150,guns:broadside(10),funnels:[-.20],bridge:'tower',bridgeY:.36,openGuns:true}),
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
  for(const [hull,entry] of Object.entries(DEFAULT_FLEET))if(entry===id)return hull as NavalHull;
  return `historic-${id}`;
}
export function fleetSelection(value:unknown):FleetSelection {
  const result:FleetSelection={...DEFAULT_FLEET};
  if(!value||typeof value!=='object')return result;
  for(const hull of Object.keys(result) as NavalHull[]) {
    const id=(value as Record<string,unknown>)[hull];
    if(typeof id==='string'&&historicalShip(id)?.hull===hull)result[hull]=id as HistoricalShipId;
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
