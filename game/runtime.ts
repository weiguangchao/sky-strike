import Phaser from 'phaser';
import { WIDTH, HEIGHT } from './engine.ts';
import type { Game } from './engine.ts';
import type { AirKind, CraftId, GameEvent, Input, Point, ShipKind } from './types.ts';
import type { HistoricalShipId } from './naval-history.ts';
import { historicalModel } from './naval-history.ts';
import { MODEL_IDS, unitModel } from './models.ts';
import type { ModelId } from './models.ts';
import { PIXEL_RASTER } from './visual-style.ts';
import { Renderer } from './render.ts';

interface RuntimeOptions {
  canvas: HTMLCanvasElement;
  previewCanvas: HTMLCanvasElement;
  intelCanvas: HTMLCanvasElement;
  combat: Game;
  frame: (dt: number, input: Input) => void;
  keydown: (event: KeyboardEvent) => void;
  allowInput: () => boolean;
  unlockSound: () => void;
}

function deferredReady() {
  let resolve = () => {};
  let reject = (_error: unknown) => {};
  const promise = new Promise<void>((onReady, onError) => { resolve = onReady; reject = onError; });
  return { promise, resolve, reject };
}

class BattlefieldScene extends Phaser.Scene {
  readonly ready = deferredReady();
  private state: { kind: 'loading' } | { kind: 'ready'; renderer: Renderer } = { kind: 'loading' };
  private readonly keys = new Set<string>();
  private readonly handledKeys = new WeakSet<KeyboardEvent>();
  private pointer: { id: number; position: Point; target: Point } | null = null;
  private capturedMouse: number | null = null;

  constructor(private readonly options: RuntimeOptions) { super('battlefield'); }
  get view(): Renderer | undefined { return this.state.kind === 'ready' ? this.state.renderer : undefined; }
  get isReady(): boolean { return this.state.kind === 'ready'; }

  create(): void {
    const captureMouse = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || !this.options.allowInput() || this.options.combat.status !== 'playing') return;
      this.options.canvas.setPointerCapture(event.pointerId);
      this.capturedMouse = event.pointerId;
    };
    const releaseMouse = (event: PointerEvent) => {
      if (event.pointerId !== this.capturedMouse) return;
      this.capturedMouse = null;
      if (this.pointer?.id === this.input.mousePointer.id) this.pointer = null;
    };
    this.options.canvas.addEventListener('pointerdown', captureMouse);
    this.options.canvas.addEventListener('lostpointercapture', releaseMouse);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.clearInput();
      this.options.canvas.removeEventListener('pointerdown', captureMouse);
      this.options.canvas.removeEventListener('lostpointercapture', releaseMouse);
    });
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      // Phaser can replay queued native events when several arrive before the next frame.
      if (this.handledKeys.has(event)) return;
      this.handledKeys.add(event);
      if (!this.options.allowInput() || event.ctrlKey || event.metaKey || event.altKey) return;
      this.options.keydown(event);
      if (this.options.combat.status === 'playing') this.keys.add(event.key.toLowerCase());
    });
    this.input.keyboard?.on('keyup', (event: KeyboardEvent) => {
      if (this.handledKeys.has(event)) return;
      this.handledKeys.add(event); this.keys.delete(event.key.toLowerCase());
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.options.allowInput() || this.options.combat.status !== 'playing' || this.pointer) return;
      this.options.unlockSound();
      this.pointer = { id: pointer.id, position: { x: pointer.x * 2, y: pointer.y * 2 }, target: { x: this.options.combat.player.x, y: this.options.combat.player.y } };
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.pointer || this.pointer.id !== pointer.id || this.options.combat.status !== 'playing') return;
      const position = { x: pointer.x * 2, y: pointer.y * 2 };
      this.pointer.target.x = Phaser.Math.Clamp(this.pointer.target.x + (position.x - this.pointer.position.x) * 1.12, 24, WIDTH - 24);
      this.pointer.target.y = Phaser.Math.Clamp(this.pointer.target.y + (position.y - this.pointer.position.y) * 1.12, 100, HEIGHT - 45);
      this.pointer.position = position;
    });
    const release = (pointer: Phaser.Input.Pointer) => { if (this.pointer?.id === pointer.id) this.pointer = null; };
    this.input.on('pointerup', release); this.input.on('pointerupoutside', release);
    const renderer = new Renderer(this, this.options.combat);
    void Promise.all(MODEL_IDS.map(id => renderer.library.load(id))).then(() => {
      this.state = { kind: 'ready', renderer };
      renderer.render(0); this.ready.resolve();
    }, error => this.ready.reject(error));
  }

  clearInput(): void {
    this.keys.clear(); this.pointer = null;
    if (this.capturedMouse !== null && this.options.canvas.hasPointerCapture(this.capturedMouse)) this.options.canvas.releasePointerCapture(this.capturedMouse);
    this.capturedMouse = null;
  }
  update(_time: number, delta: number): void {
    if (this.state.kind !== 'ready') return;
    const dt = Math.min(delta / 1000, .05);
    const x = Number(this.keys.has('d') || this.keys.has('arrowright')) - Number(this.keys.has('a') || this.keys.has('arrowleft'));
    const y = Number(this.keys.has('s') || this.keys.has('arrowdown')) - Number(this.keys.has('w') || this.keys.has('arrowup'));
    this.options.frame(dt, this.pointer ? { x, y, target: this.pointer.target } : { x, y });
    this.state.renderer.render(dt);
  }
}

