'use client';

import Link from 'next/link';

export default function PaymentConfirmationPage() {
  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-12">
      <div className="bg-surface dark:bg-slate-900 rounded-2xl p-8 border border-outline-variant/30 shadow-xl text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto">
          <span className="material-symbols-outlined text-4xl">check_circle</span>
        </div>

        <div className="space-y-2">
          <span className="px-3 py-1 text-xs font-bold bg-emerald-500/10 text-emerald-600 rounded-full border border-emerald-500/30">
            TRANSACTION CONFIRMED
          </span>
          <h1 className="text-2xl font-extrabold text-institutional-navy dark:text-white">
            Fiscal Stamp Payment Successful
          </h1>
          <p className="text-xs text-on-surface-variant">
            Thank you. Your government procedure request has been transmitted for staff verification.
          </p>
        </div>

        <div className="p-5 bg-slate-50 dark:bg-slate-800 rounded-xl text-left text-xs space-y-2.5 border border-outline-variant/30 font-mono">
          <div className="flex justify-between">
            <span className="text-slate-400">Transaction Ref:</span>
            <strong className="text-on-surface">TXN-2026-991204</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Procedure Ref:</span>
            <strong className="text-midnight-navy dark:text-accent-gold">REQ-2026-8819</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Amount Paid:</span>
            <strong className="text-emerald-600 font-extrabold">60.000 TND</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Date & Time:</span>
            <strong className="text-on-surface">12 Aug 2026, 20:40 UTC</strong>
          </div>
        </div>

        <div className="flex justify-center gap-3">
          <button onClick={() => window.print()} className="px-5 py-2.5 text-xs font-bold border border-outline-variant rounded-xl hover:bg-surface-container">
            Print Official Receipt
          </button>
          <Link href="/dashboard" className="px-5 py-2.5 text-xs font-bold bg-midnight-navy text-white rounded-xl hover:bg-slate-800">
            Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
