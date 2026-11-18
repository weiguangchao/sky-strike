import { parseGltf } from './gltf-fixture.ts';
import { parseModelMetadata } from '../game/model-metadata.ts';
import { required } from './support.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MODEL_IDS, ALL_MODEL_IDS } from '../game/models.ts';
import { HISTORICAL_SHIPS, historicalModel, navalShape, combatMainBearing } from '../game/naval-history.ts';
import {Game} from '../game/engine.ts';
import {HULLS} from '../game/campaign.ts';
import { VISUAL_SIGNALS } from '../game/visual-style.ts';

const directory = new URL('../game/public/assets/models/', import.meta.url);
const ids = ALL_MODEL_IDS;

async function asset(id: string): Promise<{ json: ReturnType<typeof parseGltf>; bytes: number }> {
  const buffer = await readFile(new URL(`${id}.glb`, directory));
  assert.equal(buffer.readUInt32LE(0), 0x46546c67, `${id}: GLB magic`);
  assert.equal(buffer.readUInt32LE(4), 2, `${id}: glTF version`);
  assert.equal(buffer.readUInt32LE(8), buffer.length, `${id}: complete binary`);
  assert.equal(buffer.readUInt32LE(16), 0x4e4f534a, `${id}: JSON chunk`);
  const json = parseGltf(JSON.parse(buffer.subarray(20,20+buffer.readUInt32LE(12)).toString()));
  return { json, bytes: buffer.length };
}

test('exported gull-wing elevation and landing-gear supports have real geometry', async () => {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { Mesh, Vector3, Raycaster, DoubleSide } = await import('three');
  async function load(id: string) {
    const bytes = await readFile(new URL(`${id}.glb`, directory));
    const { scene } = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
    scene.updateMatrixWorld(true);
    const nodes: import('three').Object3D[] = [];
    scene.traverse(node => nodes.push(node));
    return { scene, nodes };
  }
  function vertices(root: import('three').Object3D) {
    const points: import('three').Vector3[] = [];
    root.traverse(node => {
      if (!(node instanceof Mesh)) return;
      const positions = node.geometry.getAttribute('position');
      for (let at = 0; at < positions.count; at++) points.push(new Vector3().fromBufferAttribute(positions, at).applyMatrix4(node.matrixWorld));
    });
    return points;
  }
  const diver = await load('diver');
  const gull = required(diver.nodes.find(node => node.userData.visual_component === 'main-wing'));
  const points = vertices(gull);
  const topAt = (span: number) => Math.max(...points.filter(point => Math.abs(Math.abs(point.x) - span) < .002).map(point => point.y));
  assert.ok(topAt(.48) < topAt(0) - .10, 'inner wing descends from the root');
  assert.ok(topAt(1.42) > topAt(.48) + .10, 'outer wing rises from the elbow');

  gull.traverse(node => {
    if (node instanceof Mesh) for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.side = DoubleSide;
  });
  const guns = required(diver.nodes.find(node => node.userData.visual_component === 'wing-guns'));
  for (const side of [-1, 1]) {
    const roots = vertices(guns).filter(point => point.x * side > 0 && point.z > -.061);
    assert.ok(roots.length > 4, 'actual barrel roots are sampled');
    assert.ok(roots.some(point =>
      new Raycaster(point, new Vector3(0, 1, 0), .00001, .15).intersectObject(gull).length &&
      new Raycaster(point, new Vector3(0, -1, 0), .00001, .15).intersectObject(gull).length),
    `Diver: ${side} barrel root enters the gull-wing volume`);
  }

  const dart = await load('dart');
  const wing = required(dart.nodes.find(node => node.userData.visual_component === 'main-wing'));
  const gear = required(dart.nodes.find(node => node.userData.visual_component === 'landing-gear'));
  wing.traverse(node => {
    if (node instanceof Mesh) for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.side = DoubleSide;
  });
  const attached = vertices(gear).some(point => {
    const above = new Raycaster(point, new Vector3(0, 1, 0), .00001, .08).intersectObject(wing);
    const below = new Raycaster(point, new Vector3(0, -1, 0), .00001, .08).intersectObject(wing);
    return above.length > 0 && below.length > 0;
  });
  assert.ok(attached, 'actual gear support vertices enter the closed wing volume');
});

