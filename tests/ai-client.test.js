const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { z } = require('zod');

function loadTsModule(relativePath) {
  const filePath = path.join(process.cwd(), relativePath);
  const source = fs.readFileSync(filePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText;

  const module = { exports: {} };
  const fn = new Function('require', 'module', 'exports', transpiled);
  fn(require, module, module.exports);
  return module.exports;
}

async function run() {
  const previousKey = process.env.OPENAI_API_KEY;
  const originalFetch = global.fetch;
  process.env.OPENAI_API_KEY = 'test-key';

  try {
    const aiClient = loadTsModule(path.join('lib', 'ai', 'client.ts'));

    let textCalls = 0;
    global.fetch = async () => {
      textCalls += 1;
      if (textCalls === 1) {
        const error = new Error('network timeout');
        error.name = 'AbortError';
        throw error;
      }

      return {
        ok: true,
        json: async () => ({
          model: 'gpt-4o-mini',
          usage: { total_tokens: 12 },
          choices: [{ message: { content: 'Professional response' } }],
        }),
      };
    };

    const textResult = await aiClient.callAiText({
      messages: [{ role: 'user', content: 'hello' }],
      retryCount: 1,
      timeoutMs: 100,
    });

    assert.equal(textCalls, 2);
    assert.equal(textResult.text, 'Professional response');
    console.log('ok - callAiText retries once on transient failure');

    let jsonCalls = 0;
    global.fetch = async () => {
      jsonCalls += 1;
      return {
        ok: true,
        json: async () => ({
          model: 'gpt-4o-mini',
          usage: { total_tokens: 20 },
          choices: [
            {
              message: {
                content:
                  jsonCalls === 1
                    ? '{"recommendation":'
                    : '{"recommendation":"review"}',
              },
            },
          ],
        }),
      };
    };

    const jsonResult = await aiClient.callAiJson({
      messages: [{ role: 'user', content: 'json' }],
      schema: z.object({ recommendation: z.string() }),
      retryCount: 1,
      timeoutMs: 100,
    });

    assert.equal(jsonCalls, 2);
    assert.equal(jsonResult.parsed.recommendation, 'review');
    console.log('ok - callAiJson retries once on invalid JSON');
  } finally {
    if (typeof previousKey === 'undefined') {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousKey;
    }
    global.fetch = originalFetch;
  }
}

run()
  .then(() => console.log('All AI client tests passed.'))
  .catch((error) => {
    console.error('Test failure:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
