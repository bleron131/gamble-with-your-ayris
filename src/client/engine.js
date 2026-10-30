// Renderer, Kamera, Post-Processing (Bloom für Neon) und Hauptschleife.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Particles } from './world/base.js';

// Grafikstufen: Auflösung, Schattenqualität, Bloom und Partikelmenge (der Stil bleibt gleich)
export const QUALITY = {
  low: { pixelRatio: 1, shadowMap: 512, shadows: false, bloom: false, particles: 0.35, lights: 4, far: 70 },
  medium: { pixelRatio: 1.25, shadowMap: 1024, shadows: true, bloom: true, bloomRes: 0.5, particles: 0.6, lights: 6, far: 150 },
  high: { pixelRatio: 1.75, shadowMap: 2048, shadows: true, bloom: true, bloomRes: 1, particles: 1, lights: 9, far: 300 },
};

export class Engine {
  constructor(container, settings) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.quality = QUALITY[settings.quality] ? settings.quality : 'high';
    this.q = QUALITY[this.quality];
    this.fpsLimit = settings.fpsLimit || 0;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.q.pixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = settings.shadows !== false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.03, this.q.far);
    Particles.density = this.q.particles;
    this.scene = new THREE.Scene();
    this.bloomEnabled = settings.bloom !== false;
    this.setupComposer();
    this.resize();
    // Umgebungs-Map, damit Gold & Metall realistisch spiegeln
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.clock = new THREE.Clock();
    this.callbacks = [];
    this.shake = 0;
    window.addEventListener('resize', () => this.resize());
  }

  setupComposer() {
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.38, 0.4, 0.95);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setScene(scene) {
    this.scene = scene;
    scene.environment = this.envMap;
    scene.environmentIntensity = scene.userData.envIntensity ?? 0.35;
    this.renderPass.scene = scene;
  }

  // Grafikstufe + FPS-Limit übernehmen (Einstellungen → Grafik). Neue Lichter/Schatten-Auflösung gelten ab dem nächsten Raum.
  applyQuality(settings) {
    const level = QUALITY[settings.quality] ? settings.quality : 'high';
    this.quality = level;
    this.q = QUALITY[level];
    this.fpsLimit = settings.fpsLimit || 0;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.q.pixelRatio));
    this.camera.far = this.q.far;
    this.camera.updateProjectionMatrix();
    Particles.density = this.q.particles;
    this.resize();
    this.setQuality({ bloom: settings.bloom, shadows: settings.shadows });
  }

  setQuality({ bloom, shadows }) {
    if (bloom !== undefined) this.bloomEnabled = bloom;
    if (shadows !== undefined) {
      this.renderer.shadowMap.enabled = shadows;
      this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    // Bloom auf Mittel in halber Auflösung (spart auf Handys viel Leistung)
    const br = this.q?.bloomRes ?? 1;
    this.bloom.setSize(Math.round(w * this.renderer.getPixelRatio() * br), Math.round(h * this.renderer.getPixelRatio() * br));
  }

  onTick(fn) { this.callbacks.push(fn); }

  start() {
    let last = 0;
    const loop = (now = performance.now()) => {
      requestAnimationFrame(loop);
      // FPS-Limit (z. B. 30 FPS auf Handys für weniger Wärme und Akkuverbrauch)
      if (this.fpsLimit && now - last < 1000 / this.fpsLimit - 2) return;
      last = now;
      const dt = Math.min(0.05, this.clock.getDelta());
      const t = this.clock.elapsedTime;
      for (const fn of this.callbacks) fn(dt, t);
      // Screen Shake
      let ox = 0, oy = 0;
      if (this.shake > 0) {
        this.shake = Math.max(0, this.shake - dt * 1.5);
        ox = (Math.random() - 0.5) * this.shake * 0.25;
        oy = (Math.random() - 0.5) * this.shake * 0.25;
        this.camera.position.x += ox; this.camera.position.y += oy;
      }
      if (this.bloomEnabled) this.composer.render(dt);
      else this.renderer.render(this.scene, this.camera);
      if (ox || oy) { this.camera.position.x -= ox; this.camera.position.y -= oy; }
    };
    loop();
  }
}
