export class Sound {
  constructor(enabled = false) { this.enabled = enabled; this.context = null; this.lastShot = 0; }
  unlock() {
    if (!this.enabled) return;
    try { this.context ||= new (window.AudioContext || window.webkitAudioContext)(); this.context.resume(); } catch { this.enabled = false; }
  }
  tone(from, to, duration, volume = .04, type = 'sine', delay = 0) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const c = this.context, at = c.currentTime + delay, oscillator = c.createOscillator(), gain = c.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(from, at); oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + duration);
    gain.gain.setValueAtTime(volume, at); gain.gain.exponentialRampToValueAtTime(.001, at + duration);
    oscillator.connect(gain); gain.connect(c.destination); oscillator.start(at); oscillator.stop(at + duration + .01);
  }
  play(type) {
    if (!this.enabled) return;
    if (type === 'shoot') { const now = performance.now(); if (now - this.lastShot < 110) return; this.lastShot = now; this.tone(820, 350, .055, .012, 'triangle'); }
    if (type === 'explosion') { this.tone(130, 28, .22, .065, 'sawtooth'); this.tone(60, 25, .3, .06); }
    if (type === 'hurt') this.tone(220, 55, .22, .09, 'square');
    if (type === 'bomb') { this.tone(90, 22, .8, .16, 'sawtooth'); this.tone(280, 25, .7, .07); }
    if (type === 'upgrade' || type === 'upgraded') [440, 554, 660].forEach((note, i) => this.tone(note, note * 1.01, .2, .06, 'sine', i * .09));
    if (type === 'start') this.tone(260, 800, .3, .05, 'triangle');
    if (type === 'end') this.tone(440, 110, .6, .06, 'triangle');
    if (type === 'pickup') this.tone(720, 1100, .12, .04);
  }
}
