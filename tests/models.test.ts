import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MODEL_IDS, ALL_MODEL_IDS } from '../game/models.ts';
import { HISTORICAL_SHIPS, historicalModel, navalShape, combatMainBearing } from '../game/naval-history.ts';
import {Game} from '../game/engine.ts';
import {HULLS} from '../game/campaign.ts';
import { VISUAL_SIGNALS } from '../game/visual-style.ts';

interface Gltf {
  asset: { version: string; generator: string };
  buffers: { uri?: string }[];
  accessors: { type: string; count: number; min?: number[]; max?: number[] }[];
  meshes: { primitives: { attributes: { POSITION: number }; indices?: number }[] }[];
  nodes: { name?: string; translation?: number[]; extras?: {game_part?: string; game_ruin?: string} }[];
  materials: { name: string; extensions?: { KHR_materials_unlit?: object }; pbrMetallicRoughness?: { baseColorFactor?: number[] } }[];
}

const directory = new URL('../game/public/assets/models/', import.meta.url);
const ids = ALL_MODEL_IDS;

async function asset(id: string): Promise<{ json: Gltf; bytes: number }> {
  const buffer = await readFile(new URL(`${id}.glb`, directory));
  assert.equal(buffer.readUInt32LE(0), 0x46546c67, `${id}: GLB magic`);
  assert.equal(buffer.readUInt32LE(4), 2, `${id}: glTF version`);
  assert.equal(buffer.readUInt32LE(8), buffer.length, `${id}: complete binary`);
  assert.equal(buffer.readUInt32LE(16), 0x4e4f534a, `${id}: JSON chunk`);
  const json = JSON.parse(buffer.subarray(20,20+buffer.readUInt32LE(12)).toString()) as Gltf;
  return { json, bytes: buffer.length };
}

test('all Blender assets contain embedded, finite 3D geometry within the mobile size budget', async () => {
  let total = 0,initial=0;
  for (const id of ids) {
    const { json, bytes } = await asset(id);
    total += bytes;
    if((MODEL_IDS as readonly string[]).includes(id))initial+=bytes;
    assert.equal(json.asset.version, '2.0');
    assert.match(json.asset.generator, /Blender/);
    assert.ok(json.buffers.every(buffer => !buffer.uri), `${id}: external resource dependency`);
    assert.ok(json.meshes.length > 0);
    for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
      const positions = json.accessors[primitive.attributes.POSITION];
      assert.ok(positions.count > 2, `${id}: missing mesh geometry`);
      assert.ok(positions.min?.every(Number.isFinite) && positions.max?.every(Number.isFinite));
    }
    const origin = json.nodes.find(node => node.name === id);
    assert.ok(origin, `${id}: model origin node`);
    assert.ok(!origin.translation || origin.translation.every(value => Math.abs(value) < .001), `${id}: exported workbench offset`);
    assert.ok(bytes < 400_000, `${id}: excessive model payload`);
  }
  assert.ok(initial < 2_500_000, 'initial model download exceeds mobile budget');
  assert.ok(total < 9_000_000, 'on-demand historical archive exceeds its size budget');
});

test('single, twin, four and six engine aircraft keep separate animatable propeller nodes', async () => {
  for (const [id, engines] of Object.entries({ falcon:1, swift:1, turtle:2, scout:1, dart:1, gunship:2, interceptor:1, diver:1, torpedo:1, boss:4, 'boss-final':6 })) {
    const { json } = await asset(id);
    assert.equal(json.nodes.filter(node => node.name?.startsWith('propeller_')).length, engines, id);
  }
});

test('Blender gameplay markers preserve semantic colors without lighting or tone mapping', async () => {
  for (const [key, signal] of Object.entries(VISUAL_SIGNALS)) {
    const { json } = await asset(signal.model);
    const material = json.materials.find(material => material.name === `signal_${key}`);
    assert.ok(material?.extensions?.KHR_materials_unlit, `${key}: marker must remain unlit`);
    const encoded = material.pbrMetallicRoughness!.baseColorFactor!;
    const rgb = [1,3,5].map(index => parseInt(signal.color.slice(index,index+2),16) / 255);
    const expected = rgb.map(value => value <= .04045 ? value / 12.92 : ((value+.055)/1.055)**2.4);
    expected.forEach((value,index) => assert.ok(Math.abs(encoded[index]-value)<.0001, `${key}: Blender and HUD colors differ`));
    assert.ok(json.materials.some(material => material.name === 'signal_ink'));
    assert.ok(json.materials.some(material => material.name === 'signal_white'));
  }
});


