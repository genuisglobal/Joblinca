/**
 * WCAG contrast checks for the dark-theme tokens in app/globals.css (:root).
 * Text pairs need 4.5:1 (AA body text); control boundaries and focus rings
 * need 3:1 (WCAG 1.4.11). Add a pair here when a new token combination is
 * used in components/ui.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');
const tokens = {};
for (const match of css.matchAll(/--([a-z-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)) {
  tokens[match[1]] = [Number(match[2]), Number(match[3]), Number(match[4])];
}
tokens.white = [255, 255, 255];

function luminance([r, g, b]) {
  const channel = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(tokens[a]), luminance(tokens[b])].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const BACKGROUNDS = ['surface', 'surface-raised', 'surface-overlay'];
const TEXT = ['fg', 'fg-muted', 'fg-subtle', 'danger-fg', 'success-fg', 'warning-fg'];

let checked = 0;
for (const name of [...BACKGROUNDS, ...TEXT, 'line-strong', 'focus', 'danger']) {
  assert.ok(tokens[name], `token --${name} missing from app/globals.css`);
}

for (const bg of BACKGROUNDS) {
  for (const fg of TEXT) {
    const ratio = contrast(fg, bg);
    assert.ok(ratio >= 4.5, `--${fg} on --${bg} is ${ratio.toFixed(2)}:1 (needs 4.5:1)`);
    checked++;
  }
  for (const ui of ['line-strong', 'focus']) {
    const ratio = contrast(ui, bg);
    assert.ok(ratio >= 3, `--${ui} on --${bg} is ${ratio.toFixed(2)}:1 (needs 3:1)`);
    checked++;
  }
}

// Filled buttons with white text (components/ui/Button.tsx).
const dangerButton = contrast('white', 'danger');
assert.ok(dangerButton >= 4.5, `white on --danger is ${dangerButton.toFixed(2)}:1`);
checked++;

console.log(`ok - ${checked} token contrast pairs meet WCAG AA`);
