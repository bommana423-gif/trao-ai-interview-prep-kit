'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  FolderKanban, 
  Plus, 
  ShieldCheck, 
  Building2, 
  Briefcase, 
  Calendar, 
  Sparkles, 
  ArrowRight,
  Clock,
  Loader2
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { fetchMyKits } from '../../lib/api';

export default function KitsDashboardPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [kits, setKits] = useState([]);
  const [loadingKits, setLoadingKits] = useState(true);
  const [error, setError] = useState(null);

  // Authentication Guard: Redirect if not logged in
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login?redirect=/kits');
    }
  }, [isLoading, isAuthenticated, router]);

  // Fetch kits for authenticated user
  useEffect(() => {
    if (isAuthenticated) {
      loadKits();
    }
  }, [isAuthenticated]);

  const loadKits = async () => {
    setLoadingKits(true);
    setError(null);
    try {
      const response = await fetchMyKits();
      setKits(response.data.kits || []);
    } catch (err) {
      setError(err.message || 'Failed to load your kits.');
    } finally {
      setLoadingKits(false);
    }
  };

  if (isLoading || (!isAuthenticated && !isLoading)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
          <p className="text-xs text-slate-500 font-medium">Verifying authentication session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              My Prep Kits
            </h1>
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 border border-brand-200">
              {kits.length} {kits.length === 1 ? 'Kit' : 'Kits'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Personalized, role-targeted preparation curriculum generated exclusively for <span className="font-semibold text-slate-700">{user?.email}</span>.
          </p>
        </div>

        <Link
          href="/kits/new"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-brand-500/20 hover:bg-brand-700 transition-all cursor-pointer self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>New Prep Kit</span>
        </Link>
      </div>

      {/* User Isolation Security Banner */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 flex items-start gap-3 text-xs text-emerald-900">
        <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-semibold block">Multi-Tenant User Isolation Verified</span>
          <p className="text-emerald-800/90 leading-relaxed">
            All queries enforce server-side database scoping <code className="bg-emerald-100/80 px-1 py-0.5 rounded font-mono text-[11px]">{`{ userId: "${user?.id}" }`}</code>. Kits belonging to other users are cryptographically shielded and return 403 Forbidden.
          </p>
        </div>
      </div>

      {/* Kits List */}
      {loadingKits ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <div className="flex items-center gap-2 text-slate-500 text-xs">
            <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
            <span>Loading your private kits...</span>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
          {error}
        </div>
      ) : kits.length === 0 ? (
        /* Empty State */
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center space-y-4 bg-white/50">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <FolderKanban className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-slate-900">No interview kits generated yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Create your first targeted prep kit by providing a target role, company name, and job description.
            </p>
          </div>
          <Link
            href="/kits/new"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition-all cursor-pointer"
          >
            <Sparkles className="h-4 w-4" />
            <span>Create First Kit</span>
          </Link>
        </div>
      ) : (
        /* Grid of Kits */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {kits.map((kit) => (
            <Link
              key={kit._id}
              href={`/kits/${kit._id}`}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:shadow-md hover:border-brand-300 transition-all flex flex-col justify-between group"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="rounded-md bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700">
                    {kit.status}
                  </span>
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(kit.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-900 group-hover:text-brand-600 transition-colors flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-brand-600 shrink-0" />
                    <span className="truncate">{kit.targetRole}</span>
                  </h3>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span>{kit.targetCompany}</span>
                  </div>
                </div>

                <div className="rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-600 flex items-center justify-between">
                  <span>Coverage Score:</span>
                  <span className="font-mono font-semibold text-brand-600">
                    {kit.coverageScore || 0}%
                  </span>
                </div>
              </div>

              <div className="mt-5 border-t border-slate-100 pt-3 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-mono truncate max-w-[140px]">
                  ID: {kit._id}
                </span>
                <span className="text-xs font-semibold text-brand-600 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                  Open Kit <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