test('angled-carrier deck paint has flight-deck geometry beneath every point', async () => {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { Mesh, Vector3, Raycaster, DoubleSide, Box3 } = await import('three');
  for (const ship of HISTORICAL_SHIPS.filter(ship => ship.geometry.flightDeck === 'angled')) {
    const buffer = await readFile(new URL(`${historicalModel(ship.id)}.glb`, directory));
    const { scene } = await new GLTFLoader().parseAsync(Uint8Array.from(buffer).buffer, '');
    scene.updateMatrixWorld(true);
    const deck: import('three').Object3D[] = [], marks: import('three').Vector3[] = [];
    let deckTop = 0, deckArea = 0;
    scene.traverse(node => {
      if (!(node instanceof Mesh)) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      if (materials.some(material => material.name === 'fleet_deck')) {
        materials.forEach(material => { material.side = DoubleSide; });
        deck.push(node);
        const bounds = new Box3().setFromObject(node), size = bounds.getSize(new Vector3());
        if (size.x * size.z > deckArea) { deckArea = size.x * size.z; deckTop = bounds.max.y; }
      }
      if (!materials.some(material => material.name === 'fleet_mark')) return;
      const positions = node.geometry.getAttribute('position');
      for (let at = 0; at < positions.count; at++) {
        const point = new Vector3().fromBufferAttribute(positions, at).applyMatrix4(node.matrixWorld);
        marks.push(point);
      }
    });
    const paint = marks.filter(point => point.y > deckTop && point.y < deckTop + .004);
    assert.ok(paint.length > 30 && deck.length, `${ship.id}: actual deck and paint were inspected`);
    for (const point of paint) {
      const origin = new Vector3(point.x, deckTop + .02, point.z);
      assert.ok(new Raycaster(origin, new Vector3(0, -1, 0), 0, .03).intersectObjects(deck, false).length,
        `${ship.id}: paint at ${point.x},${point.z} extends beyond the flight deck`);
    }
  }
});

