export function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('Required browser value is unavailable');
  return value;
}

export function element(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!(node instanceof HTMLElement)) throw new Error(`Missing interface element: ${id}`);
  return node;
}

export function canvas(id: string): HTMLCanvasElement {
  const node = element(id);
  if (!(node instanceof HTMLCanvasElement)) throw new Error(`Expected canvas: ${id}`);
  return node;
}

export function button(id: string): HTMLButtonElement {
  const node = element(id);
  if (!(node instanceof HTMLButtonElement)) throw new Error(`Expected button: ${id}`);
  return node;
}

export function select(id: string): HTMLSelectElement {
  const node = element(id);
  if (!(node instanceof HTMLSelectElement)) throw new Error(`Expected select: ${id}`);
  return node;
}

export function dialog(id: string): HTMLDialogElement {
  const node = element(id);
  if (!(node instanceof HTMLDialogElement)) throw new Error(`Expected dialog: ${id}`);
  return node;
}

export function anchor(id: string): HTMLAnchorElement {
  const node = element(id);
  if (!(node instanceof HTMLAnchorElement)) throw new Error(`Expected anchor: ${id}`);
  return node;
}
