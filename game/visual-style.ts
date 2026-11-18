// Fixed raster sizes keep the arcade pixels consistent across screens and DPRs.
// The simulation and input coordinates remain 480 × 760.
export const PIXEL_RASTER = {
  battlefield: { width: 240, height: 380 },
  preview: { width: 160, height: 100 },
} as const;

// Shared with the HUD and the baked, unlit 2D marker sprites.
export const VISUAL_SIGNALS = {
  danger: { model: 'enemy-round', color: '#ff384b', size: 9.5, label: '敌弹', shape: 'round' },
  aimed: { model: 'enemy-aimed', color: '#ff4d8b', size: 11.5, label: '敌弹', shape: 'diamond' },
  xp: { model: 'pickup-xp', color: '#35dfff', size: 18, label: '补给', shape: 'chevron-case' },
  health: { model: 'pickup-health', color: '#38e68f', size: 19, label: '维修', shape: 'cross-octagon' },
  bomb: { model: 'pickup-bomb', color: '#a38bff', size: 19, label: '航弹', shape: 'bomb-diamond' },
} as const;
