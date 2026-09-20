'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkles, Terminal, BookOpen, Layers, LogOut, User, FolderKanban } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white shadow-md shadow-brand-500/20 group-hover:bg-brand-700 transition-colors">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold tracking-tight text-slate-900 leading-none">
                TRAO<span className="text-brand-600">.AI</span>
              </span>
              <span className="text-[10px] font-medium text-slate-500 uppercase tracking-widest mt-0.5">
                Interview Prep Kit
              </span>
            </div>
          </Link>
          <span className="hidden sm:inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
            Auth & Isolation Active
          </span>
        </div>

        <nav className="flex items-center gap-4 sm:gap-6">
          <Link
            href="/#features"
            className="hidden md:flex text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors items-center gap-1.5"
          >
            <Layers className="h-4 w-4" />
            <span>Architecture</span>
          </Link>

          <Link
            href="/#system-status"
            className="hidden sm:flex text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors items-center gap-1.5"
          >
            <Terminal className="h-4 w-4" />
            <span>Health</span>
          </Link>

          {/* Auth State Switch */}
          {isLoading ? (
            <div className="h-8 w-20 bg-slate-100 animate-pulse rounded-lg" />
          ) : isAuthenticated ? (
            <div className="flex items-center gap-3">
              <Link
                href="/kits"
                className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition-colors"
              >
                <FolderKanban className="h-3.5 w-3.5" />
                <span>My Kits</span>
              </Link>

              <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white uppercase shadow-xs">
                  {user?.name?.[0] || user?.email?.[0] || 'U'}
                </div>
                <span className="hidden lg:inline text-xs font-medium text-slate-700 max-w-[120px] truncate">
                  {user?.name || user?.email}
                </span>
                <button
                  onClick={handleLogout}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                href="/login"
                className="text-xs sm:text-sm font-semibold text-slate-700 hover:text-slate-900 transition-colors px-2 py-1"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition-all shadow-brand-500/20"
              >
                Get Started
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
