import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseArgs, runEvaluator } from '../src/scripts/evaluate.js';
import { validateKitStructure } from '../src/services/llm/llmPipelineService.js';

describe('Trao Batch Evaluator - CLI Argument Parsing', () => {
  it('parses standard space-separated flags correctly', () => {
    const args = ['--input', 'cases.json', '--output', 'kits.json', '--provider', 'mock'];
    const parsed = parseArgs(args);

    assert.strictEqual(parsed.inputPath, 'cases.json');
    assert.strictEqual(parsed.outputPath, 'kits.json');
    assert.strictEqual(parsed.providerName, 'mock');
  });

  it('parses short flags correctly (-i, -o, -p)', () => {
    const args = ['-i', 'test-cases.json', '-o', 'out.json', '-p', 'mock'];
    const parsed = parseArgs(args);

    assert.strictEqual(parsed.inputPath, 'test-cases.json');
    assert.strictEqual(parsed.outputPath, 'out.json');
    assert.strictEqual(parsed.providerName, 'mock');
  });

  it('parses equal-sign flags correctly (--input=..., --output=...)', () => {
    const args = ['--input=data/cases.json', '--output=data/out.json'];
    const parsed = parseArgs(args);

    assert.strictEqual(parsed.inputPath, 'data/cases.json');
    assert.strictEqual(parsed.outputPath, 'data/out.json');
  });
});

describe('Trao Batch Evaluator - End-to-End Execution & Appendix B Compliance', () => {
  it('executes batch evaluation, continues after error, and formats strictly per Appendix B', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trao-eval-test-'));
    const inputPath = path.join(tempDir, 'test-cases.json');
    const outputPath = path.join(tempDir, 'test-kits.json');

    const testCases = [
      {
        id: 'eval-01',
        jd: 'Staff Backend Engineer. 5+ years with distributed systems in Node.js, Kafka, Redis, and high availability architectures.',
        company_url: 'http://localhost:3000', // Test localhost support
        days: 3
      },
      {
        id: 'eval-02-fail',
        jd: '', // Deliberately invalid to test error continuation
        company_url: 'https://example.com',
        days: 5
      },
      {
        id: 'eval-03',
        jd: 'Security Engineer. Application security, threat modeling, OAuth2, and SSRF remediation experience required.',
        company_url: '',
        days: 1 // Test 1-day rapid prep
      }
    ];

    fs.writeFileSync(inputPath, JSON.stringify(testCases), 'utf-8');

    // Run evaluator with mock provider to ensure fast, deterministic testing
    const evalResult = await runEvaluator({
      args: ['--input', inputPath, '--output', outputPath, '--provider', 'mock']
    });

    assert.strictEqual(evalResult.success, true);
    assert.strictEqual(evalResult.totalCases, 3);
    assert.strictEqual(evalResult.succeededCount, 2);
    assert.strictEqual(evalResult.failedCount, 1);

    // Verify output file exists and read content
    assert.ok(fs.existsSync(outputPath), 'Output file must exist');
    const outputRaw = fs.readFileSync(outputPath, 'utf-8');
    const output = JSON.parse(outputRaw);

    // Verify Appendix B envelope
    assert.strictEqual(output.version, '1.0', 'Must have version "1.0"');
    assert.ok(output.generated_at, 'Must have generated_at timestamp');
    assert.ok(new Date(output.generated_at).getTime() > 0, 'generated_at must be a valid ISO date');
    assert.ok(Array.isArray(output.kits), 'Must contain kits array');
    assert.strictEqual(output.kits.length, 3);

    // Case 1: Succeeded, localhost URL crawled, days respected
    const case1 = output.kits[0];
    assert.strictEqual(case1.id, 'eval-01');
    assert.strictEqual(case1.status, 'ok');
    assert.strictEqual(case1.error, null);
    assert.ok(case1.kit, 'kit object must be present');
    assert.strictEqual(case1.kit.schedule.length, 3, 'Must respect requested 3 days');
    validateKitStructure(case1.kit);

    // Case 2: Failed gracefully, error recorded, kit is null
    const case2 = output.kits[1];
    assert.strictEqual(case2.id, 'eval-02-fail');
    assert.strictEqual(case2.status, 'error');
    assert.strictEqual(case2.kit, null);
    assert.ok(typeof case2.error === 'string' && case2.error.length > 0);

    // Case 3: Succeeded, 1-day schedule allocated
    const case3 = output.kits[2];
    assert.strictEqual(case3.id, 'eval-03');
    assert.strictEqual(case3.status, 'ok');
    assert.strictEqual(case3.error, null);
    assert.ok(case3.kit);
    assert.strictEqual(case3.kit.schedule.length, 1, 'Must respect requested 1 day');
    validateKitStructure(case3.kit);

    // Cleanup temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('rejects execution gracefully when input file does not exist', async () => {
    const res = await runEvaluator({
      args: ['--input', 'non_existent_file_xyz123.json', '--output', 'out.json']
    });
    assert.strictEqual(res.success, false);
    assert.ok(res.error.includes('Input file not found'));
  });
});
