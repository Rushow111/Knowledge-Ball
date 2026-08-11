import fs from 'node:fs';
import path from 'node:path';

const sampleRate = 48000;
const duration = 24;
const frames = sampleRate * duration;
const left = new Float64Array(frames);
const right = new Float64Array(frames);

const TAU = Math.PI * 2;
const clamp = (v, a = -1, b = 1) => Math.max(a, Math.min(b, v));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const envAD = (t, start, attack, decay) => {
  if (t < start || t > start + attack + decay) return 0;
  if (t < start + attack) return smoothstep(start, start + attack, t);
  return 1 - smoothstep(start + attack, start + attack + decay, t);
};
const envWindow = (t, start, end, fade = 0.5) => {
  if (t < start || t > end) return 0;
  return smoothstep(start, start + fade, t) * (1 - smoothstep(end - fade, end, t));
};

let seed = 0x1234abcd;
const rnd = () => {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return seed / 0xffffffff;
};

const panGains = (pan) => {
  const p = clamp(pan, -1, 1);
  const angle = (p + 1) * Math.PI / 4;
  return [Math.cos(angle), Math.sin(angle)];
};

const addTone = ({start, dur, freq, amp, pan = 0, attack = 0.02, harmonics = [1], glideTo}) => {
  const [lg, rg] = panGains(pan);
  const s0 = Math.floor(start * sampleRate);
  const s1 = Math.min(frames, Math.floor((start + dur) * sampleRate));
  let phase = 0;
  for (let i = s0; i < s1; i++) {
    const t = i / sampleRate;
    const local = t - start;
    const e = envAD(t, start, attack, Math.max(0.001, dur - attack));
    const f = glideTo ? freq + (glideTo - freq) * (local / dur) : freq;
    phase += TAU * f / sampleRate;
    let v = 0;
    for (let h = 0; h < harmonics.length; h++) {
      const mul = harmonics[h];
      v += Math.sin(phase * mul) / (1 + h * 1.7);
    }
    v *= amp * e;
    left[i] += v * lg;
    right[i] += v * rg;
  }
};

const addWhoosh = ({start, dur, amp = 0.06, pan = 0, direction = 1}) => {
  const [lg, rg] = panGains(pan);
  const s0 = Math.floor(start * sampleRate);
  const s1 = Math.min(frames, Math.floor((start + dur) * sampleRate));
  let lp = 0;
  let hpPrev = 0;
  for (let i = s0; i < s1; i++) {
    const t = i / sampleRate;
    const p = (t - start) / dur;
    const e = Math.sin(Math.PI * clamp(p, 0, 1)) ** 1.7;
    const white = rnd() * 2 - 1;
    const cutoffMix = direction > 0 ? p : 1 - p;
    const alpha = 0.015 + cutoffMix * 0.16;
    lp += alpha * (white - lp);
    const hp = white - lp;
    const airy = 0.68 * hp + 0.32 * (hp - hpPrev);
    hpPrev = hp;
    const v = airy * amp * e;
    left[i] += v * lg;
    right[i] += v * rg;
  }
};

const addSoftImpact = ({start, amp = 0.12}) => {
  const dur = 1.35;
  const s0 = Math.floor(start * sampleRate);
  const s1 = Math.min(frames, Math.floor((start + dur) * sampleRate));
  let lp = 0;
  let phase = 0;
  for (let i = s0; i < s1; i++) {
    const t = i / sampleRate;
    const p = (t - start) / dur;
    const e = Math.exp(-p * 5.2);
    const f = 72 - 28 * p;
    phase += TAU * f / sampleRate;
    const white = rnd() * 2 - 1;
    lp += 0.035 * (white - lp);
    const v = (Math.sin(phase) * 0.76 + lp * 0.24) * amp * e;
    left[i] += v * 0.707;
    right[i] += v * 0.707;
  }
};

