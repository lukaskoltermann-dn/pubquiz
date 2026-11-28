// Show-Effekte: Konfetti und Klänge (Web Audio, ganz ohne Sounddateien)
let ac = null, out = null, nbuf = null, on = localStorage.getItem("pq-fx") !== "0";
export const fxOn = () => on;
export function setFx(v) { on = v; try { localStorage.setItem("pq-fx", v ? "1" : "0"); } catch {} }
// Browser erlauben Ton erst nach einem Klick: beim ersten Klick freischalten
export function unlock() {
  try {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ac.createDynamicsCompressor(); out = ac.createGain(); out.gain.value = .9; out.connect(comp).connect(ac.destination);
      nbuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === "suspended") ac.resume();
  } catch {}
}
const ok = () => on && ac && ac.state === "running";
function tone(f, t0, dur, { type = "sine", vol = .3, attack = .01, f2, lp } = {}) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
  let n = o; if (lp) { const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = lp; o.connect(f); n = f; }
  n.connect(g).connect(out); o.start(t0); o.stop(t0 + dur + .05);
}
function noise(t0, dur, vol, freq = 1200, q = .8) {
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = nbuf; s.loop = true; f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + .005); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
  s.connect(f).connect(g).connect(out); s.start(t0); s.stop(t0 + dur + .05);
}
// Ticken in den letzten Sekunden
export function tick(hi) { if (!ok()) return; const t = ac.currentTime; tone(hi ? 1500 : 1000, t, .09, { type: "square", vol: .09, lp: 3000 }); }
// Gong, wenn die Zeit um ist
export function gong() {
  if (!ok()) return; const t = ac.currentTime + .02;
  [[1, .4, 5], [2.76, .18, 3.5], [5.4, .09, 2.2], [8.93, .04, 1.2], [.5, .25, 4]].forEach(([m, v, d]) => tone(98 * m, t, d, { vol: v, attack: .004 }));
  noise(t, .25, .25, 400, .5);
}
// Kurzer Glockenschlag, z. B. beim Aufdecken
export function ding() { if (!ok()) return; const t = ac.currentTime; tone(1046, t, .7, { type: "triangle", vol: .28 }); tone(1568, t + .09, .9, { type: "triangle", vol: .2 }); }
// Tada für den Zwischenstand
export function tada() { if (!ok()) return; const t = ac.currentTime; [[523, 0, .14], [784, .15, .8]].forEach(([f, d, l]) => { tone(f, t + d, l, { type: "sawtooth", vol: .12, lp: 2600 }); tone(f * 2, t + d, l, { type: "triangle", vol: .08 }); }); }
// Trommelwirbel mit Becken am Ende
export function drumroll(sec = 2.6) {
  if (!ok()) return; const t = ac.currentTime;
  for (let x = 0; x < sec; x += .045) noise(t + x, .06, .05 + .3 * (x / sec), 900 + Math.random() * 300, 1.2);
  noise(t + sec, 1.6, .5, 6000, .3); tone(70, t + sec, .5, { vol: .5, f2: 45 });
}
// Siegerfanfare
export function fanfare() {
  if (!ok()) return; const t = ac.currentTime + .05;
  const seq = [[392, 0, .16], [523, .17, .16], [659, .34, .16], [784, .51, .5], [659, 1.02, .16], [784, 1.19, 1.8]];
  seq.forEach(([f, d, l]) => { tone(f, t + d, l, { type: "sawtooth", vol: .16, lp: 2800, attack: .02 }); tone(f / 2, t + d, l, { type: "square", vol: .05, lp: 1200 }); });
  [523, 659, 784, 1046].forEach(f => tone(f, t + 1.19, 1.8, { type: "sawtooth", vol: .06, lp: 2400, attack: .05 }));
  noise(t + 1.19, 1.4, .3, 7000, .3);
}

// Konfetti über den ganzen Bildschirm
export function confetti(ms = 7000) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = document.createElement("canvas"), x = c.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1);
  c.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:80";
  document.body.appendChild(c);
  const W = () => c.width = innerWidth * dpr, H = () => c.height = innerHeight * dpr; W(); H();
  const cols = ["#ffc23a", "#ff8a00", "#ffffff", "#3d7bff", "#ff4f4f", "#61e59a", "#ffe39a"];
  const N = Math.round(Math.min(320, innerWidth / 4));
  const ps = Array.from({ length: N }, (_, i) => ({ x: Math.random() * c.width, y: -Math.random() * c.height * .8, vx: (Math.random() - .5) * 3 * dpr, vy: (2 + Math.random() * 3) * dpr, r: Math.random() * 6, vr: (Math.random() - .5) * .3, w: (6 + Math.random() * 8) * dpr, h: (4 + Math.random() * 6) * dpr, c: cols[i % cols.length], s: Math.random() * 6 }));
  const t0 = performance.now();
  (function frame(now) {
    const el = now - t0; x.clearRect(0, 0, c.width, c.height);
    for (const p of ps) {
      p.x += p.vx + Math.sin((el / 400) + p.s) * dpr; p.y += p.vy; p.r += p.vr;
      if (p.y > c.height && el < ms - 1500) { p.y = -20; p.x = Math.random() * c.width; }
      x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.scale(1, Math.cos(el / 200 + p.s)); x.fillStyle = p.c; x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); x.restore();
    }
    if (el < ms) requestAnimationFrame(frame); else c.remove();
  })(t0);
}

