/**
 * Load a TypeScript module for tests without a build step: transpile with the
 * project's typescript, resolve `@/...` and relative imports to source files
 * recursively, and substitute stubs for anything with side effects (Supabase,
 * network, env-bound singletons).
 *
 *   const tools = loadTs('lib/whatsapp-agent/agent/tools.ts', {
 *     '@/lib/subscriptions': { getUserSubscription: async () => ({ isActive: false }) },
 *   });
 *
 * Stub keys are import specifiers exactly as written in source ('@/lib/x' or
 * './search'), or resolved repo-relative paths without extension.
 */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const ROOT = process.cwd();

function resolveFile(fromDir, specifier) {
  const base = specifier.startsWith('@/')
    ? path.join(ROOT, specifier.slice(2))
    : path.resolve(fromDir, specifier);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), base]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`load-ts: cannot resolve ${specifier} from ${fromDir}`);
}

function repoKey(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/').replace(/\.(ts|tsx)$/, '');
}

function loadTs(relativePath, stubs = {}) {
  const cache = new Map();

  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const source = fs.readFileSync(file, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
        jsx: ts.JsxEmit.React,
      },
    }).outputText;
    const dir = path.dirname(file);
    const localRequire = (specifier) => {
      if (specifier in stubs) return stubs[specifier];
      if (specifier.startsWith('@/') || specifier.startsWith('.')) {
        const resolved = resolveFile(dir, specifier);
        const key = repoKey(resolved);
        if (key in stubs) return stubs[key];
        return load(resolved);
      }
      return require(specifier);
    };
    new Function('require', 'module', 'exports', output)(localRequire, module, module.exports);
    return module.exports;
  }

  return load(path.join(ROOT, relativePath));
}

/** Supabase service client stub for modules that create one at import time. */
const serviceClientStub = {
  createServiceSupabaseClient: () => ({
    from: () => {
      throw new Error('test touched the real database client');
    },
    rpc: () => {
      throw new Error('test touched the real database client');
    },
  }),
};

module.exports = { loadTs, serviceClientStub };
