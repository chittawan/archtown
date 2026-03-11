import { Link } from 'react-router-dom';
import { LayoutDashboard, ArrowRight } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--color-page)] text-[var(--color-text)] font-sans flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Subtle background */}
      <div
        className="absolute inset-0 opacity-[0.4] dark:opacity-[0.15]"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 20%, var(--color-primary-muted), transparent 60%)',
        }}
      />
      <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-[var(--color-overlay)] to-transparent pointer-events-none" />

      <div className="relative z-10 text-center max-w-xl mx-auto">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--color-primary)] text-white mb-8 shadow-[var(--shadow-modal)]">
          <LayoutDashboard className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold text-[var(--color-text)] tracking-tight">
          ArchTown
        </h1>
        <p className="mt-3 text-[var(--color-text-muted)] text-lg">
          จัดการโปรเจกต์และความสามารถ — เข้าระบบเพื่อเริ่มต้น
        </p>

        <div className="mt-12">
          <Link
            to="/capability"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[var(--color-primary)] text-white font-medium hover:bg-[var(--color-primary-hover)] transition-colors shadow-[var(--shadow-card)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-page)]"
          >
            เข้าระบบ
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>

        <p className="mt-8 text-sm text-[var(--color-text-subtle)]">
          อนาคตจะเพิ่มหน้า Login
        </p>
      </div>
    </div>
  );
}
