'use client';

import { use } from 'react';
import Link from 'next/link';

export default function RequestDetailPage({ params }) {
  const resolvedParams = use(params);
  const reqId = resolvedParams.id || 'REQ-2026-8819';

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="flex items-center justify-between border-b border-outline-variant/30 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono font-extrabold text-sm text-midnight-navy dark:text-accent-gold">{reqId}</span>
            <span className="px-3 py-0.5 text-xs font-bold bg-amber-500/10 text-amber-600 rounded-full border border-amber-500/30">
              In Review (Stage 2 of 4)
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-institutional-navy dark:text-white mt-1">
            Biometric Passport Renewal Application
          </h1>
        </div>
        <Link
          href="/requests"
          className="px-3.5 py-1.5 text-xs font-bold border border-outline-variant rounded-lg hover:bg-surface-container"
        >
          ← Back to List
        </Link>
      </div>

      {/* Progress Timeline */}
      <div className="bg-surface dark:bg-slate-900 rounded-2xl p-6 border border-outline-variant/30 shadow-xs space-y-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Processing Progress Timeline</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1">
            <span className="text-emerald-600 font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">check_circle</span> 1. Submission
            </span>
            <p className="text-[11px] text-slate-500">Aug 10, 09:15 AM</p>
          </div>
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/40 space-y-1">
            <span className="text-amber-600 font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">sync</span> 2. Document Review
            </span>
            <p className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold">Active Agent Verification</p>
          </div>
          <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/30 space-y-1 opacity-60">
            <span className="font-bold text-slate-400">3. Biometric Pass</span>
            <p className="text-[11px] text-slate-400">Pending Stage 2</p>
          </div>
          <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/30 space-y-1 opacity-60">
            <span className="font-bold text-slate-400">4. Issuance</span>
            <p className="text-[11px] text-slate-400">Pending Stage 3</p>
          </div>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-surface dark:bg-slate-900 rounded-2xl p-6 border border-outline-variant/30 space-y-4 text-xs">
          <h3 className="font-bold text-sm text-institutional-navy dark:text-white border-b border-outline-variant/20 pb-2">
            Applicant & Procedure Metadata
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-400">Applicant:</span>
              <strong className="text-on-surface">Youssef Ben Ammar</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">CIN Number:</span>
              <strong className="font-mono text-on-surface">08123456</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Fiscal Stamp Paid:</span>
              <strong className="text-emerald-600 font-bold">60.000 TND (Receipt #99218)</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Target Office:</span>
              <strong className="text-on-surface">Tunis Central Municipality</strong>
            </div>
          </div>
        </div>

        <div className="bg-surface dark:bg-slate-900 rounded-2xl p-6 border border-outline-variant/30 space-y-4 text-xs">
          <h3 className="font-bold text-sm text-institutional-navy dark:text-white border-b border-outline-variant/20 pb-2">
            Attached Documents
          </h3>
          <div className="space-y-2">
            <div className="p-2.5 bg-surface-container rounded-lg flex justify-between items-center">
              <span className="font-medium">CIN_Scan_FrontBack.pdf</span>
              <span className="text-emerald-600 font-bold text-[10px]">VERIFIED</span>
            </div>
            <div className="p-2.5 bg-surface-container rounded-lg flex justify-between items-center">
              <span className="font-medium">Residence_Certificate_2026.pdf</span>
              <span className="text-emerald-600 font-bold text-[10px]">VERIFIED</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
