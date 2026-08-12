import Link from 'next/link';

export default function Logo({ className = "h-10 w-auto" }) {
  return (
    <Link href="/" className="flex items-center gap-3 group focus:outline-none focus:ring-2 focus:ring-primary rounded-lg p-1">
      <div className="relative w-10 h-10 flex items-center justify-center bg-midnight-navy text-accent-gold rounded-lg shadow-sm border border-gold-muted/30 group-hover:scale-105 transition-transform">
        <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
          <path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-5.45 9-12V7l-9-5zm0 2.18l7 3.89v5.13c0 4.54-3.14 8.78-7 9.87-3.86-1.09-7-5.33-7-9.87V8.07l7-3.89zM12 6a3 3 0 100 6 3 3 0 000-6zm0 2a1 1 0 110 2 1 1 0 010-2zm0 5c-2.67 0-8 1.34-8 4v1h16v-1c0-2.66-5.33-4-8-4zm-6 3c.22-.72 3.31-1.9 6-1.9 2.7 0 5.8 1.19 6 1.9H6z" />
        </svg>
      </div>
      <div className="flex flex-col leading-tight">
        <span className="font-extrabold text-lg tracking-tight text-institutional-navy dark:text-white uppercase">
          Watiq <span className="text-accent-gold text-xs font-normal px-1.5 py-0.5 rounded bg-midnight-navy/10 dark:bg-accent-gold/20 ml-1">TN</span>
        </span>
        <span className="text-[10px] font-medium text-slate-500 tracking-wider uppercase">
          National Portal
        </span>
      </div>
    </Link>
  );
}
