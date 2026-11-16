import type Phaser from 'phaser';
import manifest from './sprite-manifest.json';
import type { ModelId } from './models.ts';

const assets = new Map(manifest.assets.map(asset => [asset.id, asset]));
export function spriteAsset(id: ModelId) {
  const asset = assets.get(id);
  if (!asset) throw new Error(`Missing sprite asset: ${id}`);
  return asset;
}
export function spriteFrame(id: ModelId, name: string) {
  const frame = spriteAsset(id).frames.find(frame => frame.name === name);
  if (!frame) throw new Error(`Missing sprite frame: ${id}/${name}`);
  return frame;
}

export class SpriteLibrary {
  private readonly pending = new Map<ModelId, Promise<void>>();
  constructor(private readonly scene: Phaser.Scene) {}

  load(id: ModelId): Promise<void> {
    if (this.scene.textures.exists(id)) return Promise.resolve();
    const pending = this.pending.get(id);
    if (pending) return pending;
    const asset = spriteAsset(id);
    const request = new Promise<void>((resolve, reject) => {
      const event = `filecomplete-image-${id}`;
      const clean = () => { this.scene.load.off(event, complete); this.scene.load.off('loaderror', fail); };
      const complete = () => {
        clean();
        const texture = this.scene.textures.get(id);
        for (const frame of asset.frames) texture.add(frame.name, 0, frame.x, frame.y, frame.width, frame.height);
        resolve();
      };
      const fail = (file: Phaser.Loader.File) => { if (file.key === id) { clean(); reject(new Error(`Sprite download failed: ${id}`)); } };
      this.scene.load.once(event, complete);
      this.scene.load.on('loaderror', fail);
      this.scene.load.image(id, `${import.meta.env.BASE_URL}assets/sprites/${asset.file}`);
      if (!this.scene.load.isLoading()) this.scene.load.start();
    }).finally(() => this.pending.delete(id));
    this.pending.set(id, request);
    return request;
  }

  preview({ id, canvas, frameName = 'preview' }: { id: ModelId; canvas: HTMLCanvasElement; frameName?: string }): void {
    const context = canvas.getContext('2d');
    const source = this.scene.textures.get(id).getSourceImage();
    if (!context || !(source instanceof HTMLImageElement)) throw new Error(`Sprite image unavailable: ${id}`);
    const frame = spriteFrame(id, frameName), scale = Math.min(canvas.width * .88 / frame.width, canvas.height * .88 / frame.height);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = false;
    const width = Math.round(frame.width * scale), height = Math.round(frame.height * scale);
    context.drawImage(source, frame.x, frame.y, frame.width, frame.height, Math.round((canvas.width - width) / 2), Math.round((canvas.height - height) / 2), width, height);
  }
}
