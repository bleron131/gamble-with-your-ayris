// Static Batching: unbewegliche Teile eines Objekts werden je Material zu EINEM Mesh zusammengefasst.
// Gleiches Aussehen, aber deutlich weniger Draw Calls (wichtig für Handys und grosse Stockwerke).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Alle Object3D, auf die ein Objekt per Eigenschaft verweist (die werden animiert/verändert und bleiben einzeln)
export function referencedObjects(obj, extra = []) {
  const keep = new Set(extra);
  const add = v => {
    if (!v || typeof v !== 'object') return;
    if (v.isObject3D) { keep.add(v); return; }
    // Hilfsobjekte mit eigenem 3D-Teil (Charaktere, Textschilder …)
    for (const k of ['root', 'sprite', 'group', 'mesh']) if (v[k]?.isObject3D) keep.add(v[k]);
  };
  for (const v of Object.values(obj)) {
    add(v);
    if (Array.isArray(v)) for (const e of v) { add(e); if (e && typeof e === 'object' && !e.isObject3D) for (const x of Object.values(e)) add(x); }
    else if (v && typeof v === 'object' && !v.isObject3D && v.constructor === Object) for (const x of Object.values(v)) add(x);
  }
  return keep;
}

function normalize(g) {
  // Gleiche Attribute für alle Teile: Position, Normale, UV
  const out = new THREE.BufferGeometry();
  const src = g.index ? g.toNonIndexed() : g;
  out.setAttribute('position', src.attributes.position);
  out.setAttribute('normal', src.attributes.normal || (src.computeVertexNormals(), src.attributes.normal));
  out.setAttribute('uv', src.attributes.uv || new THREE.BufferAttribute(new Float32Array(src.attributes.position.count * 2), 2));
  return out;
}

// Ein Objekt (Tisch, Automat …) samt seiner animierten Untergruppen (z. B. Roulette-Rotor) zusammenfassen.
// Charaktere werden übersprungen – die fassen ihre Körperteile selbst zusammen.
export function bakeView(view) {
  const keep = referencedObjects(view);
  let n = bakeStatic(view.group, { keep });
  for (const o of keep) if (o.isGroup && !o.userData.character && o !== view.group) n += bakeStatic(o, { keep });
  return n;
}

// root: Gruppe, deren statische Nachfahren zusammengefasst werden. keep: Objekte (samt Kindern), die einzeln bleiben.
export function bakeStatic(root, { keep = new Set(), deep = true, allowTransparent = true } = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const visit = o => {
    for (const c of o.children) {
      if (keep.has(c) || c.userData.noBake) continue;
      if (c.isMesh) {
        const m = c.material;
        // Transparente Teile nur innerhalb derselben Deko zusammenfassen (Reihenfolge untereinander ist dort egal)
        const ok = !Array.isArray(m) && (!m.transparent || allowTransparent) && c.visible && !c.children.length && !c.isInstancedMesh && !c.isSkinnedMesh && c.geometry?.attributes?.position && !c.morphTargetInfluences;
        if (ok) {
          const key = `${m.uuid}|${c.castShadow}|${c.receiveShadow}|${c.renderOrder}`;
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key).push(c);
        }
      } else if (deep && (c.isGroup || c.type === 'Object3D') && c.visible) visit(c);
    }
  };
  visit(root);
  let removed = 0;
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const geos = list.map(c => {
      const g = normalize(c.geometry);
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld));
      return g;
    });
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const m = new THREE.Mesh(merged, list[0].material);
    m.castShadow = list[0].castShadow;
    m.receiveShadow = list[0].receiveShadow;
    m.renderOrder = list[0].renderOrder;
    m.userData.baked = true;
    root.add(m);
    for (const c of list) { c.removeFromParent(); if (!c.geometry.userData?.shared) c.geometry.dispose(); }
    removed += list.length - 1;
  }
  return removed;
}
