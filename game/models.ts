import { Object3D, Group, Mesh, InstancedMesh, DynamicDrawUsage, Matrix4 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const MODEL_IDS = ['falcon', 'swift', 'turtle', 'scout', 'dart', 'gunship', 'boss', 'boss-final', 'carrier', 'island', 'pickup-xp', 'pickup-health', 'pickup-bomb', 'enemy-round', 'enemy-aimed'] as const;
export type ModelId = typeof MODEL_IDS[number];
export interface ModelInstance { root: Group; propellers: Object3D[] }

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

  async load(): Promise<void> {
    const loader = new GLTFLoader();
    await Promise.all(MODEL_IDS.map(async id => {
      const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}assets/models/${id}.glb`);
      if (id.startsWith('pickup-') || id.startsWith('enemy-')) {
        gltf.scene.traverse(object => {
          if (!(object instanceof Mesh)) return;
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.toneMapped = false;
        });
      }
      this.templates.set(id, gltf.scene);
    }));
  }

  instantiate(id: ModelId, scale: number): ModelInstance {
    const template = this.templates.get(id);
    if (!template) throw new Error(`Model is not loaded: ${id}`);
    const root = template.clone(true);
    root.scale.setScalar(scale);
    const propellers: Object3D[] = [];
    root.traverse(object => { if (object.name.startsWith('propeller_')) propellers.push(object); });
    return { root, propellers };
  }

  createBatch(id: ModelId, capacity: number): ModelBatch {
    const template = this.templates.get(id);
    if (!template) throw new Error(`Model is not loaded: ${id}`);
    return new ModelBatch(template, capacity);
  }
}