// ---------- Pausenmusik: leiser Quizshow-Loop während der Antwortzeit ----------
let mOn = localStorage.getItem("pq-music") !== "0", mVol = +(localStorage.getItem("pq-mvol") || .5);
let mGain = null, mTimer = null, mNext = 0, mStep = 0, mPlaying = false, mTension = false, mStopAt = 0;
export const musicOn = () => mOn;
export const musicVol = () => mVol;
export function setMusic(v) { mOn = v; try { localStorage.setItem("pq-music", v ? "1" : "0"); } catch {} if (!v) musicStop(); }
export function setMusicVol(v) { mVol = v; try { localStorage.setItem("pq-mvol", String(v)); } catch {} if (mGain && mPlaying) mGain.gain.setTargetAtTime(v * .55, ac.currentTime, .1); }
const BPM = 108, E8 = 60 / BPM / 2;
// Am | F | Dm | E  (Bass-Grundton, Akkordtöne)
const PROG = [[110, [220, 261.6, 329.6]], [87.31, [174.6, 220, 261.6]], [73.42, [146.8, 174.6, 220]], [82.41, [164.8, 207.7, 246.9]]];
function mt(f, t, dur, type, vol, lp) {
  const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  let n = o; if (lp) { const fl = ac.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = lp; o.connect(fl); n = fl; }
  n.connect(g).connect(mGain); o.start(t); o.stop(t + dur + .05);
}
function mh(t, vol, dur = .035) {
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = nbuf; s.loop = true; s.loopStart = Math.random() * .5; f.type = "highpass"; f.frequency.value = 7000;
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .003); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(f).connect(g).connect(mGain); s.start(t, Math.random() * .5); s.stop(t + dur + .02);
}
function rnd(n) { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); }
function beat(step, t) {
  const e = step % 8, bar = Math.floor(step / 8), [root, ch] = PROG[bar % 4];
  if (e === 0 || e === 3 || e === 6) mt(root, t, E8 * 2.2, "triangle", .32, 700);          // Bass im Tresillo-Rhythmus
  if (e === 2 || e === 6) ch.forEach(f => mt(f, t, .13, "square", .028, 1500));            // kurze Akkord-Stöße
  mh(t, e % 2 ? .035 : .018);                                                               // Hi-Hat
  if (mTension) mh(t + E8 / 2, .02);                                                         // letzte Minute: schnelleres Ticken
  if ([1, 4, 5, 7].includes(e) && rnd(step) > .45) mt(ch[Math.floor(rnd(step + 99) * 3)] * 2, t, .28, "triangle", .05);  // Glöckchen-Melodie
  if (mTension && e % 2 === 0) mt(ch[2] * 4, t, .06, "sine", .025);                          // Spannungs-Puls
}
function musicStart() {
  if (mPlaying) return;
  mGain = ac.createGain(); mGain.gain.value = .0001; mGain.connect(out);
  mGain.gain.setTargetAtTime(mVol * .55, ac.currentTime, .8);
  mPlaying = true; mStep = 0; mNext = ac.currentTime + .1; mStopAt = 0;
  mTimer = setInterval(() => { while (mNext < ac.currentTime + .3) { beat(mStep++, mNext); mNext += E8; } }, 60);
}
export function musicStop(fade = .8) {
  if (!mPlaying) return;
  mPlaying = false; const g = mGain, tm = mTimer;
  try { g.gain.setTargetAtTime(.0001, ac.currentTime, fade / 3); } catch {}
  setTimeout(() => { clearInterval(tm); try { g.disconnect(); } catch {} }, fade * 1000 + 400);
}
// Wird laufend mit der Restzeit aufgerufen: startet, steigert in der letzten Minute, blendet vor dem Countdown aus
export function musicUpdate(left, hold = false) {
  const can = mOn && ac && ac.state === "running";
  if (!can || hold || left <= 12000) { musicStop(left <= 12000 ? 2.5 : .8); return; }
  mTension = left < 60000;
  musicStart();
}
export const musicPlaying = () => mPlaying;
