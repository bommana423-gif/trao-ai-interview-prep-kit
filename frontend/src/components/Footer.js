export default function Footer() {
  return (
    <footer className="w-full border-t border-slate-200 bg-white py-8 text-center text-xs text-slate-500">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>
            © {new Date().getFullYear()} Trao AI Assessment · Built with Next.js, Express, MongoDB & Tailwind CSS.
          </p>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Phase 1: Foundation</span>
            <span>·</span>
            <span>Deterministic Architecture</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