// Global ambient bed: deliberately quiet, continuous, and non-startling.
let driftPhase = 0;
let noiseLpL = 0;
let noiseLpR = 0;
for (let i = 0; i < frames; i++) {
  const t = i / sampleRate;
  const fadeIn = smoothstep(0, 1.8, t);
  const fadeOut = 1 - smoothstep(22.8, 24, t);
  const global = fadeIn * fadeOut;

  const motion = 0.62 + 0.38 * Math.sin(TAU * 0.035 * t + 0.4);
  const drone =
    Math.sin(TAU * 55 * t) * 0.015 +
    Math.sin(TAU * 82.4069 * t + 0.7) * 0.010 +
    Math.sin(TAU * 110 * t + 1.8) * 0.006;

  driftPhase += TAU * (0.045 + 0.015 * Math.sin(TAU * 0.012 * t)) / sampleRate;
  const airAmp = 0.008 + 0.005 * Math.sin(driftPhase);
  const wl = rnd() * 2 - 1;
  const wr = rnd() * 2 - 1;
  noiseLpL += 0.004 * (wl - noiseLpL);
  noiseLpR += 0.004 * (wr - noiseLpR);
  const airL = (wl - noiseLpL) * airAmp;
  const airR = (wr - noiseLpR) * airAmp;

  const lateLift = smoothstep(17.5, 22.0, t) * (1 - smoothstep(23.2, 24, t));
  const pad = lateLift * (
    Math.sin(TAU * 146.832 * t) * 0.012 +
    Math.sin(TAU * 220 * t + 0.3) * 0.010 +
    Math.sin(TAU * 293.665 * t + 0.9) * 0.008
  );

  left[i] += (drone * motion + airL + pad) * global;
  right[i] += (drone * (1.08 - 0.12 * motion) + airR + pad) * global;
}

// Opening: small scattered information ticks, never sharp.
const tickTimes = [0.55, 0.92, 1.32, 1.72, 2.08, 2.42, 2.72];
tickTimes.forEach((time, i) => {
  addTone({
    start: time,
    dur: 0.34,
    freq: 520 + (i % 4) * 86,
    amp: 0.018,
    pan: -0.7 + (i / (tickTimes.length - 1)) * 1.4,
    attack: 0.012,
    harmonics: [1, 2],
    glideTo: 460 + (i % 4) * 80,
  });
});

// White core reveal.
addWhoosh({start: 2.55, dur: 1.55, amp: 0.052, direction: 1});
addSoftImpact({start: 3.05, amp: 0.095});
addTone({start: 3.08, dur: 2.0, freq: 392, amp: 0.025, attack: 0.08, harmonics: [1, 2, 3], glideTo: 523.25});

// Node connection pings.
[4.15, 4.7, 5.3, 5.9, 6.5, 7.05].forEach((time, i) => {
  addTone({
    start: time,
    dur: 0.7,
    freq: [440, 523.25, 587.33, 659.25, 783.99, 880][i],
    amp: 0.026,
    pan: Math.sin(i * 1.7) * 0.55,
    attack: 0.01,
    harmonics: [1, 2],
  });
});

// PREMISE → REASONING → CONCLUSION: clearly rising but still restrained.
[
  [8.25, 523.25, -0.32],
  [9.18, 659.25, 0],
  [10.12, 783.99, 0.32],
].forEach(([time, freq, pan], i) => {
  addTone({start: time, dur: 1.05, freq, amp: 0.043 + i * 0.004, pan, attack: 0.025, harmonics: [1, 2, 3]});
  addTone({start: time + 0.04, dur: 0.82, freq: freq * 0.5, amp: 0.014, pan: -pan, attack: 0.03});
});

// Counterexample: weight without a jump-scare.
addWhoosh({start: 11.35, dur: 1.05, amp: 0.045, pan: -0.15, direction: 1});
addSoftImpact({start: 12.05, amp: 0.115});
addTone({start: 12.08, dur: 1.4, freq: 196, amp: 0.025, pan: 0.15, attack: 0.015, harmonics: [1, 1.5, 2]});

