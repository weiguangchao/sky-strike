type ServiceScope = '代表机服役期' | '代表艇服役期' | '舰级服役期' | '航母服役期' | '系列服役记录' | '系列服役期' | '中国服役期' | '德国服役期' | '美国服役期' | '英国服役期' | '法国服役期' | '意大利教练机使用期' | '意大利服役期' | '日本服役期' | '德国一战服役期' | '巡洋舰服役期' | '战列舰服役期' | '在役状态有异说';
const SERVICE_YEAR_SUFFIX = {
  present: '–至今',
  entry: '年入役',
  recorded: '年在役',
  snapshot: '年仍在役',
  listed: '年列入名录',
  delivered: '年首批交付',
  operational: '年首次作战',
} as const;
type ServiceYears = readonly [first: number, last: number | keyof typeof SERVICE_YEAR_SUFFIX, scope?: ServiceScope];

// Use the catalogued unit or class and its referenced service history.
// Numeric bounds are first and last years, including any breaks in service.
// A dated service record does not establish entry or retirement.
const SERVICE_YEARS: ReadonlyMap<string, ServiceYears> = new Map([
  ['iowa', [1943, 1990]], // https://en.wikipedia.org/wiki/USS_Iowa_(BB-61)
  ['south-dakota', [1942, 1947]], // https://en.wikipedia.org/wiki/USS_South_Dakota_(BB-57)
  ['arizona', [1916, 1941]], // https://en.wikipedia.org/wiki/USS_Arizona_(BB-39)
  ['enterprise', [1938, 1947]], // https://en.wikipedia.org/wiki/USS_Enterprise_(CV-6)
  ['essex', [1942, 1969]], // https://en.wikipedia.org/wiki/USS_Essex_(CV-9)
  ['fletcher', [1942, 1969]], // https://en.wikipedia.org/wiki/USS_Fletcher_(DD-445)
  ['cleveland', [1942, 1947]], // https://en.wikipedia.org/wiki/USS_Cleveland_(CL-55)
  ['brooklyn', [1937, 1947, '美国服役期']], // https://en.wikipedia.org/wiki/USS_Brooklyn_(CL-40)
  ['missouri', [1944, 1992]], // https://en.wikipedia.org/wiki/USS_Missouri_(BB-63)
  ['baltimore', [1943, 1956]], // https://en.wikipedia.org/wiki/USS_Baltimore_(CA-68)
  ['warspite', [1915, 1945]], // https://en.wikipedia.org/wiki/HMS_Warspite_(03)
  ['king-george-v', [1940, 1949]], // https://en.wikipedia.org/wiki/HMS_King_George_V_(41)
  ['hood', [1920, 1941]], // https://en.wikipedia.org/wiki/HMS_Hood
  ['rodney', [1927, 1946]], // https://en.wikipedia.org/wiki/HMS_Rodney_(29)
  ['ark-royal', [1938, 1941]], // https://en.wikipedia.org/wiki/HMS_Ark_Royal_(91)
  ['illustrious', [1940, 1955]], // https://en.wikipedia.org/wiki/HMS_Illustrious_(87)
  ['cossack', [1938, 1941]], // https://en.wikipedia.org/wiki/HMS_Cossack_(F03)
  ['belfast', [1939, 1963]], // https://en.wikipedia.org/wiki/HMS_Belfast
  ['renown', [1916, 1945]], // Paid off into reserve in 1945; sold for scrap in 1948.
  ['yamato', [1941, 1945]], // https://en.wikipedia.org/wiki/Japanese_battleship_Yamato
  ['nagato', [1920, 1945]], // https://en.wikipedia.org/wiki/Japanese_battleship_Nagato
  ['kongo', [1913, 1944]], // https://en.wikipedia.org/wiki/Japanese_battleship_Kongō
  ['akagi', [1927, 1942]], // https://en.wikipedia.org/wiki/Japanese_aircraft_carrier_Akagi
  ['kaga', [1929, 1942]], // https://en.wikipedia.org/wiki/Japanese_aircraft_carrier_Kaga
  ['shokaku', [1941, 1944]], // https://en.wikipedia.org/wiki/Japanese_aircraft_carrier_Shōkaku
  ['mogami', [1935, 1944]], // https://en.wikipedia.org/wiki/Japanese_cruiser_Mogami_(1934)
  ['fubuki', [1928, 1942]], // https://en.wikipedia.org/wiki/Japanese_destroyer_Fubuki_(1927)
  ['hiryu', [1939, 1942]], // https://en.wikipedia.org/wiki/Japanese_aircraft_carrier_Hiryū
  ['soryu', [1937, 1942]], // https://en.wikipedia.org/wiki/Japanese_aircraft_carrier_Sōryū
  ['shinano', [1944, 1944]], // Commissioned and lost in November 1944: http://www.combinedfleet.com/Shinano.htm
  ['musashi', [1942, 1944]], // https://en.wikipedia.org/wiki/Japanese_battleship_Musashi
  ['bismarck', [1940, 1941]], // https://en.wikipedia.org/wiki/German_battleship_Bismarck
  ['scharnhorst', [1939, 1943]], // https://en.wikipedia.org/wiki/German_battleship_Scharnhorst
  ['graf-spee', [1936, 1939]], // https://en.wikipedia.org/wiki/German_cruiser_Admiral_Graf_Spee
  ['prinz-eugen', [1940, 1945, '德国服役期']], // https://en.wikipedia.org/wiki/German_cruiser_Prinz_Eugen
  ['tirpitz', [1941, 1944]], // https://en.wikipedia.org/wiki/German_battleship_Tirpitz
  ['littorio', [1940, 1948]], // https://en.wikipedia.org/wiki/Italian_battleship_Littorio
  ['giulio-cesare', [1914, 1948, '意大利服役期']], // https://en.wikipedia.org/wiki/Italian_battleship_Giulio_Cesare
  ['zara', [1931, 1941]], // https://en.wikipedia.org/wiki/Italian_cruiser_Zara
  ['maestrale', [1934, 1943]], // Named ship; https://www.navypedia.org/ships/italy/it_dd_maestrale.htm
  ['roma', [1942, 1943]], // https://en.wikipedia.org/wiki/Italian_battleship_Roma_(1940)
  ['richelieu', [1940, 1967]], // https://en.wikipedia.org/wiki/French_battleship_Richelieu
  ['dunkerque', [1937, 1942]], // https://en.wikipedia.org/wiki/French_battleship_Dunkerque
  ['algerie', [1934, 1942]], // https://en.wikipedia.org/wiki/French_cruiser_Algérie
  ['le-fantasque', [1935, 1953]], // https://en.wikipedia.org/wiki/French_destroyer_Le_Fantasque
  ['marat', [1915, 1941, '战列舰服役期']], // The damaged ship continued as a stationary battery, then a training ship.
  ['kirov', [1938, 1961, '巡洋舰服役期']], // Reclassified as a training ship in 1961: https://en.wikipedia.org/wiki/Soviet_cruiser_Kirov
  ['tashkent', [1939, 1942]], // Accepted in 1939; lost in 1942: https://www.navypedia.org/ships/russia/ru_dd_tashkent.htm
  ['ning-hai', [1932, 1937, '中国服役期']], // https://en.wikipedia.org/wiki/Chinese_cruiser_Ning_Hai
  ['yat-sen', [1937, 'recorded']],
  ['lexington', [1927, 1946]],
  ['ranger', [1934, 1946]],
  ['wasp-cv7', [1940, 1942]],
  ['essex-long', [1944, 1976]], // Long-hull group: Ticonderoga and Hancock commissioned in 1944; Oriskany decommissioned in 1976.
  ['independence', [1943, 1956, '美国服役期']], // Monterey's final decommissioning marks the last US Navy service.
  ['saipan', [1946, 1957, '航母服役期']], // The two ships later served as command and communications ships.
  ['midway', [1945, 1992]],
  ['forrestal', [1955, 1998]],
  ['kitty-hawk', [1961, 2009]],
  ['enterprise-nuclear', [1961, 2017]],
  ['john-f-kennedy', [1968, 2007]],
  ['nimitz', [1975, 'present']],
  ['gerald-ford', [2017, 'present']],
  ['long-island', [1941, 1946, '美国服役期']], // https://en.wikipedia.org/wiki/USS_Long_Island_(CVE-1)
  ['charger', [1942, 1946]],
  ['bogue', [1942, 1946, '美国服役期']], // The class roster also includes Royal Navy ships returned in 1947.
  ['sangamon', [1942, 1947]],
  ['casablanca', [1943, 1964]],
  ['commencement-bay', [1944, 1957]],
  ['wolverine', [1942, 1945]],
  ['sable', [1943, 1945]],
  ['omaha', [1923, 1949, '美国服役期']], // The US Navy decommissioned Milwaukee after its return from Soviet loan.
  ['pensacola', [1929, 1947]],
  ['northampton', [1930, 1946]],
  ['portland', [1932, 1946]],
  ['new-orleans', [1934, 1947]],
  ['st-louis', [1939, 1946, '美国服役期']], // https://en.wikipedia.org/wiki/USS_St._Louis_(CL-49)
  ['wichita', [1939, 1947]],
  ['atlanta', [1941, 1949]],
  ['oakland', [1943, 1949]], // https://en.wikipedia.org/wiki/USS_Oakland_(CL-95)
  ['fargo', [1945, 1950]],
  ['oregon-city', [1946, 1961]],
  ['des-moines', [1948, 1975]],
  ['worcester', [1948, 1958]],
  ['alaska', [1944, 1947]],
  ['juneau', [1946, 1955]],
  ['northampton-command', [1953, 1970]],
  ['boston', [1955, 1970]],
  ['galveston', [1958, 1979]],
  ['providence', [1959, 1974]],
  ['albany', [1962, 1980]],
  ['long-beach', [1961, 1995]],
  ['leahy', [1962, 1995]],
  ['bainbridge-nuclear', [1962, 1996]],
  ['belknap', [1964, 1995]],
  ['truxtun', [1967, 1995]],
  ['california', [1974, 1999]],
  ['virginia', [1976, 1998]],
  ['ticonderoga', [1983, 'present']],
  ['sampson', [1916, 1945]],
  ['caldwell', [1917, 1945, '美国服役期']],
  ['wickes', [1918, 1946, '美国服役期']],
  ['clemson', [1919, 1946, '美国服役期']], // The class roster includes Hatfield's 1946 US decommissioning: https://en.wikipedia.org/wiki/List_of_Clemson-class_destroyers
  ['farragut-1934', [1934, 1945]],
  ['porter', [1936, 1950]],
  ['mahan', [1936, 1946]],
  ['gridley', [1937, 1946]],
  ['bagley', [1937, 1946]],
  ['somers', [1937, 1945]],
  ['benham', [1939, 1946]],
  ['sims', [1939, 1946]],
  ['benson', [1940, 1951, '美国服役期']],
  ['gleaves', [1940, 1956, '美国服役期']],
  ['allen-sumner', [1943, 1975, '美国服役期']],
  ['gearing', [1944, 1983, '美国服役期']], // Frank Knox commissioned in 1944; William C. Lawe decommissioned in 1983.
  ['carpenter', [1949, 1982, '美国服役期']], // Subclass: Robert A. Owens left US service in 1982. https://en.wikipedia.org/wiki/USS_Robert_A._Owens
  ['norfolk', [1953, 1970]],
  ['mitscher', [1953, 1978]],
  ['forrest-sherman', [1955, 1988]],
  ['farragut-1958', [1959, 1993]],
  ['charles-adams', [1960, 1993, '美国服役期']], // https://en.wikipedia.org/wiki/USS_Goldsborough_(DDG-20)
  ['decatur', [1967, 1983]],
  ['spruance', [1975, 2005]],
  ['kidd', [1981, 1999, '美国服役期']],
  ['arleigh-burke', [1991, 'present']],
  ['zumwalt', [2016, 'present']],
  ['c54g', [1945, 1964, '代表机服役期']],
  ['c119c', [1951, 1966, '代表机服役期']],
  ['type-093-early', [2019, 'snapshot']], // Hull 407: the linked roster gives completion and a 2019 status.
  ['type-092-refit', [2019, 'listed', '在役状态有异说']], // Navypedia's 2019 roster conflicts with a retirement report.
  ['type-091-late', [2019, 'snapshot']], // The adopted roster covers hulls 403–405, including representative hull 405.
  ['type-094-early', [2019, 'snapshot']], // Hull 411: the linked roster gives completion and a 2019 status.
  ['type-035g', [2019, 'snapshot', '系列服役记录']], // Navypedia reports Type 035 family boats in service in 2019.
  ['type-039-original', [2019, 'snapshot']], // Hull 320: the linked roster gives completion and a 2019 status.
  ['c46a', [1945, 1945, '代表机服役期']], // AMC Museum: 43-47350 was delivered in May and transferred to CNAC in June.
  ['c47a', [1944, 1964, '代表机服役期']], // AMC Museum: 42-92841 joined the 61st Troop Carrier Squadron in 1944 and left flying service in 1964.
  ['mb326', [1962, 1984, '意大利教练机使用期']], // Italy replaced it in training with the MB-339 by 1984; liaison use continued.
  ['cj6a', [1962, 'entry', '系列服役期']],
  ['cg4a', [1943, 'operational']], // USAF museum dates its first operation to the Allied invasion of Sicily.
  ['sopwith-camel', [1917, 1920, '英国服役期']], // https://en.wikipedia.org/wiki/Sopwith_Camel
  ['spad-xiii', [1917, 1923, '法国服役期']], // https://en.wikipedia.org/wiki/SPAD_S.XIII
  ['fokker-dvii', [1918, 1918, '德国一战服役期']], // https://en.wikipedia.org/wiki/Fokker_D.VII
  ['spitfire-ia', [1940, 1944, '代表机服役期']], // RAF Museum X4590: No. 609 Squadron in 1940; reserved for exhibition in 1944. https://www.warbirdregistry.org/spitregistry/spitfire-x4590.html
  ['p51d', [1944, 1957, '美国服役期']], // The final ANG Mustang was a D model: https://en.wikipedia.org/wiki/North_American_P-51_Mustang
  ['a6m5', [1943, 1945, '日本服役期']], // A6M5 reached units in late 1943 and served to the end of the war. https://www.airwar.ru/enc/fww2/a6m5.html
  ['f86a', [1949, 'entry', '美国服役期']], // 94th Fighter Squadron took delivery of F-86A-5 in February 1949. https://www.airwar.ru/enc/fighter/f86.html
  ['mig21pf', [1961, 'delivered']], // Domestic izdeliye 76; https://www.airwar.ru/enc/fighter/mig21pf.html
  ['f16a', [1979, 2007, '美国服役期']], // Last US F-16A/B Block 15 ADFs: https://en.wikipedia.org/wiki/General_Dynamics_F-16_Fighting_Falcon_variants
  ['mirage2000c', [1984, 2022]], // https://en.wikipedia.org/wiki/Dassault_Mirage_2000
  ['rafale-c', [2006, 'present']], // https://en.wikipedia.org/wiki/Dassault_Rafale (French Air Force service).
  ['u9', [1910, 1918]], // The last two German boats surrendered in 1918; https://en.wikipedia.org/wiki/German_Type_U_9_submarine
  ['type-viic', [1940, 1945, '德国服役期']], // German wartime service for VIIC, excluding other Type VII variants and postwar operators.
  ['gato', [1941, 1969, '美国服役期']], // https://en.wikipedia.org/wiki/Gato-class_submarine
  ['nautilus', [1954, 1980]],
  ['oberon', [1960, 1993, '英国服役期']], // Royal Navy: HMS Orpheus entered in 1960; the last boats paid off in 1993.
  ['virginia-block-i', [2004, 'present']],
  ['type-212a', [2005, 'present']],
  ['soryu-early', [2009, 'present']],
  ['type-039a', [2019, 'snapshot']], // Navypedia's completion date for hull 330 does not establish commissioning.
  ['rubis-amethyste', [1983, 'present', '舰级服役期']], // The Améthyste remains in service: https://en.wikipedia.org/wiki/Rubis-class_submarine
  ['project-971', [1984, 'present', '舰级服役期']], // Early boats entered service in 1984; some remain active: https://en.wikipedia.org/wiki/Akula-class_submarine
  ['sauro-first-series', [1980, 2002, '代表艇服役期']], // S 518 specifically: https://en.wikipedia.org/wiki/Italian_submarine_Nazario_Sauro_(S_518)
]);

export function archiveServiceYears(id: string): { label: string; scope?: ServiceScope } {
  const years = SERVICE_YEARS.get(id);
  if (!years) return { label: '未核实' };
  const [first, last, scope] = years;
  const label = typeof last === 'number' ? last === first ? `${first}年` : `${first}–${last}` :
    `${first}${SERVICE_YEAR_SUFFIX[last]}`;
  return scope ? { label, scope } : { label };
}
