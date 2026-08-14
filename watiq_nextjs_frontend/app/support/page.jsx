'use client';

import Link from 'next/link';

export default function SupportPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-extrabold text-institutional-navy dark:text-white">
          Watiq Support & Help Center
        </h1>
        <p className="text-xs text-on-surface-variant max-w-md mx-auto">
          Need assistance with a procedure, biometric appointment, or document vault issue?
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Link href="/support/chat" className="bg-surface dark:bg-slate-900 p-6 rounded-2xl border border-outline-variant/30 shadow-xs hover:border-accent-gold transition-all space-y-3">
          <span className="p-3 rounded-xl bg-midnight-navy/10 text-midnight-navy dark:text-accent-gold inline-block">
            <span className="material-symbols-outlined text-3xl">chat</span>
          </span>
          <h2 className="font-bold text-base text-institutional-navy dark:text-white">Live Virtual Assistant</h2>
          <p className="text-xs text-slate-400">Instant answers regarding document requirements and status checks.</p>
        </Link>

        <Link href="/faq" className="bg-surface dark:bg-slate-900 p-6 rounded-2xl border border-outline-variant/30 shadow-xs hover:border-accent-gold transition-all space-y-3">
          <span className="p-3 rounded-xl bg-mediterranean-cerulean/10 text-mediterranean-cerulean inline-block">
            <span className="material-symbols-outlined text-3xl">quiz</span>
          </span>
          <h2 className="font-bold text-base text-institutional-navy dark:text-white">Frequently Asked Questions</h2>
          <p className="text-xs text-slate-400">Step-by-step guides for passport renewal, birth extracts, and tax stamps.</p>
        </Link>
      </div>
    </div>
  );
}
