'use client';

import { use } from 'react';
import Link from 'next/link';

export default function DocumentDetailPage({ params }) {
  const resolvedParams = use(params);
  const docId = resolvedParams.id || 'DOC-9901';

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-center justify-between border-b border-outline-variant/30 pb-4">
        <div>
          <span className="font-mono text-xs font-bold text-midnight-navy dark:text-accent-gold">{docId}</span>
          <h1 className="text-2xl font-extrabold text-institutional-navy dark:text-white mt-1">
            National Identity Card (CIN) Scan
          </h1>
        </div>
        <div className="flex gap-2">
          <Link href="/documents" className="px-3.5 py-1.5 text-xs font-bold border border-outline-variant rounded-lg">
            ← Back
          </Link>
          <button onClick={() => alert('Downloading official encrypted PDF...')} className="px-4 py-1.5 text-xs font-bold bg-midnight-navy text-white rounded-lg">
            Download PDF
          </button>
        </div>
      </div>

      {/* Document Viewer Frame */}
      <div className="bg-slate-900 rounded-2xl p-8 text-center text-white space-y-4 border border-slate-700 shadow-xl">
        <div className="w-20 h-28 bg-white/10 rounded-xl border border-white/20 mx-auto flex items-center justify-center">
          <span className="material-symbols-outlined text-4xl text-accent-gold">picture_as_pdf</span>
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold">CIN_Identity_Scan_FrontBack_Verified.pdf</h2>
          <p className="text-xs text-slate-400">Digital Signature: SHA256-a98f12c9b... (Republic Cert Authority)</p>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          Legally Valid Digital Copy
        </div>
      </div>
    </div>
  );
}