test('all Blender assets contain embedded, finite 3D geometry within the mobile size budget', async () => {
  let total = 0,initial=0,legacy=0;
  for (const id of ids) {
    const { json, bytes } = await asset(id);
    total += bytes;
    if(!id.startsWith('archive-'))legacy+=bytes;
    if(MODEL_IDS.some(model => model === id))initial+=bytes;
    assert.equal(json.asset.version, '2.0');
    assert.match(json.asset.generator, /Blender/);
    assert.ok(json.buffers.every(buffer => !buffer.uri), `${id}: external resource dependency`);
    assert.ok(json.meshes.length > 0);
    for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
      const positions = required(json.accessors[primitive.attributes.POSITION]);
      assert.ok(positions.count > 2, `${id}: missing mesh geometry`);
      assert.ok(positions.min?.every(Number.isFinite) && positions.max?.every(Number.isFinite));
    }
    const origin = json.nodes.find(node => node.name === id);
    assert.ok(origin, `${id}: model origin node`);
    assert.ok(!origin.translation || origin.translation.every(value => Math.abs(value) < .001), `${id}: exported workbench offset`);
    assert.ok(bytes < 400_000, `${id}: excessive model payload`);
  }
  assert.ok(initial < 2_500_000, 'initial model download exceeds mobile budget');
  assert.ok(legacy < 17_000_000, 'existing historical fleet exceeds its size budget');
  assert.ok(total < 21_000_000, 'combined on-demand archive exceeds its size budget');
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
    const encoded = required(required(material.pbrMetallicRoughness).baseColorFactor);
    const rgb = [1,3,5].map(index => parseInt(signal.color.slice(index,index+2),16) / 255);
    const expected = rgb.map(value => value <= .04045 ? value / 12.92 : ((value+.055)/1.055)**2.4);
    expected.forEach((value,index) => assert.ok(Math.abs(required(encoded[index])-value)<.0001, `${key}: Blender and HUD colors differ`));
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
    scene.traverse(node=>{const line = parseModelMetadata(node.userData).waterline; if (line) waterline = {waterline_beam:line.halfWidth, waterline_length:line.halfLength};});
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
    const deckMeshes:import('three').Object3D[]=[];
    scene.traverse(node=>{
      if(!(node instanceof Mesh))return;
      let parent:import('three').Object3D|null=node;
      while(parent){if(parent.userData.parked_aircraft||parent.userData.game_ruin)return;parent=parent.parent;}
      deckMeshes.push(node);
    });
    const {Raycaster}=await import('three');
    for(const aircraft of parked) {
      const bounds=new Box3().setFromObject(aircraft);
      const contact:import('three').Vector3[]=[];
      aircraft.traverse(node=>{
        if(!(node instanceof Mesh))return;
        const positions=node.geometry.getAttribute('position');
        for(let at=0;at<positions.count;at++) {
          const point=new Vector3().fromBufferAttribute(positions,at).applyMatrix4(node.matrixWorld);
          if(point.y<bounds.min.y+.0005)contact.push(point);
        }
      });
      assert.ok(contact.length>=3,`${id}: exported aircraft has physical contact geometry`);
      for(const point of contact) {
        const hit=required(new Raycaster(point.clone().add(new Vector3(0,.015,0)),new Vector3(0,-1,0),0,.1).intersectObjects(deckMeshes,false)[0]);
        assert.ok(Math.abs(point.y-hit.point.y)<.006,`${id}: landing gear must touch the actual deck, gap ${point.y-hit.point.y}`);
      }
    }
    const aircraftScale=required(parked[0]).scale.x;
    assert.ok(area/(aircraftScale*aircraftScale)>.20,`${id}: wings/tails must keep their upward-facing area at the carrier's authored scale`);
    scene.traverse(part=>{
      if(!part.userData.game_part?.startsWith('aa-'))return;
      const aa=new Box3().setFromObject(part);
      for(const aircraft of parked) {
        const occupied=new Box3().setFromObject(aircraft);
        const overlaps=occupied.max.x>aa.min.x&&occupied.min.x<aa.max.x&&occupied.max.z>aa.min.z&&occupied.min.z<aa.max.z;
        assert.ok(!overlaps,`${id}: ${aircraft.name} must remain clear of AA positions in the top-down view`);
      }
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
      const hit=required(ray.intersectObjects(visible,false)[0]);
      if(!hit||!(hit.object instanceof Mesh))continue;
      const material=Array.isArray(hit.object.material)?hit.object.material[required(hit.face).materialIndex]:hit.object.material;
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
  const references:Record<string,number[]>={iowa:[3,3,3],arizona:[3,3,3,3],'king-george-v':[4,2,4],rodney:[3,3,3],richelieu:[4,4],dunkerque:[4,4],bismarck:[2,2,2,2],'giulio-cesare':[3,2,2,3],fletcher:[1,1,1,1,1],mogami:[2,2,2,2,2]};
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  for(const [identity,expected] of Object.entries(references)) {
    const ship=required(HISTORICAL_SHIPS.find(ship=>ship.id===identity));
    const buffer=await readFile(new URL(`${historicalModel(ship.id)}.glb`,directory));
    const {scene}=await new GLTFLoader().parseAsync(Uint8Array.from(buffer).buffer,'');scene.updateMatrixWorld(true);
    const {Vector3}=await import('three');
    const mounts:{barrels:number;z:number}[]=[];scene.traverse(node=>{if(node.userData.historic_main)mounts.push({barrels:node.userData.gun_barrels,z:node.getWorldPosition(new Vector3()).z});});
    assert.deepEqual(mounts.sort((a,b)=>a.z-b.z).map(mount=>mount.barrels),expected,`${identity}: bow-to-stern main mounts and barrel counts`);
  }
});

test('every historical main and secondary battery clears other guns, bridges and funnels in museum and actual combat poses',async()=>{
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const {Vector3,Raycaster,Mesh}=await import('three');
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
          const barrelPoints:import('three').Vector3[]=[];
          mount.traverse(node=>{
            if(!(node instanceof Mesh))return;
            const geometry:import('three').BufferGeometry=node.geometry;
            const positions=geometry.getAttribute('position'),indices=geometry.index;
            const materials=Array.isArray(node.material)?node.material:[node.material];
            for(let at=0;at<(indices?.count??positions.count);at+=3) {
              const group=geometry.groups.find(group=>at>=group.start&&at<group.start+group.count);
              if(materials[group?.materialIndex??0]?.name.replace(/\.\d+$/,'')!=='fleet_ink')continue;
              for(let corner=0;corner<3;corner++) {
                const point=mount.worldToLocal(new Vector3().fromBufferAttribute(positions,indices?indices.getX(at+corner):at+corner).applyMatrix4(node.matrixWorld));
                if(Math.abs(point.x-x)<(heavy?.028:.021)+.002&&Math.abs(point.y-.20)<(heavy?.028:.021)+.002&&point.z<-.13)barrelPoints.push(point);
              }
            }
          });
          assert.ok(barrelPoints.length,`${ship.id}: actual barrel surface vertices`);
          const rootZ=Math.max(...barrelPoints.map(point=>point.z)),tipZ=Math.min(...barrelPoints.map(point=>point.z));
          for(const height of [.20,.20-(heavy?.028:.021)+.001,.20+(heavy?.028:.021)-.001]) {
            const start=mount.localToWorld(new Vector3(x,height,rootZ));
            const end=mount.localToWorld(new Vector3(x,height,tipZ));
            const ray=new Raycaster(start,end.clone().sub(start).normalize(),.001,start.distanceTo(end));
            const hits=ray.intersectObjects(targets,true);
            if(hits.length)failures.push(`${ship.id} ${pose}: ${mount.name} barrel ${barrel} intersects ${required(hits[0]).object.parent?.name}`);
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
  for(const [id,station,countExpected] of [['belfast',-.07,1],['bismarck',-.24,2],['tirpitz',-.24,2],['king-george-v',-.10,1]] as const) {
    const ship=required(HISTORICAL_SHIPS.find(ship=>ship.id===id));
    const buffer=await readFile(new URL(`${historicalModel(ship.id)}.glb`,directory));
    const {scene}=await new GLTFLoader().parseAsync(Uint8Array.from(buffer).buffer,'');scene.updateMatrixWorld(true);
    let count=0;scene.traverse(node=>{if(node.userData.historic_catapult){
      count++;assert.ok(Math.abs(node.getWorldPosition(new Vector3()).z+station*navalShape(ship).halfLength)<.0001,`${id}: midships catapult`);
      const axis=new Vector3(0,0,1).transformDirection(node.matrixWorld);assert.ok(Math.abs(axis.x)>.9,`${id}: athwartship rail`);
    }});assert.equal(count,countExpected,`${id}: real exported catapult rails`);
  }
});

test('vertical-launch cells remain exposed above deckhouses in the exported fleet',async()=>{
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const {Mesh,Box3,Vector3,Raycaster}=await import('three');
  for(const ship of HISTORICAL_SHIPS.filter(ship=>ship.geometry.launchers?.some(launcher=>launcher.kind==='vls'))) {
    const buffer=await readFile(new URL(`${historicalModel(ship.id)}.glb`,directory));
    const {scene}=await new GLTFLoader().parseAsync(Uint8Array.from(buffer).buffer,'');
    const launchers:import('three').Object3D[]=[],visible:import('three').Object3D[]=[];
    scene.traverse(node=>{if(node.userData.game_ruin)node.visible=false;if(node.userData.naval_launcher==='vls')launchers.push(node);});
    scene.updateMatrixWorld(true);
    scene.traverseVisible(node=>{if(node instanceof Mesh)visible.push(node);});
    for(const launcher of launchers) {
      const point=new Box3().setFromObject(launcher).getCenter(new Vector3());point.y=10;
      const hit=required(new Raycaster(point,new Vector3(0,-1,0)).intersectObjects(visible,false)[0]);
      let owner:import('three').Object3D|null=hit.object;
      while(owner&&owner!==launcher)owner=owner.parent;
      assert.equal(owner,launcher,`${ship.id}: ${launcher.name} is buried beneath another structure`);
    }
  }
});

test('US classes export actual carrier, missile and nuclear structures rather than renamed generic hulls',async()=>{
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const {createHash}=await import('node:crypto');
  const geometryHashes=new Set<string>();
  for(const ship of HISTORICAL_SHIPS.filter(ship=>ship.classId)) {
    const buffer=await readFile(new URL(`${historicalModel(ship.id)}.glb`,directory));
    const {scene}=await new GLTFLoader().parseAsync(Uint8Array.from(buffer).buffer,'');
    const roots:import('three').Object3D[]=[],launchers:string[]=[],funnels:import('three').Object3D[]=[];
    scene.traverse(node=>{
      if(node.userData.naval_class)roots.push(node);
      if(node.userData.naval_launcher)launchers.push(node.userData.naval_launcher);
      if(node.userData.historic_funnel)funnels.push(node);
    });
    assert.equal(roots.length,1,ship.id);assert.equal(required(roots[0]).userData.naval_class,ship.classId);
    assert.equal(funnels.length,ship.geometry.funnels.length,`${ship.id}: funnel count, including nuclear ships without stacks`);
    assert.deepEqual(launchers.sort(),(ship.geometry.launchers??[]).map(launcher=>launcher.kind).sort(),`${ship.id}: actual exported launcher types`);
    if(ship.hull==='fleet-carrier') {
      assert.equal(required(roots[0]).userData.naval_flight_deck,ship.geometry.flightDeck??'straight');
      assert.equal(required(roots[0]).userData.naval_aviation,ship.geometry.aviation??'propeller');
    }
    // Hash only the binary geometry buffer; identity metadata and paint cannot fake a new class.
    const jsonLength=buffer.readUInt32LE(12),binary=buffer.subarray(20+jsonLength+8);
    const hash=createHash('sha256').update(binary).digest('hex');
    assert.ok(!geometryHashes.has(hash),`${ship.id}: duplicate class geometry`);geometryHashes.add(hash);
  }
});

test('Forrestal has three starboard lifts with one forward, two aft, and a forward port lift',async()=>{
  // US Navy All Hands, December 1954: three starboard and one port elevator.
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const {Box3,Vector3}=await import('three');
  const buffer=await readFile(new URL('historic-forrestal.glb',directory));
  const {scene}=await new GLTFLoader().parseAsync(Uint8Array.from(buffer).buffer,'');scene.updateMatrixWorld(true);
  const centers:import('three').Vector3[]=[];let bridgeZ=NaN;
  scene.traverse(node=>{
    if(node.userData.naval_lift)centers.push(new Box3().setFromObject(node).getCenter(new Vector3()));
    if(node.userData.game_part==='bridge')bridgeZ=node.getWorldPosition(new Vector3()).z;
  });
  assert.equal(centers.length,4);
  const starboard=centers.filter(at=>at.x>0),port=centers.filter(at=>at.x<0);
  assert.equal(starboard.length,3);assert.equal(port.length,1);
  assert.equal(starboard.filter(at=>at.z<bridgeZ).length,1);
  assert.equal(starboard.filter(at=>at.z>bridgeZ).length,2);
  assert.ok(required(port[0]).z<0,'port elevator remains at the forward end of the angled deck');
});

test('Kennedy has physically outboard-canted funnel geometry, distinct from Kitty Hawk',async()=>{
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const {Mesh,Vector3}=await import('three');
  const readScene=async(id:string)=>{
    const buffer=await readFile(new URL(`${id}.glb`,directory));
    const {scene}=await new GLTFLoader().parseAsync(Uint8Array.from(buffer).buffer,'');scene.updateMatrixWorld(true);return scene;
  };
  const kennedy=await readScene('historic-john-f-kennedy');
  let uptake:import('three').Object3D|undefined;
  kennedy.traverse(node=>{if(typeof node.userData.naval_funnel_cant==='number')uptake=node;});assert.ok(uptake);
  const vertical=new Vector3(0,1,0).transformDirection(uptake.matrixWorld);
  assert.ok(vertical.x>.3&&vertical.y>.8,'stack axis inclines outboard');
  const points:import('three').Vector3[]=[];
  uptake.traverse(node=>{
    if(!(node instanceof Mesh))return;
    const positions=node.geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++)points.push(new Vector3().fromBufferAttribute(positions,i).applyMatrix4(node.matrixWorld));
  });
  assert.ok(points.length>20,'tilted node must contain actual exported meshes');
  // Compare sections along the stack axis; global-height extremes select opposite rim edges.
  points.sort((a,b)=>a.dot(vertical)-b.dot(vertical));
  const count=Math.ceil(points.length*.15);
  const meanX=(points:readonly import('three').Vector3[])=>points.reduce((sum,at)=>sum+at.x,0)/points.length;
  assert.ok(meanX(points.slice(-count))-meanX(points.slice(0,count))>.12,'upper funnel mesh must extend farther outboard than the base');
  let kittyCanted=false;(await readScene('historic-kitty-hawk')).traverse(node=>{if(node.userData.naval_funnel_cant)kittyCanted=true;});
  assert.equal(kittyCanted,false);
});

test('1940 Benson and Gleaves export two banks of five separate torpedo tubes',async()=>{
  // Contemporary Benson cruise book and Destroyer History's original-design records.
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const {Mesh}=await import('three');
  for(const id of ['benson','gleaves']) {
    const buffer=await readFile(new URL(`historic-${id}.glb`,directory));
    const {scene}=await new GLTFLoader().parseAsync(Uint8Array.from(buffer).buffer,'');
    const banks:import('three').Object3D[]=[];
    scene.traverse(node=>{if(node.userData.naval_torpedo_bank)banks.push(node);});
    assert.equal(banks.length,2,`${id}: two independent torpedo banks`);
    for(const bank of banks) {
      let tubes=0;
      bank.traverse(node=>{
        if(!(node instanceof Mesh))return;
        const materials=Array.isArray(node.material)?node.material:[node.material];
        if(!materials.every(material=>material.name==='fleet_ink'))return;
        // Count connected shells in the actual exported tube mesh, without trusting count metadata.
        const positions=node.geometry.getAttribute('position'),indices=node.geometry.index;
        const vertexIds=new Map<string,number>(),vertices:number[]=[],parents:number[]=[];
        for(let i=0;i<positions.count;i++) {
          const key=[positions.getX(i),positions.getY(i),positions.getZ(i)].map(value=>value.toFixed(5)).join(',');
          let at=vertexIds.get(key);
          if(at===undefined){at=parents.length;parents.push(at);vertexIds.set(key,at);}
          vertices.push(at);
        }
        const find=(index:number):number=>{while(required(parents[index])!==index){parents[index]=required(parents[required(parents[index])]);index=required(parents[index]);}return index;};
        for(let i=0;i<(indices?.count??positions.count);i+=3) {
          const a=required(vertices[indices?indices.getX(i):i]);
          for(let offset=1;offset<3;offset++)parents[find(required(vertices[indices?indices.getX(i+offset):i+offset]))]=find(a);
        }
        tubes+=new Set(parents.map((_,index)=>find(index))).size;
      });
      assert.equal(tubes,5,`${id}: each bank contains five physical tube shells`);
    }
  }
});