test('warships export independent damage parts, matching wrecks, and rotating AA turrets', async () => {
  for (const hull of ['patrol-boat','destroyer','cruiser','battleship','fleet-carrier','coastal-battery']) {
    const {json}=await asset(hull);
    const names=json.nodes.map(node=>node.name?.replace(/\.\d+$/,''));
    const parts=['aa-port',...(['patrol-boat','coastal-battery'].includes(hull)?[]:['aa-starboard','bridge']),...(hull==='fleet-carrier'?['flight-deck']:[])];
    for(const part of parts) {
      assert.ok(json.nodes.some(node=>node.extras?.game_part===part),`${hull}: ${part} must be independently removable`);
      assert.ok(json.nodes.some(node=>node.extras?.game_ruin===part),`${hull}: ${part} needs a local wreck`);
    }
    assert.ok(names.some(name=>name?.startsWith('turret_aa_')),hull);
  }
});

test('the redesigned fleet has layered local materials, waterline metadata and stays below aircraft',async()=>{
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const {Box3,Vector3}=await import('three');
  const {HULLS}=await import('../game/campaign.ts');
  for(const id of ['carrier','patrol-boat','destroyer','cruiser','battleship','fleet-carrier','transport'] as const) {
    const buffer=await readFile(new URL(`${id}.glb`,directory));
    const {scene}=await new GLTFLoader().parseAsync(Uint8Array.from(buffer).buffer,'');
    const bounds=new Box3().setFromObject(scene),size=bounds.getSize(new Vector3());
    const {json}=await asset(id);
    assert.ok(json.materials.filter(mat=>mat.name.startsWith('fleet_')).length>=5,`${id}: missing hull/deck/structure hierarchy`);
    let waterline:{waterline_beam:number;waterline_length:number}|undefined;
    scene.traverse(node=>{if(typeof node.userData.waterline_beam==='number')waterline=node.userData as typeof waterline;});
    assert.ok(waterline&&waterline.waterline_beam>0&&waterline.waterline_length>waterline.waterline_beam*2,`${id}: wake needs the real hull footprint`);
    assert.ok(size.z>size.x*2,`${id}: keep an elongated ship silhouette`);
    const scale=id==='carrier'?62:HULLS[id].scale;
    assert.ok(bounds.max.y*scale*.5<55,`${id}: superstructure must stay below low-flying aircraft`);
  }
});

test('parked carrier aircraft retain upward-facing wings at the actual game camera angle',async()=>{
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const {Mesh,Vector3,Box3}=await import('three');
  for(const id of ['carrier',...HISTORICAL_SHIPS.filter(ship=>ship.hull==='fleet-carrier').map(ship=>historicalModel(ship.id))]) {
    const buffer=await readFile(new URL(`${id}.glb`,directory));
    const {scene}=await new GLTFLoader().parseAsync(Uint8Array.from(buffer).buffer,'');scene.updateMatrixWorld(true);
    let area=0;
    const aircraftBounds=new Box3();
    const a=new Vector3(),b=new Vector3(),c=new Vector3(),edge=new Vector3();
    scene.traverse(node=>{
      if(node.userData.game_part!=='flight-deck')return;
      node.traverse(part=>{
        if(!(part instanceof Mesh))return;
        const materials=Array.isArray(part.material)?part.material:[part.material];
        if(!materials.some(mat=>mat.name===(id==='carrier'?'naval-blue-grey':'olive-drab-paint')))return;
        const geometry=part.geometry,positions=geometry.getAttribute('position'),indices=geometry.index;
        for(let i=0;i<(indices?.count??positions.count);i+=3) {
          a.fromBufferAttribute(positions,indices?indices.getX(i):i).applyMatrix4(part.matrixWorld);
          b.fromBufferAttribute(positions,indices?indices.getX(i+1):i+1).applyMatrix4(part.matrixWorld);
          c.fromBufferAttribute(positions,indices?indices.getX(i+2):i+2).applyMatrix4(part.matrixWorld);
          aircraftBounds.expandByPoint(a).expandByPoint(b).expandByPoint(c);
          area+=Math.max(0,b.sub(a).cross(edge.copy(c).sub(a)).y)*.5;
        }
      });
    });
    const parked:import('three').Object3D[]=[];
    scene.traverse(node=>{if(node.userData.parked_aircraft)parked.push(node);});
    assert.equal(parked.length,3,`${id}: three independently recognizable parked aircraft`);
    const aircraftScale=parked[0].scale.x;
    assert.ok(area/(aircraftScale*aircraftScale)>.20,`${id}: wings/tails must keep their upward-facing area at the carrier's authored scale`);
    scene.traverse(part=>{
      if(!part.userData.game_part?.startsWith('aa-'))return;
      const aa=new Box3().setFromObject(part);
      const overlaps=aircraftBounds.max.x>aa.min.x&&aircraftBounds.min.x<aa.max.x&&aircraftBounds.max.z>aa.min.z&&aircraftBounds.min.z<aa.max.z;
      assert.ok(!overlaps,`${id}: parked aircraft must remain clear of AA positions in the top-down view`);
    });
    if(id==='carrier')for(const craft of ['falcon','swift','turtle']) {
      const playerData=await readFile(new URL(`${craft}.glb`,directory));
      const player=await new GLTFLoader().parseAsync(Uint8Array.from(playerData).buffer,'');
      const playerBounds=new Box3().setFromObject(player.scene);
      assert.ok(aircraftBounds.max.x*62<playerBounds.min.x*23-2,`${craft}: parked aircraft must leave the player's takeoff wings clear`);
    }
  }
});

