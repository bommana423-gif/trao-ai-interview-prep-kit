'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, Database, Server, Clock, Cpu } from 'lucide-react';
import { checkBackendHealth } from '../lib/api';

export default function HealthBadge() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [latency, setLatency] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    const start = performance.now();
    try {
      const response = await checkBackendHealth();
      const end = performance.now();
      setLatency(Math.round(end - start));
      setHealth(response.data);
      setLastChecked(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err.message || 'Unable to reach backend API');
      setHealth(null);
      setLatency(null);
      setLastChecked(new Date().toLocaleTimeString());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    // Poll every 15 seconds
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  const isHealthy = health && health.status === 'healthy';
  const isDegraded = health && health.status === 'degraded';
  const isOffline = !health && !loading;

  return (
    <div id="system-status" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="flex items-center gap-3">
          <div className="relative flex h-3 w-3">
            {isHealthy && (
              <>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
              </>
            )}
            {isDegraded && (
              <>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500"></span>
              </>
            )}
            {(isOffline || loading) && (
              <span className="relative inline-flex h-3 w-3 rounded-full bg-slate-400"></span>
            )}
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              System Architecture Status
            </h3>
            <p className="text-xs text-slate-500">
              Real-time API & Database Connectivity Probe
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {latency !== null && (
            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-mono text-slate-700">
              {latency}ms
            </span>
          )}
          <button
            onClick={fetchHealth}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50 transition-colors"
            title="Re-run health check"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-brand-600' : 'text-slate-500'}`} />
            <span>Check Now</span>
          </button>
        </div>
      </div>

      {/* Status Details Grid */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Backend API Service */}
        <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3.5">
          <div className="rounded-lg bg-white p-2 shadow-xs border border-slate-200/60 text-slate-700">
            <Server className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Express Backend</div>
            <div className="mt-1 flex items-center gap-1.5 font-semibold text-slate-900 text-sm">
              {loading && !health ? (
                <span className="text-slate-400 font-normal">Pinging...</span>
              ) : health ? (
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" /> Online
                </span>
              ) : (
                <span className="flex items-center gap-1 text-rose-600">
                  <XCircle className="h-4 w-4" /> Offline
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 truncate mt-0.5">
              Port 5000 · Node {health?.service?.nodeVersion || 'v24'}
            </div>
          </div>
        </div>

        {/* MongoDB Status */}
        <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3.5">
          <div className="rounded-lg bg-white p-2 shadow-xs border border-slate-200/60 text-slate-700">
            <Database className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">MongoDB Database</div>
            <div className="mt-1 flex items-center gap-1.5 font-semibold text-slate-900 text-sm">
              {loading && !health ? (
                <span className="text-slate-400 font-normal">Checking...</span>
              ) : health?.database?.isConnected ? (
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" /> Connected
                </span>
              ) : health ? (
                <span className="flex items-center gap-1 text-amber-600">
                  <AlertTriangle className="h-4 w-4" /> Disconnected
                </span>
              ) : (
                <span className="flex items-center gap-1 text-slate-400 font-normal">
                  Unknown
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 truncate mt-0.5">
              {health?.database?.name ? `DB: ${health.database.name}` : 'Awaiting Connection'}
            </div>
          </div>
        </div>

        {/* Memory Usage */}
        <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3.5">
          <div className="rounded-lg bg-white p-2 shadow-xs border border-slate-200/60 text-slate-700">
            <Cpu className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Heap Memory</div>
            <div className="mt-1 font-semibold text-slate-900 text-sm">
              {health?.system?.memory ? (
                `${health.system.memory.heapUsedMb} MB / ${health.system.memory.heapTotalMb} MB`
              ) : (
                <span className="text-slate-400 font-normal">—</span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 truncate mt-0.5">
              RSS: {health?.system?.memory?.rssMb ? `${health.system.memory.rssMb} MB` : '—'}
            </div>
          </div>
        </div>

        {/* Server Uptime */}
        <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3.5">
          <div className="rounded-lg bg-white p-2 shadow-xs border border-slate-200/60 text-slate-700">
            <Clock className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Uptime</div>
            <div className="mt-1 font-semibold text-slate-900 text-sm">
              {health?.system?.uptimeSeconds !== undefined ? (
                `${health.system.uptimeSeconds}s`
              ) : (
                <span className="text-slate-400 font-normal">—</span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 truncate mt-0.5">
              {lastChecked ? `Checked: ${lastChecked}` : 'Not checked'}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-center justify-between">
          <span>Backend API connection failed: {error}</span>
          <span className="font-mono text-[10px] bg-rose-100 px-2 py-0.5 rounded">Check port 5000</span>
        </div>
      )}
    </div>
  );
}
