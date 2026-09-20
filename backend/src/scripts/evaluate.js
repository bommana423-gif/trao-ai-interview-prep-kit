#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Trao AI Interview Prep Kit - Mandatory Batch Evaluator Entry Point
 * 
 * Command Syntax:
 * npm run evaluate -- --input <cases.json> --output <kits.json>
 * 
 * Input:
 * Array of test case specifications:
 * [
 *   {
 *     "id": "case-01",
 *     "jd": "...",
 *     "company_url": "...",
 *     "days": 5
 *   }
 * ]
 * 
 * Output (Appendix B Compliance):
 * {
 *   "version": "1.0",
 *   "generated_at": "2026-09-20T08:00:00.000Z",
 *   "kits": [
 *     {
 *       "id": "case-01",
 *       "status": "ok",
 *       "kit": { ... },
 *       "error": null
 *     },
 *     {
 *       "id": "case-02",
 *       "status": "error",
 *       "kit": null,
 *       "error": "..."
 *     }
 *   ]
 * }
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { generateCompleteKit } from '../services/llm/llmPipelineService.js';

// 1. Load Environment Variables from current directory and backend directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendEnvPath = path.resolve(__dirname, '../../.env');
const rootEnvPath = path.resolve(__dirname, '../../../.env');

if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath });
}
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}
// Also load default .env in cwd if present
dotenv.config();

/**
 * Parse CLI Arguments
 * Handles: --input <file>, -i <file>, --input=<file>, --output <file>, -o <file>, --output=<file>
 */
export function parseArgs(args) {
  let inputPath = null;
  let outputPath = null;
  let providerName = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--input' || arg === '-i') {
      inputPath = args[++i];
    } else if (arg.startsWith('--input=')) {
      inputPath = arg.split('=')[1];
    } else if (arg === '--output' || arg === '-o') {
      outputPath = args[++i];
    } else if (arg.startsWith('--output=')) {
      outputPath = arg.split('=')[1];
    } else if (arg === '--provider' || arg === '-p') {
      providerName = args[++i];
    } else if (arg.startsWith('--provider=')) {
      providerName = arg.split('=')[1];
    }
  }

  return { inputPath, outputPath, providerName };
}

/**
 * Main Evaluator Execution Function
 */