test('wood-deck seams remain visible above the deck instead of being buried in it',async()=>{
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const {Mesh,Raycaster,Vector3}=await import('three');
  for(const id of ['cruiser','battleship']) {
    const buffer=await readFile(new URL(`${id}.glb`,directory));
    const {scene}=await new GLTFLoader().parseAsync(Uint8Array.from(buffer).buffer,'');
    let beam=0,length=0;
    scene.traverse(node=>{
      if(node.userData.game_ruin)node.visible=false;
      if(node.userData.waterline_beam){beam=node.userData.waterline_beam;length=node.userData.waterline_length;}
    });
    scene.updateMatrixWorld(true);
    const visible:import('three').Object3D[]=[];scene.traverseVisible(node=>{if(node instanceof Mesh)visible.push(node);});
    let seams=0;
    for(const x of [-.57,-.38,.38,.57])for(const y of [-.50,-.30,.10,.30,.50,.60]) {
      const ray=new Raycaster(new Vector3(beam*x,10,-length*y),new Vector3(0,-1,0));
      const hit=ray.intersectObjects(visible,false)[0];
      if(!hit||!(hit.object instanceof Mesh))continue;
      const material=Array.isArray(hit.object.material)?hit.object.material[hit.face!.materialIndex]:hit.object.material;
      if(material.name==='fleet_plank')seams++;
    }
    assert.ok(seams>=2,`${id}: wood seams must be visible in exposed deck areas; detected ${seams}`);
  }
});

test('historical ships export the selected identity and removable parts at the shared tactical coordinates',async()=>{
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const {Vector3}=await import('three');
  const game=new Game(()=>.5);
  for(const ship of HISTORICAL_SHIPS) {
    const id=historicalModel(ship.id),buffer=await readFile(new URL(`${id}.glb`,directory));
    const {scene}=await new GLTFLoader().parseAsync(Uint8Array.from(buffer).buffer,'');scene.updateMatrixWorld(true);
    const shape=navalShape(ship);let identity=false;
    game.fleetAppearance[ship.hull]=ship.id;
    const unit=game.spawnShip(ship.hull,240,260);
    const parts=new Map<string,import('three').Object3D>();
    scene.traverse(node=>{
      if(node.userData.historic_id===ship.id&&node.userData.historic_year===ship.year)identity=true;
      if(node.userData.game_part)parts.set(node.userData.game_part,node);
    });
    assert.ok(identity,`${id}: an actual local model for this historical identity`);
    for(const point of unit.parts) {
      const part=parts.get(point.id);assert.ok(part,`${id}: missing ${point.id}`);
      const at=part.getWorldPosition(new Vector3());
      assert.ok(Math.abs(at.x-point.x/HULLS[ship.hull].scale/shape.combatStretch)<.0001&&Math.abs(at.z-point.y/HULLS[ship.hull].scale)<.0001,`${id}: ${point.id} must align with its real rendered structure`);
    }
  }
});

test('distinctive historical main batteries survive Blender export instead of becoming generic triple turrets',async()=>{
  // Main-battery arrangements are documented in dcos/feature/historical-fleet.md and its linked class records.
  const references:Record<string,number[]>={iowa:[3,3,3],arizona:[3,3,3,3],'king-george-v':[4,2,4],rodney:[3,3,3],richelieu:[4,4],dunkerque:[4,4],bismarck:[2,2,2,2],'giulio-cesare':[3,2,2,3],fletcher:[1,1,1,1,1],mogami:[2,2,2,2,2],'de-ruyter':[2,1,2,2],blyskawica:[1,2,2,2]};
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  for(const [identity,expected] of Object.entries(references)) {
    const ship=HISTORICAL_SHIPS.find(ship=>ship.id===identity)!;
    const buffer=await readFile(new URL(`${historicalModel(ship.id)}.glb`,directory));
    const {scene}=await new GLTFLoader().parseAsync(Uint8Array.from(buffer).buffer,'');scene.updateMatrixWorld(true);
    const {Vector3}=await import('three');
    const mounts:{barrels:number;z:number}[]=[];scene.traverse(node=>{if(node.userData.historic_main)mounts.push({barrels:node.userData.gun_barrels,z:node.getWorldPosition(new Vector3()).z});});
    assert.deepEqual(mounts.sort((a,b)=>a.z-b.z).map(mount=>mount.barrels),expected,`${identity}: bow-to-stern main mounts and barrel counts`);
  }
});

