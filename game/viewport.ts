/** Browser toolbars may shrink the visual viewport without resizing the layout viewport. */
export function trackViewport(onResize: () => void): () => void {
  const root = document.documentElement;
  const viewport = window.visualViewport;
  const compact = matchMedia('(max-width: 700px), (pointer: coarse) and (max-width: 1000px) and (max-height: 600px)');
  let frame = 0;
  let previous = '';
  function sync() {
    frame = 0;
    document.body.classList.toggle('compact-layout', compact.matches);
    // Leave native pinch zoom in charge instead of relaying out the game underneath it.
    if (viewport && Math.abs(viewport.scale - 1) > .01) return;
    const width = viewport?.width || window.innerWidth;
    const height = viewport?.height || window.innerHeight;
    const top = viewport?.offsetTop || 0;
    const left = viewport?.offsetLeft || 0;
    const next = `${width}/${height}/${top}/${left}`;
    if (next === previous) return;
    previous = next;
    root.style.setProperty('--viewport-width', `${width}px`);
    root.style.setProperty('--viewport-height', `${height}px`);
    root.style.setProperty('--viewport-top', `${top}px`);
    root.style.setProperty('--viewport-left', `${left}px`);
    onResize();
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(sync); }
  window.addEventListener('resize', schedule);
  viewport?.addEventListener('resize', schedule);
  viewport?.addEventListener('scroll', schedule);
  compact.addEventListener('change', schedule);
  sync();
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', schedule);
    viewport?.removeEventListener('resize', schedule);
    viewport?.removeEventListener('scroll', schedule);
    compact.removeEventListener('change', schedule);
  };
}