export async function runEvaluator(options = {}) {
  const args = options.args || process.argv.slice(2);
  const { inputPath, outputPath, providerName: argProvider } = parseArgs(args);

  if (!inputPath || !outputPath) {
    console.error('Usage: npm run evaluate -- --input <cases.json> --output <kits.json>');
    console.error('Options:');
    console.error('  --input, -i    Path to input JSON file containing test cases');
    console.error('  --output, -o   Path to output JSON destination file');
    console.error('  --provider, -p Optional LLM provider override (openai, anthropic, gemini, mock)');
    return { success: false, error: 'Missing required --input or --output arguments' };
  }

  const resolvedInput = path.resolve(process.cwd(), inputPath);
  const resolvedOutput = path.resolve(process.cwd(), outputPath);

  if (!fs.existsSync(resolvedInput)) {
    const errMsg = `Input file not found at: ${resolvedInput}`;
    console.error(`[Evaluator Error] ${errMsg}`);
    return { success: false, error: errMsg };
  }

  let rawCases;
  try {
    const fileContent = fs.readFileSync(resolvedInput, 'utf-8');
    rawCases = JSON.parse(fileContent);
  } catch (err) {
    const errMsg = `Failed to parse input JSON file: ${err.message}`;
    console.error(`[Evaluator Error] ${errMsg}`);
    return { success: false, error: errMsg };
  }

  if (!Array.isArray(rawCases)) {
    const errMsg = 'Input JSON must be an array of test case objects.';
    console.error(`[Evaluator Error] ${errMsg}`);
    return { success: false, error: errMsg };
  }

  const totalCases = rawCases.length;
  console.log(`\n======================================================`);
  console.log(` Trao AI Interview Prep Kit - Batch Evaluator v1.0`);
  console.log(`======================================================`);
  console.log(`Input file:   ${inputPath} (${totalCases} test cases)`);
  console.log(`Output file:  ${outputPath}`);
  console.log(`Provider:     ${argProvider || process.env.LLM_PROVIDER || 'default'}`);
  console.log(`Started at:   ${new Date().toISOString()}`);
  console.log(`------------------------------------------------------\n`);

  const startTime = Date.now();
  const kitResults = [];
  let succeededCount = 0;
  let failedCount = 0;

  for (let index = 0; index < totalCases; index++) {
    const caseItem = rawCases[index];
    const caseId = caseItem.id || caseItem.case_id || caseItem.caseId || `case-${String(index + 1).padStart(2, '0')}`;
    const jd = caseItem.jd || caseItem.jobDescription || caseItem.job_description || '';
    const companyUrl = caseItem.company_url || caseItem.companyUrl || '';
    const days = parseInt(caseItem.days || caseItem.totalDays, 10) || 7;

    const caseStart = Date.now();
    console.log(`[${index + 1}/${totalCases}] Processing case "${caseId}" (days: ${days}, url: "${companyUrl || 'none'}")...`);

    try {
      if (!jd || typeof jd !== 'string' || jd.trim().length === 0) {
        throw new Error('Case is missing required "jd" (job description) string.');
      }

      // Execute the exact same end-to-end pipeline as the web application
      const kit = await generateCompleteKit({
        jd: jd.trim(),
        company_url: companyUrl.trim(),
        days,
        targetRole: caseItem.targetRole || caseItem.role || '',
        targetCompany: caseItem.targetCompany || caseItem.company || '',
        candidateResume: caseItem.candidateResume || caseItem.resume || '',
        allowLocalhost: true, // Batch evaluator fixtures may test localhost
        providerName: argProvider || null
      });

      const elapsedSec = ((Date.now() - caseStart) / 1000).toFixed(2);
      console.log(`  ✔ Case "${caseId}" succeeded in ${elapsedSec}s (Requirements: ${kit.requirements?.length}, Questions: ${(kit.modules || []).reduce((a, m) => a + (m.questions?.length || 0), 0)}, Score: ${kit.coverageScore}%)`);

      kitResults.push({
        id: caseId,
        status: 'ok',
        kit,
        error: null
      });
      succeededCount++;
    } catch (caseErr) {
      const elapsedSec = ((Date.now() - caseStart) / 1000).toFixed(2);
      const errMsg = caseErr.message || String(caseErr);
      console.error(`  ✖ Case "${caseId}" failed in ${elapsedSec}s: ${errMsg}`);

      kitResults.push({
        id: caseId,
        status: 'error',
        kit: null,
        error: errMsg
      });
      failedCount++;
      // Continue after a failed case per assessment specification
    }
  }

  // Compile final payload adhering strictly to Appendix B
  const outputPayload = {
    version: '1.0',
    generated_at: new Date().toISOString(),
    kits: kitResults
  };

  // Ensure target directory exists and write output
  try {
    const targetDir = path.dirname(resolvedOutput);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.writeFileSync(resolvedOutput, JSON.stringify(outputPayload, null, 2), 'utf-8');
  } catch (writeErr) {
    const errMsg = `Failed to write output JSON to ${resolvedOutput}: ${writeErr.message}`;
    console.error(`[Evaluator Error] ${errMsg}`);
    return { success: false, error: errMsg };
  }

  const totalDurationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n------------------------------------------------------`);
  console.log(`Batch evaluation complete in ${totalDurationSec}s`);
  console.log(`Results: ${succeededCount} succeeded, ${failedCount} failed (${totalCases} total)`);
  console.log(`Output saved to: ${resolvedOutput}`);
  console.log(`======================================================\n`);

  return {
    success: true,
    totalCases,
    succeededCount,
    failedCount,
    durationSeconds: parseFloat(totalDurationSec),
    outputPayload
  };
}

// Self-invoking when executed from CLI
const isDirectExecution = process.argv[1] && (
  process.argv[1].endsWith('evaluate.js') || 
  process.argv[1].includes('evaluate')
);

if (isDirectExecution) {
  runEvaluator().then(result => {
    if (!result.success) {
      process.exit(1);
    }
    process.exit(0);
  }).catch(err => {
    console.error('[Evaluator Fatal]', err);
    process.exit(1);
  });
}
