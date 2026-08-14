'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function VerifyRequestPage({ params }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const reqId = resolvedParams.id || 'REQ-2026-8819';
  const [decision, setDecision] = useState('');

  const handleApprove = () => {
    alert(`Request ${reqId} APPROVED by Staff Officer. Digital signature applied.`);
    router.push('/staff/workbench');
  };

  const handleReject = () => {
    alert(`Request ${reqId} REJECTED. Notification sent to applicant.`);
    router.push('/staff/workbench');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex justify-between items-center border-b border-outline-variant/30 pb-4">
        <div>
          <span className="font-mono text-xs font-bold text-midnight-navy dark:text-accent-gold">{reqId}</span>
          <h1 className="text-2xl font-extrabold text-institutional-navy dark:text-white mt-1">
            Verification & Approval Desk: Biometric Passport Renewal
          </h1>
        </div>
        <Link href="/staff/workbench" className="px-3.5 py-1.5 text-xs font-bold border border-outline-variant rounded-lg">
          ← Back to Workbench
        </Link>
      </div>

      {/* Side-by-Side Verification Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Panel: Submitted Form Data */}
        <div className="bg-surface dark:bg-slate-900 rounded-2xl p-6 border border-outline-variant/30 space-y-4 text-xs">
          <h2 className="font-bold text-sm text-institutional-navy dark:text-white border-b border-outline-variant/20 pb-2">
            1. Applicant Data Submission
          </h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <span className="text-slate-400">Full Name:</span>
              <strong className="text-on-surface">Youssef Ben Ammar</strong>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-slate-400">CIN Identity:</span>
              <strong className="font-mono text-on-surface">08123456</strong>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-slate-400">Birth Date & Place:</span>
              <strong className="text-on-surface">14/03/1990 — Tunis</strong>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-slate-400">Fiscal Stamp Paid:</span>
              <strong className="text-emerald-600 font-bold">60.000 TND (Verified)</strong>
            </div>
          </div>
        </div>

        {/* Right Panel: Official Database Scan Match */}
        <div className="bg-surface dark:bg-slate-900 rounded-2xl p-6 border border-outline-variant/30 space-y-4 text-xs">
          <h2 className="font-bold text-sm text-institutional-navy dark:text-white border-b border-outline-variant/20 pb-2">
            2. National Registry Match & Facial Biometric Score
          </h2>
          <div className="space-y-3">
            <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/30 flex items-center justify-between text-emerald-700 dark:text-emerald-300">
              <span className="font-bold flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">verified</span>
                Registry Record Found: MATCH
              </span>
              <span className="font-mono font-bold">99.8% Match</span>
            </div>
            <div className="p-3 bg-surface-container rounded-xl space-y-1">
              <p className="font-bold text-on-surface">Biometric Photo ID Scan</p>
              <p className="text-[11px] text-slate-400">SHA256: e804cbbd1940a9... Passed automated facial landmark comparison.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Decision Bar */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="text-xs space-y-1">
          <h3 className="font-bold text-accent-gold">Officer Approval Sign-Off</h3>
          <p className="text-slate-300">Verify all items above before issuing official approval certificate.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleReject}
            className="px-6 py-2.5 bg-error text-white font-bold text-xs rounded-xl hover:bg-red-700"
          >
            Reject Request
          </button>
          <button
            onClick={handleApprove}
            className="px-8 py-2.5 bg-emerald-500 text-slate-950 font-extrabold text-xs rounded-xl hover:bg-emerald-400 shadow-lg"
          >
            Approve & Sign Certificate
          </button>
        </div>
      </div>
    </div>
  );
}
