'use client';

import { useState } from 'react';
import { 
  Sparkles, 
  ShieldCheck, 
  Calendar, 
  BarChart3, 
  Mic, 
  CheckCircle2, 
  ArrowRight, 
  Code2, 
  ExternalLink,
  Zap,
  Layers,
  Terminal
} from 'lucide-react';
import HealthBadge from '../components/HealthBadge';
import { apiClient } from '../lib/api';

export default function Home() {
  const [testResponse, setTestResponse] = useState(null);
  const [testingEndpoint, setTestingEndpoint] = useState(false);

  const testHealthPing = async () => {
    setTestingEndpoint(true);
    try {
      const data = await apiClient('/health/ping');
      setTestResponse({ status: 200, data });
    } catch (err) {
      setTestResponse({ status: err.status || 500, error: err.message });
    } finally {
      setTestingEndpoint(false);
    }
  };

  const testFullHealth = async () => {
    setTestingEndpoint(true);
    try {
      const data = await apiClient('/health');
      setTestResponse({ status: 200, data });
    } catch (err) {
      setTestResponse({ status: err.status || 500, error: err.message });
    } finally {
      setTestingEndpoint(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 space-y-12">
      {/* Hero Section */}
      <section className="text-center space-y-4 max-w-3xl mx-auto pt-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50/80 px-3.5 py-1 text-xs font-semibold text-brand-700 shadow-xs">
          <Sparkles className="h-3.5 w-3.5 text-brand-600" />
          <span>Trao AI Engineering Assessment · Phase 1 Foundation</span>
        </div>
        
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          Interview Prep Kit
          <span className="block text-brand-600 mt-1">Full-Stack Core Architecture</span>
        </h1>
        
        <p className="text-base text-slate-600 sm:text-lg">
          A production-grade, deterministic foundation connecting a <span className="font-semibold text-slate-800">Next.js + Tailwind CSS</span> frontend to an <span className="font-semibold text-slate-800">Express + MongoDB</span> backend with robust health telemetry, error envelopes, and environment validation.
        </p>
      </section>

      {/* Real-time Health Monitor Component */}
      <section>
        <HealthBadge />
      </section>

      {/* Interactive API Tester Card */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Terminal className="h-5 w-5 text-brand-600" />
              API Probe & Endpoint Verification
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Execute live HTTP queries to test backend routing and error handling foundation.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={testHealthPing}
              disabled={testingEndpoint}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <Zap className="h-3.5 w-3.5 text-brand-600" />
              GET /health/ping
            </button>
            <button
              onClick={testFullHealth}
              disabled={testingEndpoint}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors shadow-xs"
            >
              <Terminal className="h-3.5 w-3.5" />
              GET /health (Full)
            </button>
          </div>
        </div>

        {/* Live response viewer */}
        <div className="mt-4">
          <div className="text-[11px] font-mono font-medium text-slate-500 uppercase tracking-wider mb-1.5">
            Endpoint Output:
          </div>
          <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs font-mono text-emerald-400 border border-slate-800 max-h-56">
            {testingEndpoint ? (
              <span className="text-slate-500 animate-pulse">Request in flight...</span>
            ) : testResponse ? (
              JSON.stringify(testResponse, null, 2)
            ) : (
              <span className="text-slate-500">Ready. Click an action above to ping the backend API in real time.</span>
            )}
          </pre>
        </div>
      </section>

      {/* Architectural Pillars for Upcoming Phases */}
      <section id="features" className="space-y-6">
        <div className="border-b border-slate-200 pb-3">
          <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Layers className="h-5 w-5 text-brand-600" />
            Trao Prep Kit Platform Blueprint
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Engineered boundaries between non-deterministic AI generation and deterministic algorithms.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs hover:border-brand-300 transition-all">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 mb-3">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">SSRF-Safe Research Pipeline</h3>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              Pre-flight DNS validation blocking private/link-local IPs (`127.0.0.1`, RFC 1918, `169.254.169.254`) with socket pinning to prevent DNS rebinding attacks.
            </p>
            <div className="mt-3 text-[10px] font-semibold text-blue-700 bg-blue-50/80 px-2 py-1 rounded inline-block">
              Deterministic Gate
            </div>
          </div>

          {/* Card 2 */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs hover:border-brand-300 transition-all">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-600 mb-3">
              <BarChart3 className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Coverage-Checking Algorithm</h3>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              Weighted competency mapping formula ensuring ≥85% of job description requirements are tested, with automatic delta regeneration loop for uncovered gaps.
            </p>
            <div className="mt-3 text-[10px] font-semibold text-purple-700 bg-purple-50/80 px-2 py-1 rounded inline-block">
              Mathematical Score Gate
            </div>
          </div>

          {/* Card 3 */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs hover:border-brand-300 transition-all">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 mb-3">
              <Calendar className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Deterministic Scheduler</h3>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              Knapsack bin-packing algorithm segmenting available study days into Foundation (50%), Deep-Dive (35%), and Timed Drills (15%) with spaced repetition.
            </p>
            <div className="mt-3 text-[10px] font-semibold text-emerald-700 bg-emerald-50/80 px-2 py-1 rounded inline-block">
              100% Deterministic Code
            </div>
          </div>

          {/* Card 4 */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs hover:border-brand-300 transition-all">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600 mb-3">
              <Mic className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Interactive Practice Mode</h3>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              Real-time mock interview environment with timed question delivery, 3-level hint ladders, speech pacing analysis, and 5-point rubric grading.
            </p>
            <div className="mt-3 text-[10px] font-semibold text-amber-700 bg-amber-50/80 px-2 py-1 rounded inline-block">
              Hybrid LLM + Timer Engine
            </div>
          </div>

          {/* Card 5 */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs hover:border-brand-300 transition-all">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50 text-rose-600 mb-3">
              <Code2 className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Kit Editing State Model</h3>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              State machine with dirty checking and `isCustomized` flags, preserving candidate notes and custom answers during module-level regenerations.
            </p>
            <div className="mt-3 text-[10px] font-semibold text-rose-700 bg-rose-50/80 px-2 py-1 rounded inline-block">
              Optimistic Concurrency
            </div>
          </div>

          {/* Card 6 */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs hover:border-brand-300 transition-all">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 mb-3">
              <Zap className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Offline Batch Evaluator</h3>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              Automated regression test suite evaluating kit generation across 30+ golden job descriptions for schema compliance, rubric quality, and cost.
            </p>
            <div className="mt-3 text-[10px] font-semibold text-indigo-700 bg-indigo-50/80 px-2 py-1 rounded inline-block">
              Quality Assurance CI Suite
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