test('every historical main and secondary battery clears other guns, bridges and funnels in museum and actual combat poses',async()=>{
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const {Vector3,Raycaster}=await import('three');
  const failures:string[]=[];
  for(const ship of HISTORICAL_SHIPS) {
    const buffer=await readFile(new URL(`${historicalModel(ship.id)}.glb`,directory));
    const {scene}=await new GLTFLoader().parseAsync(Uint8Array.from(buffer).buffer,'');
    const mounts:import('three').Object3D[]=[],secondaries:import('three').Object3D[]=[],structures:import('three').Object3D[]=[];
    scene.traverse(node=>{
      if(node.userData.historic_main)mounts.push(node);
      if(node.name.startsWith('turret_secondary'))secondaries.push(node);
      if(node.userData.game_part==='bridge'||node.userData.historic_funnel)structures.push(node);
    });
    const guns=[...mounts,...secondaries];
    for(const pose of ['museum','combat']) {
      if(pose==='combat')for(const mount of mounts)mount.rotation.y=combatMainBearing(mount.position.x);
      scene.updateMatrixWorld(true);
      for(const mount of guns) {
        const heavy=mount.userData.historic_main&&ship.geometry.calibre>=250;
        const targets=[...guns.filter(other=>other!==mount),...structures];
        for(let barrel=0;barrel<mount.userData.gun_barrels;barrel++) {
          const x=(barrel-(mount.userData.gun_barrels-1)/2)*(heavy?.14:.11);
          for(const height of [.20,.20-(heavy?.028:.021)+.001,.20+(heavy?.028:.021)-.001]) {
            const start=mount.localToWorld(new Vector3(x,height,-.25));
            const end=mount.localToWorld(new Vector3(x,height,-(.25+(heavy?.52:.34))));
            const ray=new Raycaster(start,end.clone().sub(start).normalize(),.001,start.distanceTo(end));
            const hits=ray.intersectObjects(targets,true);
            if(hits.length)failures.push(`${ship.id} ${pose}: ${mount.name} barrel ${barrel} intersects ${hits[0].object.parent?.name}`);
          }
        }
      }
    }
  }
  assert.deepEqual([...new Set(failures)],[], 'Exported barrel paths must stay clear in both production poses');
});

test('carrier stacks stay with their starboard islands and highlighted midships catapults survive export',async()=>{
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const {Vector3}=await import('three');
  for(const id of ['historic-enterprise','historic-essex','historic-ark-royal','historic-illustrious','historic-shinano','carrier']) {
    const buffer=await readFile(new URL(`${id}.glb`,directory));
    const {scene}=await new GLTFLoader().parseAsync(Uint8Array.from(buffer).buffer,'');scene.updateMatrixWorld(true);
    let stackCount=0;
    scene.traverse(node=>{if(node.userData.historic_funnel){stackCount++;assert.ok(node.getWorldPosition(new Vector3()).x>.25,`${id}: stack must be outboard of the runway`);}});
    assert.ok(stackCount>0,`${id}: historical island stack is present`);
  }
  for(const [id,station,countExpected] of [['belfast',-.07,1],['sydney',-.07,1],['bismarck',-.24,2],['tirpitz',-.24,2],['king-george-v',-.10,1]] as const) {
    const ship=HISTORICAL_SHIPS.find(ship=>ship.id===id)!;
    const buffer=await readFile(new URL(`${historicalModel(ship.id)}.glb`,directory));
    const {scene}=await new GLTFLoader().parseAsync(Uint8Array.from(buffer).buffer,'');scene.updateMatrixWorld(true);
    let count=0;scene.traverse(node=>{if(node.userData.historic_catapult){
      count++;assert.ok(Math.abs(node.getWorldPosition(new Vector3()).z+station*navalShape(ship).halfLength)<.0001,`${id}: midships catapult`);
      const axis=new Vector3(0,0,1).transformDirection(node.matrixWorld);assert.ok(Math.abs(axis.x)>.9,`${id}: athwartship rail`);
    }});assert.equal(count,countExpected,`${id}: real exported catapult rails`);
  }
});
