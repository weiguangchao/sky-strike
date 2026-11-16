import * as THREE from 'three';
import { WIDTH, HEIGHT, TAKEOFF_DURATION } from './engine.ts';
import type { Game } from './engine.ts';
import type { CraftId, Enemy, GameEvent, Pickup, AirKind, ShipKind, Wreck } from './types.ts';
import { ModelLibrary, unitModel } from './models.ts';
import { historicalModel, combatMainBearing } from './naval-history.ts';
import type { HistoricalShipId } from './naval-history.ts';
import type { ModelId, ModelInstance, ModelBatch } from './models.ts';
import { HULLS } from './campaign.ts';
import { PIXEL_RASTER, VISUAL_SIGNALS } from './visual-style.ts';

interface Visual extends ModelInstance { shadow: THREE.Mesh; id: ModelId }
interface Particle { x: number; z: number; y: number; vx: number; vz: number; vy: number; life: number; size: number; smoke: boolean; tint?: number }
interface Shockwave { mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; life: number; radius: number; max: number }
const matrix = new THREE.Object3D();
const color = new THREE.Color();

function lighting(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xd9edff, 0x162c42, 1.15));
  const sun = new THREE.DirectionalLight(0xfff2dc, 3.0);
  sun.position.set(-170, 500, -260);
  scene.add(sun);
}

