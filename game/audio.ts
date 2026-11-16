export class Sound {
  enabled: boolean;
  context: AudioContext | null = null;
  lastShot = 0;
  constructor(enabled = false) { this.enabled = enabled; this.context = null; this.lastShot = 0; }
  unlock() {
    if (!this.enabled) return;
    try { this.context ||= new AudioContext(); this.context.resume(); } catch { this.enabled = false; }
  }
  tone({ from, to, duration, volume = .04, type = 'sine', delay = 0 }: { from: number; to: number; duration: number; volume?: number; type?: OscillatorType; delay?: number }) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const c = this.context, at = c.currentTime + delay, oscillator = c.createOscillator(), gain = c.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(from, at); oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + duration);
    gain.gain.setValueAtTime(volume, at); gain.gain.exponentialRampToValueAtTime(.001, at + duration);
    oscillator.connect(gain); gain.connect(c.destination); oscillator.start(at); oscillator.stop(at + duration + .01);
  }
  play(type: string) {
    if (!this.enabled) return;
    if (type === 'shoot') { const now = performance.now(); if (now - this.lastShot < 110) return; this.lastShot = now; this.tone({ from: 820, to: 350, duration: .055, volume: .012, type: 'triangle' }); }
    if (type === 'explosion') { this.tone({ from: 130, to: 28, duration: .22, volume: .065, type: 'sawtooth' }); this.tone({ from: 60, to: 25, duration: .3, volume: .06 }); }
    if (type === 'ordnance') this.tone({ from: 180, to: 45, duration: .14, volume: .025, type: 'triangle' });
    if (type === 'partDestroyed') this.tone({ from: 100, to: 28, duration: .3, volume: .05, type: 'sawtooth' });
    if (type === 'navalSalvo') this.tone({ from: 70, to: 23, duration: .4, volume: .035 });
    if (type === 'hurt') this.tone({ from: 220, to: 55, duration: .22, volume: .09, type: 'square' });
    if (type === 'bomb') { this.tone({ from: 90, to: 22, duration: .8, volume: .16, type: 'sawtooth' }); this.tone({ from: 280, to: 25, duration: .7, volume: .07 }); }
    if (type === 'upgrade' || type === 'upgraded') [440, 554, 660].forEach((note, i) => this.tone({ from: note, to: note * 1.01, duration: .2, volume: .06, type: 'sine', delay: i * .09 }));
    if (type === 'start') this.tone({ from: 260, to: 800, duration: .3, volume: .05, type: 'triangle' });
    if (type === 'end') this.tone({ from: 440, to: 110, duration: .6, volume: .06, type: 'triangle' });
    if (type === 'pickup') this.tone({ from: 720, to: 1100, duration: .12, volume: .04 });
  }
}
