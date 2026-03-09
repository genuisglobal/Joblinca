import fs from 'node:fs';
import path from 'node:path';

const inputPath = process.argv[2] || 'reports/phase1-uat-report.json';

if (!fs.existsSync(inputPath)) {
  console.error(`Report file not found: ${inputPath}`);
  process.exit(1);
}

const raw = fs.readFileSync(inputPath, 'utf8');
const report = JSON.parse(raw);
const run = report.run || {};
const executions = Array.isArray(run.executions) ? run.executions : [];
const failures = Array.isArray(run.failures) ? run.failures : [];
const stats = run.stats || {};

const requestSummaries = executions.map((execution) => {
  const requestName = execution.item?.name || execution.request?.url?.raw || 'Unknown request';
  const statusCode = execution.response?.code ?? null;
  const assertions = Array.isArray(execution.assertions) ? execution.assertions : [];
  const assertionErrors = assertions
    .filter((assertion) => assertion.error)
    .map((assertion) => assertion.error.message);

  return {
    requestName,
    statusCode,
    assertionErrors,
  };
});

const lines = [];
lines.push(`Report: ${path.resolve(inputPath)}`);
lines.push(`Requests: ${stats.requests?.total ?? requestSummaries.length}`);
lines.push(`Assertions: ${stats.assertions?.total ?? 0}`);
lines.push(`Assertion failures: ${stats.assertions?.failed ?? failures.length}`);
lines.push('');

if (failures.length === 0) {
  lines.push('Result: PASS');
} else {
  lines.push('Result: FAIL');
  lines.push('');
  lines.push('Failures:');
  for (const failure of failures) {
    const source =
      failure.source?.name ||
      failure.source ||
      failure.parent?.name ||
      'Unknown request';
    lines.push(`- ${source}: ${failure.error?.message || 'Unknown error'}`);
  }
}

lines.push('');
lines.push('Request summary:');
for (const summary of requestSummaries) {
  const result = summary.assertionErrors.length === 0 ? 'PASS' : 'FAIL';
  const status = summary.statusCode === null ? 'n/a' : String(summary.statusCode);
  lines.push(`- [${result}] ${summary.requestName} (status ${status})`);
  for (const error of summary.assertionErrors) {
    lines.push(`  - ${error}`);
  }
}

console.log(lines.join('\n'));
