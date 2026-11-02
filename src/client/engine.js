// Renderer, Kamera, Post-Processing (Bloom für Neon) und Hauptschleife – mit adaptiver Qualität für Handys.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Particles } from './world/base.js';

// Qualitätsstufen für Handys & Tablets. prMin/prMax = Bereich der dynamischen Render-Auflösung (Pixel Ratio),
// msaa = Kantenglättung im Post-Processing, lod = ab dieser Entfernung werden kleine Details ausgeblendet.
export const QUALITY = {
  low: { prMin: 0.75, prMax: 1.25, shadowMap: 512, shadows: false, bloom: false, bloomRes: 0.5, msaa: 0, particles: 0.35, maxParticles: 60, lights: 4, far: 70, aniso: 2, lod: 10, shadowEvery: 2 },
  medium: { prMin: 1, prMax: 1.75, shadowMap: 1024, shadows: true, bloom: true, bloomRes: 0.5, msaa: 2, particles: 0.6, maxParticles: 140, lights: 6, far: 150, aniso: 4, lod: 16, shadowEvery: 2 },
  high: { prMin: 1.25, prMax: 2.25, shadowMap: 1024, shadows: true, bloom: true, bloomRes: 0.5, msaa: 4, particles: 0.85, maxParticles: 240, lights: 9, far: 300, aniso: 8, lod: 24, shadowEvery: 1 },
  ultra: { prMin: 1.5, prMax: 3, shadowMap: 2048, shadows: true, bloom: true, bloomRes: 0.75, msaa: 4, particles: 1, maxParticles: 400, lights: 9, far: 300, aniso: 16, lod: 0, shadowEvery: 1 },
};
// PC: die bewährte Desktop-Grafik (feste Auflösung, volle Schatten, voller Bloom) – unverändert hochwertig
const PC_HIGH = { prMin: 1.75, prMax: 1.75, shadowMap: 2048, shadows: true, bloom: true, bloomRes: 1, msaa: 4, particles: 1, maxParticles: 600, lights: 9, far: 300, aniso: 8, lod: 0, shadowEvery: 1 };
export const TIERS = ['low', 'medium', 'high', 'ultra'];
export const TIER_NAMES = { low: 'Niedrig', medium: 'Mittel', high: 'Hoch', ultra: 'Ultra' };

// Erste Einschätzung der Geräteleistung (danach entscheidet die gemessene Bildrate)
export function estimateTier(renderer) {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  let gpu = '';
  try { const gl = renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''; } catch { /* unbekannt */ }
  if (mem <= 3 || cores <= 4) return 'low';
  if (/Mali-(G(31|51|52|57|68)|T)|Adreno \(TM\) [3-5]\d\d|PowerVR|Adreno \(TM\) 6[0-1]\d/i.test(gpu)) return 'medium';
  if (mem >= 8 && cores >= 8 && /Adreno \(TM\) (7[3-9]\d|8\d\d)|Apple GPU|Mali-G7[1-9]\d|Immortalis|Xclipse/i.test(gpu)) return 'ultra';
  return cores >= 8 ? 'high' : 'medium';
}