function batch(scene: THREE.Scene, geometry: THREE.BufferGeometry, material: THREE.Material, count: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

function put(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, tint?: number, angle = 0): void {
  matrix.position.set(x, y, z);
  matrix.scale.set(sx, sy, sz);
  matrix.rotation.set(0, angle, 0);
  matrix.updateMatrix();
  mesh.setMatrixAt(index, matrix.matrix);
  if (tint !== undefined) mesh.setColorAt(index, color.setHex(tint));
}

function finishBatch(mesh: THREE.InstancedMesh, count: number): void {
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

function shadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#101e2833'; ctx.fillRect(3,2,10,12); ctx.fillRect(1,5,14,6);
  ctx.fillStyle = '#101e2833'; ctx.fillRect(4,4,8,8);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

const waterVertex = `
  varying vec2 vSea;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vSea = world.xz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
const waterFragment = `
  uniform float time;
  uniform float sector;
  uniform vec3 deepColor;
  uniform vec3 shallowColor;
  uniform vec3 stormColor;
  uniform vec3 crestColor;
  varying vec2 vSea;
  void main() {
    vec2 p = floor((vSea + vec2(0.0, -time * 18.0)) / 4.0) * 4.0;
    vec3 deep = mix(deepColor, stormColor, sector);
    float swell = sin(p.y * 0.012 + sin(p.x * 0.006) * 1.4);
    float dither = mod(floor(p.x / 4.0) + floor(p.y / 4.0), 2.0) * 0.025;
    float band = floor(clamp(0.48 + swell * 0.31 + dither, 0.0, 0.99) * 3.0) / 3.0;
    vec3 sea = mix(deep, shallowColor, band);
    float crest = step(0.99, sin(p.y * 0.11 + floor(p.x / 28.0) * 1.7));
    float dash = step(0.82, sin(floor(p.x / 12.0) * 2.3 + floor(p.y / 16.0)));
    sea = mix(sea, crestColor, crest * dash * 0.26);
    gl_FragColor = vec4(sea, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Renderer {
  private initialization?:Promise<void>;
  private readonly webgl: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-WIDTH/2, WIDTH/2, HEIGHT/2, -HEIGHT/2, 1, 1600);
  private readonly library = new ModelLibrary();
  private readonly previewRenderer: THREE.WebGLRenderer;
  private readonly previewScene = new THREE.Scene();
  private readonly previewCamera = new THREE.OrthographicCamera(-1.8,1.8,1.125,-1.125,.1,30);
  private readonly water = new THREE.ShaderMaterial({ vertexShader: waterVertex, fragmentShader: waterFragment, toneMapped: false, uniforms: { time: { value: 0 }, sector: { value: 0 }, deepColor: { value: new THREE.Color('#123954') }, shallowColor: { value: new THREE.Color('#1c455e') }, stormColor: { value: new THREE.Color('#172f50') }, crestColor: { value: new THREE.Color('#28546a') } } });
  private readonly shadows = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false });
  private readonly enemies = new Map<Enemy, Visual>();
  private readonly free = new Map<ModelId, Visual[]>();
  private readonly hero = new Map<CraftId, Visual>();
  private readonly players = new Map<CraftId, Visual>();
  private readonly drones = new Map<CraftId, Visual[]>();
  private readonly islands: ModelInstance[] = [];
  private carrier?: ModelInstance;
  private preview?: ModelInstance;
  private readonly tracers: THREE.InstancedMesh;
  private hostileBatches!: { danger: ModelBatch; aimed: ModelBatch };
  private pickupBatches!: Record<Pickup['type'], ModelBatch>;
  private readonly wrecks = new Map<Wreck, Visual>();
  private convoy?: Visual;
  private readonly details: THREE.InstancedMesh;
  private intelRenderer?: THREE.WebGLRenderer;
  private readonly intelScene = new THREE.Scene();
  private readonly intelCamera = new THREE.OrthographicCamera(-4,4,2.5,-2.5,.1,40);
  private intel?: ModelInstance;
  private readonly debris: THREE.InstancedMesh;
  private readonly center: THREE.Mesh;
  private readonly armor: THREE.Mesh[] = [];
  private particles: Particle[] = [];
  private rings: Shockwave[] = [];
  private time = 0;
  private frameCount = 0;
  private previousX = WIDTH/2;
  private bank = 0;
  private shake = 0;
  private ready = false;
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(canvas: HTMLCanvasElement, previewCanvas: HTMLCanvasElement, private readonly game: Game, private readonly intelCanvas?: HTMLCanvasElement) {
    this.webgl = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.webgl.setPixelRatio(1);
    this.webgl.outputColorSpace = THREE.SRGBColorSpace;
    this.webgl.toneMapping = THREE.ACESFilmicToneMapping;
    this.webgl.toneMappingExposure = .95;
    this.camera.position.set(0,1000,0);
    this.camera.up.set(0,0,-1);
    this.camera.lookAt(0,0,0);
    this.scene.background = new THREE.Color('#123954');
    lighting(this.scene);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(1800,2400), this.water);
    sea.rotation.x = -Math.PI/2;
    this.scene.add(sea);
    const bulletGeometry = new THREE.SphereGeometry(1,6,4);
    this.tracers = batch(this.scene, bulletGeometry, new THREE.MeshBasicMaterial({ color:0xffffff, toneMapped:false }), 1200);
    this.details = batch(this.scene, new THREE.BoxGeometry(1,1,1), new THREE.MeshBasicMaterial({ color:0xffffff, toneMapped:false }), 1500);
    this.debris = batch(this.scene, new THREE.IcosahedronGeometry(1,0), new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:.8}),600);
    this.center = new THREE.Mesh(new THREE.CircleGeometry(6,24), new THREE.MeshBasicMaterial({color:0x071422, toneMapped:false, side:THREE.DoubleSide}));
    const hitPoint = new THREE.Mesh(new THREE.CircleGeometry(3.5,24), new THREE.MeshBasicMaterial({color:0xfff1cb, toneMapped:false, side:THREE.DoubleSide}));
    hitPoint.position.z=.1;
    this.center.add(hitPoint);
    this.center.rotation.x = -Math.PI/2;
    this.scene.add(this.center);
    for(let i=0;i<4;i++) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(8,2,2), new THREE.MeshBasicMaterial({color:0xb7c393}));
      this.armor.push(plate); this.scene.add(plate);
    }
    this.previewRenderer = new THREE.WebGLRenderer({canvas:previewCanvas,alpha:true,antialias:false});
    this.previewRenderer.setPixelRatio(1);
    this.previewRenderer.setSize(PIXEL_RASTER.preview.width,PIXEL_RASTER.preview.height,false);
    this.previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
    this.previewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.previewRenderer.toneMappingExposure = .95;
    this.previewCamera.position.set(2.8,3.8,4.2);
    this.previewCamera.lookAt(0,.05,0);
    lighting(this.previewScene);
    if (intelCanvas) {
      this.intelRenderer = new THREE.WebGLRenderer({canvas:intelCanvas,alpha:true,antialias:false});
      this.intelRenderer.setPixelRatio(1);
      this.intelRenderer.setSize(192,120,false);
      this.intelRenderer.outputColorSpace = THREE.SRGBColorSpace;
      this.intelRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.intelRenderer.toneMappingExposure = .95;
      this.intelCamera.position.set(2,8,4);
      this.intelCamera.lookAt(0,0,0);
      lighting(this.intelScene);
    }
    this.resize();
  }

  init():Promise<void> {return this.initialization??=this.initialize();}

  private async initialize(): Promise<void> {
    await this.library.load();
    this.hostileBatches = { danger:this.library.createBatch(VISUAL_SIGNALS.danger.model,1200), aimed:this.library.createBatch(VISUAL_SIGNALS.aimed.model,1200) };
    this.pickupBatches = { xp:this.library.createBatch(VISUAL_SIGNALS.xp.model,300), health:this.library.createBatch(VISUAL_SIGNALS.health.model,300), bomb:this.library.createBatch(VISUAL_SIGNALS.bomb.model,300) };
    for (const batch of [...Object.values(this.hostileBatches), ...Object.values(this.pickupBatches)]) this.scene.add(batch.root);
    this.islands.push(this.library.instantiate('island',52),this.library.instantiate('island',37));
    this.islands.forEach(island => this.scene.add(island.root));
    this.carrier = this.library.instantiate('carrier',35);
    this.scene.add(this.carrier.root);
    for(const id of ['falcon','swift','turtle'] as const) {
      this.hero.set(id,this.visual(id,85));
      this.players.set(id,this.visual(id,23));
      this.drones.set(id,[this.visual(id,10),this.visual(id,10)]);
    }
    this.ready = true;
    this.selectCraft(this.game.craft);
    this.selectIntel('scout');
    this.render(0);
  }

  private visual(id: ModelId, scale: number): Visual {
    const instance = this.library.instantiate(id,scale);
    if(instance.navalRole || Object.hasOwn(HULLS,id)) instance.root.scale.set(scale*instance.combatStretch,scale*.5,scale);
    this.scene.add(instance.root);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1,1),this.shadows);
    shadow.rotation.x = -Math.PI/2;
    shadow.scale.set(scale*2.5,scale*1.7,1);
    this.scene.add(shadow);
    instance.root.visible = shadow.visible = false;
    return {...instance,shadow,id};
  }

  selectCraft(id: CraftId): void {
    if(!this.ready) return;
    if(this.preview) this.previewScene.remove(this.preview.root);
    this.preview = this.library.instantiate(id,.95);
    this.preview.root.rotation.y = -.35;
    this.previewScene.add(this.preview.root);
    this.previewRenderer.render(this.previewScene,this.previewCamera);
  }

  selectIntel(id: AirKind | ShipKind): void {
    this.selectIntelModel(unitModel(id),Object.hasOwn(HULLS,id));
  }

  async loadHistorical(id:HistoricalShipId):Promise<void> {await this.init();await this.library.loadModel(historicalModel(id));}

  selectHistorical(id:HistoricalShipId):void {this.selectIntelModel(historicalModel(id),true);}

  async loadArchiveModel(id: ModelId): Promise<void> { await this.init(); await this.library.loadModel(id); }

  selectArchiveModel(id: ModelId, naval: boolean): void { this.selectIntelModel(id, naval); }

  private selectIntelModel(id:ModelId,naval:boolean):void {
    if (!this.ready || !this.intelRenderer) return;
    if (this.intel) this.intelScene.remove(this.intel.root);
    this.intel = this.library.instantiate(id,1);
    this.intelScene.add(this.intel.root);
    if(naval) this.intel.root.rotation.y=-.55;
    const bounds=new THREE.Box3().setFromObject(this.intel.root);
    const center=bounds.getCenter(new THREE.Vector3());
    this.intelCamera.position.copy(center).add(new THREE.Vector3(2,8,4));
    this.intelCamera.lookAt(center);this.intelCamera.updateMatrixWorld(true);
    const projected=new THREE.Box3();
    const vertex=new THREE.Vector3();
    this.intel.root.traverseVisible(object=>{
      if(!(object instanceof THREE.Mesh)) return;
      const positions=object.geometry.getAttribute('position');
      for(let i=0;i<positions.count;i++) projected.expandByPoint(vertex.fromBufferAttribute(positions,i).applyMatrix4(object.matrixWorld).applyMatrix4(this.intelCamera.matrixWorldInverse));
    });
    const size=projected.getSize(new THREE.Vector3());
    const span=Math.max(size.y,size.x/1.6)*1.12;
    const midpoint=projected.getCenter(new THREE.Vector3());
    this.intelCamera.left=midpoint.x-span*.8;this.intelCamera.right=midpoint.x+span*.8;
    this.intelCamera.top=midpoint.y+span/2;this.intelCamera.bottom=midpoint.y-span/2;
    this.intelCamera.updateProjectionMatrix();
    this.intelRenderer.render(this.intelScene,this.intelCamera);
  }

  resize(): void { this.webgl.setSize(PIXEL_RASTER.battlefield.width,PIXEL_RASTER.battlefield.height,false); }

  event(event: GameEvent): void {
    if(event.type === 'explosion' || event.type === 'hurt' || event.type === 'ordnance' || event.type === 'partDestroyed' || event.type === 'navalSalvo') {
      const strength = event.type === 'explosion' ? event.size : event.type === 'ordnance' ? .65 : event.type === 'navalSalvo' ? .5 : 1;
      const surface = event.type === 'ordnance' || event.type === 'partDestroyed' || event.type === 'navalSalvo' || (event.type === 'explosion' && event.layer === 'surface');
      for(let i=0;i<Math.floor(22*strength);i++) {
        const angle = Math.random()*Math.PI*2, speed=(15+Math.random()*70)*strength;
        this.particles.push({x:event.x-WIDTH/2,z:event.y-HEIGHT/2,y:surface?18:85,vx:event.type==='navalSalvo'?-170:Math.cos(angle)*speed,vz:Math.sin(angle)*speed,vy:8+Math.random()*25,life:.4+Math.random()*.7,size:(2+Math.random()*5)*strength,smoke:i%3===0,tint:event.type==='navalSalvo'?0xffe4a1:undefined});
      }
      if(event.type!=='navalSalvo' && event.type!=='ordnance') this.shake = Math.max(this.shake,strength*2);
    }
    if(event.type === 'bomb' || event.type === 'shieldHit') {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(.94,1,64),new THREE.MeshBasicMaterial({color:event.type==='bomb'?0xf2dfaf:0xa9be8c,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));
      mesh.rotation.x = -Math.PI/2;
      mesh.position.set(this.game.player.x-WIDTH/2,140,this.game.player.y-HEIGHT/2);
      this.scene.add(mesh);
      this.rings.push({mesh,life:.75,radius:8,max:event.type==='bomb'?900:80});
      if(event.type==='bomb') this.shake=7;
    }
    if(event.type === 'start' || event.type === 'menu') {
      this.particles=[]; this.shake=0; this.bank=0; this.previousX=WIDTH/2;
      for(const ring of this.rings) { this.scene.remove(ring.mesh); ring.mesh.geometry.dispose(); ring.mesh.material.dispose(); }
      this.rings=[];
    }
    if(this.particles.length>600) this.particles.splice(0,this.particles.length-600);
  }

  private place(visual: Visual, x: number, z: number, y: number, turn: number, bank = 0): void {
    visual.root.visible = visual.shadow.visible = true;
    visual.root.position.set(x,y,z);
    visual.root.rotation.set(0,turn,bank);
    visual.shadow.position.set(x+10,.5,z+15);
    visual.shadow.rotation.z = -turn;
    for(const propeller of visual.propellers) propeller.rotation.z=this.time*43;
  }

  render(dt: number): void {
    if(!this.ready) return;
    const game=this.game, active=game.status==='playing', menu=game.status==='menu';
    if(active || (menu&&!this.reducedMotion)) this.time+=dt;
    this.water.uniforms.time.value=this.time;
    this.water.uniforms.sector.value=game.wave>5&&!menu?1:0;
    this.islands[0].root.position.set(-230,0,(this.time*18+360)%1750-850);
    this.islands[1].root.position.set(280,0,(this.time*18+1210)%2100-1000);
    if(this.carrier) {
      const launching = !menu && game.wave === 1 && game.time < 5;
      this.carrier.root.visible = menu || launching;
      const scale=launching?62:35;
      this.carrier.root.scale.set(scale,scale*.5,scale);
      this.carrier.root.position.set(launching ? 0 : 158,0,launching ? 145 + Math.max(0,game.time-.35)*150 : (this.time*13+360)%1800-650);
    }
    for(const visual of [...this.hero.values(),...this.players.values(),...[...this.drones.values()].flat()]) visual.root.visible=visual.shadow.visible=false;
    if(menu) {
      const hero=this.hero.get(game.craft)!;
      this.place(hero,0,10,140,-.08,this.reducedMotion?0:Math.sin(this.time*.7)*.06);
      this.center.visible=false;
    } else {
      const player=this.players.get(game.craft)!;
      const targetBank=THREE.MathUtils.clamp((this.previousX-game.player.x)*.055,-.45,.45);
      this.bank=THREE.MathUtils.lerp(this.bank,targetBank,Math.min(1,dt*9));
      this.previousX=game.player.x;
      this.place(player,game.player.x-WIDTH/2,game.player.y-HEIGHT/2,game.takingOff ? 18 + 67 * (game.time / TAKEOFF_DURATION) ** 2 : 85,0,this.bank);
      player.root.visible=game.status!=='gameover' && (game.takingOff || this.reducedMotion || game.player.invincible<=0 || Math.floor(this.time*8)%2===0);
      player.shadow.visible=game.status!=='gameover';
      const drones=this.drones.get(game.craft)!;
      for(let i=0;i<(game.stacks.drone||0);i++) this.place(drones[i],game.player.x-WIDTH/2+(i===0?-43:43),game.player.y-HEIGHT/2+10,85,0);
      this.center.visible=game.status!=='gameover';
      this.center.position.set(game.player.x-WIDTH/2,165,game.player.y-HEIGHT/2);
    }
    this.armor.forEach((plate,i)=>{
      plate.visible=!menu&&game.player.shield&&game.status!=='gameover';
      const angle=i*Math.PI/2;
      plate.position.set(game.player.x-WIDTH/2+Math.cos(angle)*34,120,game.player.y-HEIGHT/2+Math.sin(angle)*34);
      plate.rotation.y=-angle+Math.PI/2;
    });
    const living=new Set(menu?[]:game.enemies.filter(enemy=>!enemy.dead));
    for(const [enemy,visual] of this.enemies) if(!living.has(enemy)) {
      visual.root.visible=visual.shadow.visible=false;
      this.enemies.delete(enemy);
      const free=this.free.get(visual.id)||[]; free.push(visual);this.free.set(visual.id,free);
    }
    for(const enemy of living) {
      let visual=this.enemies.get(enemy);
      if(!visual) {
        const id = enemy.layer==='surface' && enemy.appearance ? historicalModel(enemy.appearance) : unitModel(enemy.layer==='surface' ? enemy.hull : enemy.type, enemy.layer==='air' && enemy.variant);
        const size = enemy.layer==='surface' ? HULLS[enemy.hull].scale : enemy.type==='heavy-bomber' ? 31 : enemy.type==='gunship' ? 27 : 18;
        visual=this.free.get(id)?.pop() || this.visual(id,size);
        this.enemies.set(enemy,visual);
      }
      this.place(visual,enemy.x-WIDTH/2,enemy.y-HEIGHT/2,enemy.layer==='surface'?0:enemy.type==='torpedo'?55:enemy.launchAge!==undefined && enemy.launchAge<1.2 ? 15+enemy.launchAge*53 : 78,enemy.layer==='surface'?enemy.heading:-enemy.heading);
      if (enemy.layer==='surface') {
        visual.shadow.visible=false;
        for (const [id, part] of visual.parts) part.visible=enemy.parts.some(p=>p.id===id && p.hp>0);
        for (const [id, ruin] of visual.ruins) ruin.visible=enemy.parts.some(p=>p.id===id && p.hp<=0);
        for (const turret of visual.turrets) {
          if(turret.name.startsWith('turret_main'))turret.rotation.y=combatMainBearing(turret.position.x);
          else if(turret.name.startsWith('turret_aa'))turret.rotation.y=Math.atan2(enemy.x-game.player.x,enemy.y-game.player.y);
        }
      }
    }
    this.renderSea(menu);
    this.renderBullets(menu);
    this.renderPickups(menu);
    this.renderEffects(active?dt:0);
    if(active&&!this.reducedMotion&&this.shake>.1) {
      this.camera.position.x=(Math.random()-.5)*this.shake;
      this.camera.position.z=(Math.random()-.5)*this.shake;
    } else { this.camera.position.x=0;this.camera.position.z=0; }
    if(active) this.shake*=Math.max(0,1-dt*9);
    this.webgl.render(this.scene,this.camera);
    if(this.intelRenderer && this.intel && this.intelCanvas?.getClientRects().length && this.frameCount%3===0) {
      for(const propeller of this.intel.propellers) propeller.rotation.z=this.time*25;
      this.intelRenderer.render(this.intelScene,this.intelCamera);
    }
    if(++this.frameCount%3===0 && this.preview && menu) {
      for(const propeller of this.preview.propellers) propeller.rotation.z=this.time*25;
      this.previewRenderer.render(this.previewScene,this.previewCamera);
    }
  }

  private renderSea(menu: boolean): void {
    const game=this.game;
    let detail=0;
    const mark=(x:number,y:number,sx:number,sz:number,tint:number,altitude=3,angle=0)=>{
      if(detail<1500) put(this.details,detail++,x-WIDTH/2,altitude,y-HEIGHT/2,sx,1,sz,tint,angle);
    };
    const flame=(x:number,y:number,index:number,scale=1)=>{
      const flicker=this.reducedMotion?1:.75+Math.sin(this.time*15+index)*.25;
      mark(x,y,9*flicker*scale,11*flicker*scale,0xe8a04f,22);
      mark(x-2,y+2,4*scale,5*scale,0xffde87,25);
      mark(x+3,y-7,10*scale,11*scale,0x424d49,30);
    };
    const wake=(x:number,y:number,visual:ModelInstance,fade=1)=>{
      if(!visual.waterline) return;
      const width=visual.waterline.halfWidth*visual.root.scale.x,length=visual.waterline.halfLength*visual.root.scale.z;
      for(let i=0;i<6*fade;i++) for(const side of [-1,1]) {
        const t=i/5;
        mark(x+side*(width*.28+t*16),y+length*.96+5+i*8,3-t*1.5,7+t*3,i<2?0x62878a:0x3a6171,1,side*-.35);
      }
      if(fade===1) for(const side of [-1,1]) {
        mark(x+side*width*.35,y-length*.89,2,9,0x6c8e8d,1,side*.5);
        mark(x+side*width*.61,y-length*.75,2,8,0x527781,1,side*.38);
      }
    };
    for(const [wreck,visual] of this.wrecks) if(menu || !game.wrecks.includes(wreck)) {
      visual.root.visible=false; this.wrecks.delete(wreck);
      const pool=this.free.get(visual.id)||[]; pool.push(visual); this.free.set(visual.id,pool);
    }
    for(const wreck of menu?[]:game.wrecks) {
      let visual=this.wrecks.get(wreck);
      if(!visual) {
        const id=wreck.appearance?historicalModel(wreck.appearance):wreck.hull;
        visual=this.free.get(id)?.pop()||this.visual(id,wreck.scale);
        this.wrecks.set(wreck,visual);
      }
      this.place(visual,wreck.x-WIDTH/2,wreck.y-HEIGHT/2,-12*Math.max(0,wreck.age-.7)**2,wreck.heading,wreck.age*.12);
      visual.shadow.visible=false;
      for(const part of visual.parts.values()) part.visible=false;
      for(const ruin of visual.ruins.values()) ruin.visible=true;
      if(wreck.age<1.1) wake(wreck.x,wreck.y,visual,1-wreck.age/1.1);
      if(wreck.age<1.9) for(let i=0;i<3;i++) flame(wreck.x+(i-1)*HULLS[wreck.hull].halfWidth*.25,wreck.y+(i-1)*HULLS[wreck.hull].halfLength*.40,i,Math.min(1,HULLS[wreck.hull].halfWidth/42));
    }
    if(!menu) for(const e of game.enemies) {
      if(e.dead) continue;
      if(e.layer==='surface') {
        const visual=this.enemies.get(e);
        if(visual) wake(e.x,e.y,visual);
        const selected=e.parts.filter(part=>part.hp>0&&Math.abs(game.player.x-e.x-part.x)<22&&e.y+part.y<game.player.y-25).sort((a,b)=>Math.abs(game.player.x-e.x-a.x)-Math.abs(game.player.x-e.x-b.x))[0];
        for(const part of e.parts) {
          if(part.hp<=0) { flame(e.x+part.x,e.y+part.y,e.id,part.id==='flight-deck'?1:.7); continue; }
          if(part!==selected && part.hp===part.maxHp) continue;
          const x=e.x+part.x,y=e.y+part.y,r=part.radius;
          const aligned=part===selected;
          const tint=aligned?0xe8b65b:0x8f9d7c;
          if(aligned) for(const sx of [-1,1]) for(const sy of [-1,1]) {
            mark(x+sx*r,y+sy*r,5,1.5,tint,65);
            mark(x+sx*r,y+sy*r,1.5,5,tint,65);
          }
          const width=Math.min(26,r*1.4),ratio=part.hp/part.maxHp;
          mark(x-width/2+width*ratio/2,y-r-5,width*ratio,2,tint,65);
        }
      } else if(e.type==='diver'&&e.action==='warning') {
        const end={x:e.lockedX,y:HEIGHT};
        const length=Math.hypot(end.x-e.x,end.y-e.y);
        const angle=-Math.atan2(end.x-e.x,-(end.y-e.y));
        for(let d=30;d<length;d+=28) mark(e.x+(end.x-e.x)*d/length,e.y+(end.y-e.y)*d/length,2,12,0xb99554,2,angle);
      }
    }
    if(!menu && this.carrier?.root.visible) wake(this.carrier.root.position.x+WIDTH/2,this.carrier.root.position.z+HEIGHT/2,this.carrier);
    const convoy=game.convoy;
    if(!menu && convoy&&!convoy.dead&&!convoy.saved) {
      this.convoy ||= this.visual('transport',HULLS.transport.scale);
      this.place(this.convoy,convoy.x-WIDTH/2,convoy.y-HEIGHT/2,0,0);
      this.convoy.shadow.visible=false;
      wake(convoy.x,convoy.y,this.convoy);
      mark(convoy.x,convoy.y-18,14,20,0x77bed1,55);
      mark(convoy.x,convoy.y-18,3,14,0xe9eed9,57);
    } else if(this.convoy) this.convoy.root.visible=this.convoy.shadow.visible=false;
    for(const torpedo of menu?[]:game.surfaceTorpedoes) {
      const angle=-Math.atan2(torpedo.vx,-torpedo.vy);
      mark(torpedo.x,torpedo.y,3,10,0x8cabad,2,angle);
      for(let i=1;i<=4;i++) mark(torpedo.x-torpedo.vx*.075*i,torpedo.y-torpedo.vy*.075*i,2+i,5,0x577982,1,angle);
    }
    finishBatch(this.details,detail);
  }

  private renderBullets(menu: boolean): void {
    const bullets=menu?[]:this.game.bullets;
    bullets.slice(0,1200).forEach((bullet,i)=>{
      const falling=bullet.kind==='ordnance';
      const altitude=falling ? 12+85*(1-(bullet.flight||0)/(bullet.duration||1)) : 125;
      put(this.tracers,i,bullet.x-WIDTH/2,altitude,bullet.y-HEIGHT/2,falling?3.5:bullet.kind==='missile'?2.4:1.5,falling?3:1,falling?6:bullet.kind==='missile'?5.5:8,bullet.critical?0xf6b460:0xffe9a8,-Math.atan2(bullet.vx,-bullet.vy));
    });
    finishBatch(this.tracers,Math.min(1200,bullets.length));
    const enemyBullets=menu?[]:this.game.enemyBullets;
    const counts={danger:0,aimed:0};
    for (const bullet of enemyBullets) {
      const type=bullet.color==='pink'?'aimed':'danger';
      const batch=this.hostileBatches[type];
      if (counts[type]>=batch.capacity) continue;
      const size=VISUAL_SIGNALS[type].size;
      matrix.position.set(bullet.x-WIDTH/2,170,bullet.y-HEIGHT/2);
      matrix.scale.setScalar(size);
      matrix.rotation.set(0,Math.atan2(-bullet.vx,-bullet.vy),0);
      matrix.updateMatrix();
      batch.set(counts[type]++,matrix.matrix);
    }
    this.hostileBatches.danger.finish(counts.danger);
    this.hostileBatches.aimed.finish(counts.aimed);
  }

  private renderPickups(menu: boolean): void {
    const counts={xp:0,health:0,bomb:0};
    for (const pickup of menu?[]:this.game.pickups) {
      const batch=this.pickupBatches[pickup.type];
      if (counts[pickup.type]>=batch.capacity) continue;
      matrix.position.set(pickup.x-WIDTH/2,140,pickup.y-HEIGHT/2);
      matrix.scale.setScalar(VISUAL_SIGNALS[pickup.type].size);
      matrix.rotation.set(0,0,0);
      matrix.updateMatrix();
      batch.set(counts[pickup.type]++,matrix.matrix);
    }
    for (const type of ['xp','health','bomb'] as const) this.pickupBatches[type].finish(counts[type]);
  }

  private renderEffects(dt: number): void {
    this.particles=this.particles.filter(particle=>particle.life>0);
    this.particles.forEach((particle,i)=>{
      particle.x+=particle.vx*dt;particle.z+=particle.vz*dt;particle.y+=particle.vy*dt;particle.life-=dt;
      const size=particle.size*(particle.smoke?1.7-particle.life:Math.max(.1,particle.life));
      put(this.debris,i,particle.x,particle.y,particle.z,size,size*.7,size,particle.tint??(particle.smoke?0x50574e:particle.life>.5?0xffd38a:0xc97643));
    });
    finishBatch(this.debris,this.particles.length);
    this.rings=this.rings.filter(ring=>{
      ring.life-=dt;
      ring.radius+=(ring.max-ring.radius)*dt*5;
      ring.mesh.scale.setScalar(ring.radius);
      ring.mesh.material.opacity=Math.max(0,ring.life*.8);
      if(ring.life>0) return true;
      this.scene.remove(ring.mesh);ring.mesh.geometry.dispose();ring.mesh.material.dispose();return false;
    });
  }
}
