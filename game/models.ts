import type { AirKind, ShipKind } from './types.ts';
import { Object3D, Group, Mesh, InstancedMesh, DynamicDrawUsage, Matrix4 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HISTORICAL_SHIPS, historicalModel } from './naval-history.ts';
import type { HistoricalModelId, NavalHull } from './naval-history.ts';

export const MODEL_IDS = ['falcon', 'swift', 'turtle', 'scout', 'dart', 'gunship', 'boss', 'boss-final', 'carrier', 'island', 'pickup-xp', 'pickup-health', 'pickup-bomb', 'enemy-round', 'enemy-aimed', 'interceptor', 'diver', 'torpedo', 'patrol-boat', 'destroyer', 'cruiser', 'battleship', 'fleet-carrier', 'coastal-battery', 'oil-depot', 'transport'] as const;
export const HISTORICAL_MODEL_IDS=HISTORICAL_SHIPS.map(ship=>historicalModel(ship.id)).filter((id):id is HistoricalModelId=>id.startsWith('historic-'));
export const ALL_MODEL_IDS=[...MODEL_IDS,...HISTORICAL_MODEL_IDS];
export type ModelId = typeof MODEL_IDS[number] | HistoricalModelId;
export function unitModel(id: AirKind | ShipKind, variant = false): ModelId { return id === 'heavy-bomber' ? (variant ? 'boss-final' : 'boss') : id; }
export interface ModelInstance { root: Group; propellers: Object3D[]; parts: Map<string, Object3D>; ruins: Map<string, Object3D>; turrets: Object3D[]; waterline?: { halfWidth: number; halfLength: number }; navalRole?:NavalHull; combatStretch:number }

export class ModelBatch {
  readonly root = new Group();
  private readonly meshes: InstancedMesh[] = [];

  constructor(template: Group, readonly capacity: number) {
    template.updateMatrixWorld(true);
    template.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
      const instance = new InstancedMesh(geometry, object.material, capacity);
      instance.instanceMatrix.setUsage(DynamicDrawUsage);
      instance.count = 0;
      instance.frustumCulled = false;
      this.meshes.push(instance);
      this.root.add(instance);
    });
  }

  set(index: number, matrix: Matrix4): void {
    for (const mesh of this.meshes) mesh.setMatrixAt(index, matrix);
  }

  finish(count: number): void {
    for (const mesh of this.meshes) {
      mesh.count = Math.min(count, this.capacity);
      mesh.instanceMatrix.clearUpdateRanges();
      if (!mesh.count) continue;
      mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}

export class ModelLibrary {
  private templates = new Map<ModelId, Group>();
  private pending = new Map<ModelId, Promise<void>>();

  async load(): Promise<void> {
    await Promise.all(MODEL_IDS.map(id=>this.loadModel(id)));
  }

  loadModel(id:ModelId):Promise<void> {
    if(this.templates.has(id))return Promise.resolve();
    const pending=this.pending.get(id);if(pending)return pending;
    const loader = new GLTFLoader();
    const request=loader.loadAsync(`${import.meta.env.BASE_URL}assets/models/${id}.glb`).then(gltf=>{
      if (id.startsWith('pickup-') || id.startsWith('enemy-')) {
        gltf.scene.traverse(object => {
          if (!(object instanceof Mesh)) return;
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.toneMapped = false;
        });
      }
      this.templates.set(id, gltf.scene);
    }).finally(()=>this.pending.delete(id));
    this.pending.set(id,request);return request;
  }

  instantiate(id: ModelId, scale: number): ModelInstance {
    const template = this.templates.get(id);
    if (!template) throw new Error(`Model is not loaded: ${id}`);
    const root = template.clone(true);
    root.scale.setScalar(scale);
    const propellers: Object3D[] = [];
    const parts = new Map<string, Object3D>(), ruins = new Map<string, Object3D>();
    const turrets: Object3D[] = [];
    let waterline: ModelInstance['waterline'];
    let navalRole:NavalHull|undefined,combatStretch=1;
    root.traverse(object => {
      if (typeof object.userData.waterline_beam === 'number' && typeof object.userData.waterline_length === 'number') waterline = { halfWidth:object.userData.waterline_beam, halfLength:object.userData.waterline_length };
      if(typeof object.userData.game_role==='string')navalRole=object.userData.game_role as NavalHull;
      if(typeof object.userData.combat_stretch==='number')combatStretch=object.userData.combat_stretch;
      if (object.name.startsWith('propeller_')) propellers.push(object);
      if (typeof object.userData.game_part === 'string') parts.set(object.userData.game_part, object);
      if (typeof object.userData.game_ruin === 'string') { ruins.set(object.userData.game_ruin, object); object.visible = false; }
      if (object.name.startsWith('turret_')) turrets.push(object);
    });
    return { root, propellers, parts, ruins, turrets, waterline, navalRole, combatStretch };
  }

  createBatch(id: ModelId, capacity: number): ModelBatch {
    const template = this.templates.get(id);
    if (!template) throw new Error(`Model is not loaded: ${id}`);
    return new ModelBatch(template, capacity);
  }
}
