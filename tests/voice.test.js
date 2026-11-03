// Prompt 13: keine gesprochenen Ergebnisansagen (kein Text-to-Speech) in irgendeinem Casino-Spiel
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = dir => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : p.endsWith('.js') ? [p] : []; });

test('Kein Text-to-Speech im Spiel (nur visuelle Ergebnisse + Soundeffekte)', () => {
  for (const f of files('src')) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/SpeechSynthesisUtterance|speechSynthesis\.speak|\.speak\(/.test(src), `Sprachausgabe in ${f}`);
    assert.ok(!/\bsay\(/.test(src.replace(/c\.say|\.say\./g, '')), `say() in ${f}`);
  }
});
