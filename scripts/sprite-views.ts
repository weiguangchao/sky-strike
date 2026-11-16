import { spriteAsset, spriteFrame } from '../game/sprites.ts';
import type { ModelId } from '../game/models.ts';

export async function spriteViews(id: ModelId): Promise<string[]> {
  const source = new Image();
  source.src = `${import.meta.env.BASE_URL}assets/sprites/${spriteAsset(id).file}`;
  await source.decode();
  return ['top', 'preview'].map(name => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 400;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D unavailable');
    context.fillStyle = '#162936'; context.fillRect(0, 0, 640, 400); context.imageSmoothingEnabled = false;
    const frame = spriteFrame(id, name), scale = Math.min(560 / frame.width, 352 / frame.height);
    const width = Math.round(frame.width * scale), height = Math.round(frame.height * scale);
    context.drawImage(source, frame.x, frame.y, frame.width, frame.height, Math.round((640 - width) / 2), Math.round((400 - height) / 2), width, height);
    return canvas.toDataURL('image/png');
  });
}
