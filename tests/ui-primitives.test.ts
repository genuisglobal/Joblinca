/**
 * Server-render the UI primitives and check their accessibility wiring.
 * (Dialog needs a browser; it is covered by tests/e2e/dialog.e2e.mjs.)
 */
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// tsx compiles the components' JSX with the classic runtime (React.createElement),
// which Next.js does not need; provide the global before loading them.
(globalThis as any).React = React;
const h = React.createElement as any;

function test(name: string, fn: () => void) {
  fn();
  console.log(`ok - ${name}`);
}

async function main() {
const { Button, ButtonLink, buttonClasses } = await import('../components/ui/Button');
const { default: Badge } = await import('../components/ui/Badge');
const { default: EmptyState } = await import('../components/ui/EmptyState');
const { default: Field, fieldInputClasses } = await import('../components/ui/Field');
const { default: Skeleton } = await import('../components/ui/Skeleton');

test('Button defaults to type="button" and a 44px touch target', () => {
  const html = renderToStaticMarkup(h(Button, null, 'Save'));
  assert.match(html, /type="button"/);
  assert.match(html, /min-h-11/);
});

test('Button loading state disables it and sets aria-busy', () => {
  const html = renderToStaticMarkup(h(Button, { loading: true }, 'Pay'));
  assert.match(html, /disabled=""/);
  assert.match(html, /aria-busy="true"/);
});

test('Button variants and sizes map to distinct classes', () => {
  assert.notEqual(buttonClasses({ variant: 'primary' }), buttonClasses({ variant: 'danger' }));
  assert.match(buttonClasses({ size: 'lg', fullWidth: true }), /min-h-12.*w-full/);
  assert.match(buttonClasses(), /focus-visible:ring-focus/);
});

test('ButtonLink: internal renders a plain link; external opens safely', () => {
  const internal = renderToStaticMarkup(h(ButtonLink, { href: '/en/jobs' }, 'Jobs'));
  assert.match(internal, /<a [^>]*href="\/en\/jobs"/);
  assert.doesNotMatch(internal, /target=/);
  const external = renderToStaticMarkup(h(ButtonLink, { href: 'https://example.com', external: true }, 'Apply'));
  assert.match(external, /target="_blank"/);
  assert.match(external, /rel="noopener noreferrer"/);
});

test('Field wires label, hint and error to the control', () => {
  const withHint = renderToStaticMarkup(
    h(Field, { label: 'Email', hint: 'We never share it', required: true, children: (p: any) => h('input', p) })
  );
  const id = /<label for="([^"]+)"/.exec(withHint)?.[1];
  assert.ok(id, 'label has a for attribute');
  assert.match(withHint, new RegExp(`<input id="${id}" aria-describedby="${id}-hint" aria-required="true"`));

  const withError = renderToStaticMarkup(
    h(Field, { label: 'Email', hint: 'x', error: 'Required', children: (p: any) => h('input', p) })
  );
  assert.match(withError, /aria-invalid="true"/);
  assert.match(withError, /role="alert"[^>]*>Required</);
  assert.doesNotMatch(withError, /-hint"/, 'hint hidden while an error shows');
});

test('Field inputs use 16px text on phones', () => {
  assert.match(fieldInputClasses, /\btext-base\b/);
});

test('Badge always renders its text label', () => {
  const html = renderToStaticMarkup(h(Badge, { tone: 'success' }, 'Verified'));
  assert.match(html, />Verified</);
});

test('EmptyState renders a heading and the optional action', () => {
  const html = renderToStaticMarkup(
    h(EmptyState, { title: 'No jobs yet', description: 'Try another search', action: h('a', { href: '/jobs' }, 'Clear') })
  );
  assert.match(html, /<h3[^>]*>No jobs yet<\/h3>/);
  assert.match(html, /href="\/jobs"/);
});

test('Skeleton is hidden from screen readers', () => {
  assert.match(renderToStaticMarkup(h(Skeleton, { className: 'h-4' })), /aria-hidden="true"/);
});

console.log('All UI primitive tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
