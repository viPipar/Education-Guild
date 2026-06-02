// 8-bit Retro Synthesizer using Web Audio API
// No assets required, zero latency, lightweight retro sounds!

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// 1. Click Sound - short high to low beep
export function playClick() {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square'; // retro square wave
    osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
    osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch (e) {
    console.warn('Audio play blocked or failed', e);
  }
}

// 2. Select / Tab Sound - quick double beep
export function playSelect() {
  try {
    const ctx = getAudioContext();
    
    // First beep
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(600, ctx.currentTime);
    gain1.gain.setValueAtTime(0.04, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start();
    osc1.stop(ctx.currentTime + 0.08);

    // Second beep (slightly delayed)
    const delay = 0.06;
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(800, ctx.currentTime + delay);
    gain2.gain.setValueAtTime(0.04, ctx.currentTime + delay);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.1);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + delay);
    osc2.stop(ctx.currentTime + delay + 0.1);

  } catch (e) {
    console.warn('Audio play blocked or failed', e);
  }
}

// 3. Level Up Sound - Ascending 8-bit Arpeggio fanfare
export function playLevelUp() {
  try {
    const ctx = getAudioContext();
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // C4, E4, G4, C5, E5, G5, C6
    const noteDuration = 0.08;

    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = ctx.currentTime + index * noteDuration;

      osc.type = index === notes.length - 1 ? 'square' : 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);
      
      // Final chord note rings longer
      const duration = index === notes.length - 1 ? 0.4 : 0.08;
      
      gain.gain.setValueAtTime(0.05, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    });
  } catch (e) {
    console.warn('Audio play blocked or failed', e);
  }
}

// 4. Vote/Bubble Sound - retro bubble pop
export function playVote() {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  } catch (e) {
    console.warn('Audio play blocked or failed', e);
  }
}