export class Engine {
  constructor(container, settings) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.info.autoReset = false; // Statistik pro Frame (inkl. Schatten- und Bloom-Pässe)
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.03, 300);
    this.scene = new THREE.Scene();
    this.mobile = false;
    this.autoTier = estimateTier(this.renderer);
    this.stats = { fps: 60, ms: 16.7, minFps: 60 };
    this.applyQuality(settings);
    // Umgebungs-Map, damit Gold & Metall auch ohne teure Echtzeit-Spiegelungen glänzen
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.clock = new THREE.Clock();
    this.callbacks = [];
    this.shake = 0;
    this.frame = 0;
    window.addEventListener('resize', () => this.resize());
  }

  // Post-Processing mit Multisampling (sonst gehen im Bloom-Pfad alle geglätteten Kanten verloren)
  setupComposer(samples) {
    this.composer?.dispose?.();
    const rt = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType, samples });
    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.38, 0.4, 0.95);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.msaa = samples;
  }

  setScene(scene) {
    this.scene = scene;
    scene.environment = this.envMap;
    scene.environmentIntensity = scene.userData.envIntensity ?? 0.35;
    this.renderPass.scene = scene;
  }

  setMobile(on) { this.mobile = on; if (this.settings) this.applyQuality(this.settings); }

  // Grafikstufe + FPS-Limit übernehmen. Lichter- und Schattenauflösung gelten ab dem nächsten Raum vollständig.
  applyQuality(settings) {
    this.settings = settings;
    const pref = settings.quality;
    const level = pref === 'auto' || !QUALITY[pref] ? (this.mobile ? this.autoTier : 'high') : pref;
    this.quality = level;
    this.dynamic = this.mobile; // dynamische Auflösung nur auf Handys/Tablets
    this.q = !this.mobile && level === 'high' ? PC_HIGH : QUALITY[level];
    const dpr = window.devicePixelRatio || 1;
    this.prCap = Math.min(dpr, this.q.prMax);
    this.prMin = Math.min(this.prCap, this.q.prMin);
    // Startwert: eher scharf; sinkt automatisch, wenn die Bildrate einbricht
    if (!this.dynamic || !this.pr || this.pr > this.prCap || this.pr < this.prMin) this.pr = this.dynamic ? Math.max(this.prMin, Math.min(this.prCap, this.prMin + (this.prCap - this.prMin) * 0.7)) : this.prCap;
    this.renderer.setPixelRatio(this.pr);
    this.fpsMode = settings.fpsLimit ?? 0; // 0 = unbegrenzt, 30, 60 oder 'auto'
    if (this.fpsMode !== 'auto') this.autoFps = null;
    this.renderer.shadowMap.type = this.mobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = !this.mobile;
    this.camera.far = this.q.far;
    this.camera.updateProjectionMatrix();
    Particles.density = this.q.particles;
    Particles.max = this.q.maxParticles;
    if (this.msaa !== this.q.msaa || !this.composer) this.setupComposer(this.q.msaa);
    this.renderPass.scene = this.scene;
    this.resize();
    this.setQuality({ bloom: settings.bloom !== false && this.q.bloom, shadows: settings.shadows !== false && this.q.shadows });
    if (this.scene) this.tuneScene(this.scene);
  }

  get fpsTarget() {
    if (this.fpsMode === 'auto') return this.autoFps || 60;
    return this.fpsMode || (this.mobile ? 60 : 0);
  }

  setQuality({ bloom, shadows }) {
    if (bloom !== undefined) this.bloomEnabled = bloom;
    if (shadows !== undefined && this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      this.scene.traverse(o => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
    }
  }

  // Texturfilterung und Schatten an die Stufe anpassen (nach jedem Raumwechsel)
  tuneScene(scene) {
    const aniso = Math.min(this.renderer.capabilities.getMaxAnisotropy(), this.q.aniso);
    const seen = new Set();
    scene.traverse(o => {
      if (!o.isMesh && !o.isSprite) return;
      for (const m of [].concat(o.material)) {
        if (!m || seen.has(m)) continue;
        seen.add(m);
        for (const k of ['map', 'emissiveMap']) {
          const t = m[k];
          if (t && t.anisotropy !== aniso && !t.isRenderTargetTexture) { t.anisotropy = aniso; t.needsUpdate = true; }
        }
      }
      // Handy: kleine Objekte werfen keine Schatten (kaum sichtbar, aber teuer)
      if (this.mobile && o.isMesh && o.castShadow && !o.userData.bigShadow) {
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        const s = o.getWorldScale(new THREE.Vector3());
        if (o.geometry.boundingSphere.radius * Math.max(s.x, s.y, s.z) < 0.35) o.castShadow = false;
      }
    });
  }

  setPixelRatio(pr) {
    if (Math.abs(pr - this.renderer.getPixelRatio()) < 0.01) return;
    this.pr = pr;
    this.renderer.setPixelRatio(pr);
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    // Bloom in reduzierter Auflösung (auf Handys halbe Auflösung – Neon bleibt, kostet aber viel weniger)
    const br = this.q?.bloomRes ?? 1;
    this.bloom.setSize(Math.round(w * pr * br), Math.round(h * pr * br));
  }

  onTick(fn) { this.callbacks.push(fn); }

  // Dynamische Auflösung & automatische Qualität: geglättete Bildrate, Abkühlzeiten, feste Grenzen.
  // Lieber stabile 45–60 FPS als ständige Sprünge.
  adapt(now) {
    const s = this.stats;
    if (!this.dynamic || now - (this.lastCheck || 0) < 1000) return;
    this.lastCheck = now;
    const target = this.fpsTarget || 60;
    const fps = s.fps;
    if (fps < target * 0.88 && now - (this.lastChange || 0) > 1500) {
      const next = Math.max(this.prMin, this.pr * 0.87);
      if (next < this.pr - 0.01) { this.setPixelRatio(next); this.lastChange = now; }
      this.good = 0;
    } else if (fps > target * 0.96) {
      this.good = (this.good || 0) + 1;
      if (this.good >= 4 && this.pr < this.prCap - 0.01 && now - (this.lastChange || 0) > 3000) {
        this.setPixelRatio(Math.min(this.prCap, this.pr * 1.07));
        this.lastChange = now; this.good = 0;
      }
    } else this.good = 0;
    // Schon minimale Auflösung und trotzdem zu langsam (z. B. Gerät wird nach Minuten warm):
    // bei FPS AUTO auf stabile 30 FPS wechseln, bei Grafik AUTO vorsichtig eine Stufe tiefer.
    const atMin = this.pr <= this.prMin + 0.01;
    this.slow = atMin && fps < target * 0.8 ? (this.slow || 0) + 1 : 0;
    if (this.slow >= 6 && now - (this.lastTier || 0) > 20000) {
      this.lastTier = now; this.slow = 0;
      if (this.fpsMode === 'auto' && target > 30 && fps < 48) { this.autoFps = 30; this.onAdapt?.('fps'); }
      else if (this.settings.quality === 'auto' && TIERS.indexOf(this.autoTier) > 0) {
        this.autoTier = TIERS[TIERS.indexOf(this.autoTier) - 1];
        this.pr = 0;
        this.applyQuality(this.settings);
        this.onAdapt?.('tier');
      }
    }
  }

  start() {
    let last = 0, prev = performance.now(), ema = 16.7, low = 60, lowT = 0;
    const loop = (now = performance.now()) => {
      requestAnimationFrame(loop);
      // FPS-Limit (30/60 auf Handys für weniger Wärme und Akkuverbrauch)
      const target = this.fpsTarget;
      if (target && target < 58 && now - last < 1000 / target - 2) return;
      last = now;
      const frameMs = now - prev; prev = now;
      if (frameMs < 250) ema += (frameMs - ema) * 0.08; // Ausreisser (Tab-Wechsel) ignorieren
      this.stats.ms = ema;
      this.stats.fps = 1000 / ema;
      // niedrigste FPS der letzten Sekunden (für den Monitor)
      low = Math.min(low, 1000 / Math.max(1, frameMs));
      if (now - lowT > 3000) { this.stats.minFps = low; low = 60; lowT = now; }
      const dt = Math.min(0.05, this.clock.getDelta());
      const t = this.clock.elapsedTime;
      for (const fn of this.callbacks) fn(dt, t);
      // Schatten auf schwächeren Handys nur jedes zweite Bild neu berechnen
      this.frame++;
      if (this.mobile && this.renderer.shadowMap.enabled) this.renderer.shadowMap.needsUpdate = this.frame % (this.q.shadowEvery || 1) === 0;
      // Screen Shake
      let ox = 0, oy = 0;
      if (this.shake > 0) {
        this.shake = Math.max(0, this.shake - dt * 1.5);
        ox = (Math.random() - 0.5) * this.shake * 0.25;
        oy = (Math.random() - 0.5) * this.shake * 0.25;
        this.camera.position.x += ox; this.camera.position.y += oy;
      }
      this.renderer.info.reset();
      if (this.bloomEnabled) this.composer.render(dt);
      else this.renderer.render(this.scene, this.camera);
      if (ox || oy) { this.camera.position.x -= ox; this.camera.position.y -= oy; }
      this.adapt(now);
    };
    loop();
  }
}