// Graph reconstruction and decomposition.
addWhoosh({start: 12.75, dur: 3.25, amp: 0.042, direction: 1});
[13.35, 13.72, 14.12, 14.56, 15.05, 15.54].forEach((time, i) => {
  addTone({
    start: time,
    dur: 0.75,
    freq: 330 * Math.pow(2, (i % 5) / 12),
    amp: 0.019,
    pan: -0.65 + (i / 5) * 1.3,
    attack: 0.018,
    harmonics: [1, 2],
  });
});

// Shared knowledge / private mastery layers.
addWhoosh({start: 16.3, dur: 1.5, amp: 0.035, direction: -1});
addTone({start: 17.0, dur: 3.2, freq: 293.665, amp: 0.021, pan: -0.28, attack: 0.45, harmonics: [1, 2]});
addTone({start: 17.32, dur: 2.9, freq: 369.994, amp: 0.019, pan: 0.28, attack: 0.45, harmonics: [1, 2]});

// Brand reveal: wide, bright, calm major sonority.
addWhoosh({start: 20.0, dur: 1.5, amp: 0.038, direction: 1});
[
  [21.0, 146.832, -0.22, 0.030],
  [21.0, 220.0, 0.18, 0.026],
  [21.03, 293.665, 0.35, 0.024],
  [21.18, 587.33, -0.18, 0.016],
  [21.46, 880.0, 0.1, 0.011],
].forEach(([start, freq, pan, amp]) => {
  addTone({start, dur: 2.55, freq, amp, pan, attack: 0.22, harmonics: [1, 2]});
});
addTone({start: 21.35, dur: 1.9, freq: 1174.66, amp: 0.010, pan: 0.4, attack: 0.04, harmonics: [1, 2], glideTo: 1318.51});

// Gentle safety limiter. Target peak ~0.44 (-7.1 dBFS), then edge fade.
let peak = 0;
for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
const targetPeak = 0.44;
const scale = peak > targetPeak ? targetPeak / peak : 1;
for (let i = 0; i < frames; i++) {
  const t = i / sampleRate;
  const edge = smoothstep(0, 0.3, t) * (1 - smoothstep(23.65, 24, t));
  left[i] = Math.tanh(left[i] * scale * 1.04) / 1.04 * edge;
  right[i] = Math.tanh(right[i] * scale * 1.04) / 1.04 * edge;
}

const channels = 2;
const bits = 16;
const bytesPerSample = bits / 8;
const blockAlign = channels * bytesPerSample;
const dataSize = frames * blockAlign;
const buffer = Buffer.alloc(44 + dataSize);

buffer.write('RIFF', 0);
buffer.writeUInt32LE(36 + dataSize, 4);
buffer.write('WAVE', 8);
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20);
buffer.writeUInt16LE(channels, 22);
buffer.writeUInt32LE(sampleRate, 24);
buffer.writeUInt32LE(sampleRate * blockAlign, 28);
buffer.writeUInt16LE(blockAlign, 32);
buffer.writeUInt16LE(bits, 34);
buffer.write('data', 36);
buffer.writeUInt32LE(dataSize, 40);

let offset = 44;
for (let i = 0; i < frames; i++) {
  buffer.writeInt16LE(Math.round(clamp(left[i]) * 32767), offset);
  buffer.writeInt16LE(Math.round(clamp(right[i]) * 32767), offset + 2);
  offset += 4;
}

const outDir = path.resolve('public');
fs.mkdirSync(outDir, {recursive: true});
const outPath = path.join(outDir, 'knowledge-ball-soundtrack.wav');
fs.writeFileSync(outPath, buffer);
console.log(`Generated ${outPath}: ${duration}s stereo 48kHz, target peak ${targetPeak}`);