export class GameRuntime {
  readonly version = Phaser.VERSION;
  private readonly scene: BattlefieldScene;
  private phaser: Phaser.Game | null = null;
  constructor(private readonly options: RuntimeOptions) {
    this.scene = new BattlefieldScene(options);
    options.canvas.dataset.engineVersion = this.version;
    options.previewCanvas.width = PIXEL_RASTER.preview.width; options.previewCanvas.height = PIXEL_RASTER.preview.height;
    options.intelCanvas.width = 192; options.intelCanvas.height = 120;
  }
  get isReady(): boolean { return this.scene.isReady; }
  init(): Promise<void> {
    this.phaser ??= new Phaser.Game({
      type: Phaser.WEBGL, canvas: this.options.canvas, parent: null,
      width: PIXEL_RASTER.battlefield.width, height: PIXEL_RASTER.battlefield.height,
      scene: [this.scene], banner: false, autoFocus: false, backgroundColor: '#123954',
      render: { antialias: false, pixelArt: true, roundPixels: false },
      scale: { mode: Phaser.Scale.NONE, autoRound: true },
      input: { activePointers: 2, keyboard: { capture: [] }, touch: { capture: true }, mouse: { preventDefaultWheel: false } },
      audio: { noAudio: true }, fps: { target: 60 },
    });
    this.resize();
    return this.scene.ready.promise;
  }
  clearInput(): void { this.scene.clearInput(); }
  resize(): void { this.phaser?.scale.refresh(); }
  destroy(): void { this.clearInput(); this.phaser?.destroy(false); }
  event(event: GameEvent): void { this.scene.view?.event(event); }
  selectCraft(id: CraftId): void { this.scene.view?.library.preview({ id, canvas: this.options.previewCanvas }); }
  selectIntel(id: AirKind | ShipKind): void { this.selectArchiveModel(unitModel(id)); }
  async loadHistorical(id: HistoricalShipId): Promise<void> { await this.loadArchiveModel(historicalModel(id)); }
  async loadArchiveModel(id: ModelId): Promise<void> { await this.init(); await this.scene.view?.library.load(id); }
  selectArchiveModel(id: ModelId): void { this.scene.view?.library.preview({ id, canvas: this.options.intelCanvas }); }
}
