import * as THREE from 'three';
import { WIDTH, HEIGHT } from './engine.ts';
import type { Game } from './engine.ts';
import type { CraftId, Enemy, GameEvent, Pickup } from './types.ts';
import { ModelLibrary } from './models.ts';
import type { ModelId, ModelInstance, ModelBatch } from './models.ts';
import { VISUAL_SIGNALS } from './visual-style.ts';

interface Visual extends ModelInstance { shadow: THREE.Mesh; id: ModelId }
interface Particle { x: number; z: number; y: number; vx: number; vz: number; vy: number; life: number; size: number; smoke: boolean }
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
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32,32,3,32,32,30);
  gradient.addColorStop(0, '#0b18165c'); gradient.addColorStop(.55, '#0b18162c'); gradient.addColorStop(1, '#0b181600');
  ctx.fillStyle = gradient; ctx.fillRect(0,0,64,64);
  return new THREE.CanvasTexture(canvas);
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
  varying vec2 vSea;
  void main() {
    vec2 p = vSea + vec2(0.0, -time * 18.0);
    float waves = sin(p.y * 0.12 + sin(p.x * 0.021) * 2.0);
    float ripple = sin(p.x * 0.35 + p.y * 0.07) * sin(p.y * 0.43 - time * 0.6);
    vec3 deep = mix(deepColor, stormColor, sector);
    float tide = 0.18 + sin(p.x * 0.004 + p.y * 0.002) * 0.1;
    vec3 sea = mix(deep, shallowColor, tide) + (waves + ripple * 0.3) * vec3(0.001, 0.003, 0.005);
    float foam = pow(max(0.0, sin(p.y * 0.065 + sin(p.x * 0.016) * 3.0) * sin(p.x * 0.025 + cos(p.y * 0.03))), 32.0);
    sea += foam * vec3(0.006,0.014,0.02);
    gl_FragColor = vec4(sea, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Renderer {
  private readonly webgl: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-WIDTH/2, WIDTH/2, HEIGHT/2, -HEIGHT/2, 1, 1600);
  private readonly library = new ModelLibrary();
  private readonly previewRenderer: THREE.WebGLRenderer;
  private readonly previewScene = new THREE.Scene();
  private readonly previewCamera = new THREE.OrthographicCamera(-1.8,1.8,1.125,-1.125,.1,30);
  private readonly water = new THREE.ShaderMaterial({ vertexShader: waterVertex, fragmentShader: waterFragment, toneMapped: false, uniforms: { time: { value: 0 }, sector: { value: 0 }, deepColor: { value: new THREE.Color('#063d66') }, shallowColor: { value: new THREE.Color('#086b8c') }, stormColor: { value: new THREE.Color('#0c335e') } } });
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

  constructor(canvas: HTMLCanvasElement, previewCanvas: HTMLCanvasElement, private readonly game: Game) {
    this.webgl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.webgl.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    this.webgl.outputColorSpace = THREE.SRGBColorSpace;
    this.webgl.toneMapping = THREE.ACESFilmicToneMapping;
    this.webgl.toneMappingExposure = .95;
    this.camera.position.set(0,1000,0);
    this.camera.up.set(0,0,-1);
    this.camera.lookAt(0,0,0);
    this.scene.background = new THREE.Color('#063d66');
    lighting(this.scene);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(1800,2400), this.water);
    sea.rotation.x = -Math.PI/2;
    this.scene.add(sea);
    const bulletGeometry = new THREE.SphereGeometry(1,6,4);
    this.tracers = batch(this.scene, bulletGeometry, new THREE.MeshBasicMaterial({ color:0xffffff, toneMapped:false }), 1200);
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
    this.previewRenderer = new THREE.WebGLRenderer({canvas:previewCanvas,alpha:true,antialias:true});
    this.previewRenderer.setPixelRatio(Math.min(devicePixelRatio || 1,1.5));
    this.previewRenderer.setSize(480,300,false);
    this.previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
    this.previewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.previewRenderer.toneMappingExposure = .95;
    this.previewCamera.position.set(2.8,3.8,4.2);
    this.previewCamera.lookAt(0,.05,0);
    lighting(this.previewScene);
    this.resize();
  }

  async init(): Promise<void> {
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
    this.render(0);
  }

  private visual(id: ModelId, scale: number): Visual {
    const instance = this.library.instantiate(id,scale);
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

  resize(): void { this.webgl.setSize(WIDTH,HEIGHT,false); }

  event(event: GameEvent): void {
    if(event.type === 'explosion' || event.type === 'hurt') {
      const strength = event.type === 'explosion' ? event.size : 1;
      for(let i=0;i<Math.floor(22*strength);i++) {
        const angle = Math.random()*Math.PI*2, speed=(15+Math.random()*70)*strength;
        this.particles.push({x:event.x-WIDTH/2,z:event.y-HEIGHT/2,y:85,vx:Math.cos(angle)*speed,vz:Math.sin(angle)*speed,vy:8+Math.random()*25,life:.4+Math.random()*.7,size:(2+Math.random()*5)*strength,smoke:i%3===0});
      }
      this.shake = Math.max(this.shake,strength*2);
    }
    if(event.type === 'bomb' || event.type === 'shieldHit') {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(.94,1,64),new THREE.MeshBasicMaterial({color:event.type==='bomb'?0xf2dfaf:0xa9be8c,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));
      mesh.rotation.x = -Math.PI/2;
      mesh.position.set(this.game.player.x-WIDTH/2,140,this.game.player.y-HEIGHT/2);
      this.scene.add(mesh);
      this.rings.push({mesh,life:.75,radius:8,max:event.type==='bomb'?900:80});
      if(event.type==='bomb') this.shake=7;
    }
    if(event.type === 'start') { this.particles=[]; this.shake=0; this.bank=0; this.previousX=WIDTH/2; }
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
    if(this.carrier) this.carrier.root.position.set(158,0,(this.time*13+360)%1800-650);
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
      this.place(player,game.player.x-WIDTH/2,game.player.y-HEIGHT/2,85,0,this.bank);
      player.root.visible=game.status!=='gameover' && (this.reducedMotion || game.player.invincible<=0 || Math.floor(this.time*8)%2===0);
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
        const id:ModelId=enemy.type==='boss'?(enemy.final?'boss-final':'boss'):enemy.type;
        visual=this.free.get(id)?.pop() || this.visual(id,enemy.type==='boss'?45:enemy.type==='gunship'?27:18);
        this.enemies.set(enemy,visual);
      }
      this.place(visual,enemy.x-WIDTH/2,enemy.y-HEIGHT/2,78,Math.PI);
    }
    this.renderBullets(menu);
    this.renderPickups(menu);
    this.renderEffects(active?dt:0);
    if(active&&!this.reducedMotion&&this.shake>.1) {
      this.camera.position.x=(Math.random()-.5)*this.shake;
      this.camera.position.z=(Math.random()-.5)*this.shake;
    } else { this.camera.position.x=0;this.camera.position.z=0; }
    if(active) this.shake*=Math.max(0,1-dt*9);
    this.webgl.render(this.scene,this.camera);
    if(++this.frameCount%3===0 && this.preview && menu) {
      for(const propeller of this.preview.propellers) propeller.rotation.z=this.time*25;
      this.previewRenderer.render(this.previewScene,this.previewCamera);
    }
  }

  private renderBullets(menu: boolean): void {
    const bullets=menu?[]:this.game.bullets;
    bullets.slice(0,1200).forEach((bullet,i)=>put(this.tracers,i,bullet.x-WIDTH/2,125,bullet.y-HEIGHT/2,bullet.kind==='missile'?2.4:1.5,1,bullet.kind==='missile'?5.5:8,bullet.critical?0xf6b460:0xffe9a8,-Math.atan2(bullet.vx,-bullet.vy)));
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
      put(this.debris,i,particle.x,particle.y,particle.z,size,size*.7,size,particle.smoke?0x50574e:particle.life>.5?0xffd38a:0xc97643);
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
