'use client';

import Link from 'next/link';

export default function MyDocumentsPage() {
  const docs = [
    { id: 'DOC-9901', title: 'National Identity Card (CIN) Scan', type: 'PDF Document', size: '2.4 MB', date: '2026-08-01', status: 'Verified' },
    { id: 'DOC-9902', title: 'Official Birth Certificate Extract', type: 'Digitized Certificate', size: '1.1 MB', date: '2026-07-15', status: 'Verified' },
    { id: 'DOC-9903', title: 'Proof of Residence (Municipal Cert)', type: 'PDF Document', size: '890 KB', date: '2026-06-20', status: 'Verified' },
    { id: 'DOC-9904', title: 'Property Tax Payment Receipt 2026', type: 'Receipt PDF', size: '540 KB', date: '2026-05-10', status: 'Verified' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-outline-variant/30 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-institutional-navy dark:text-white">Digital Document Vault</h1>
          <p className="text-xs text-on-surface-variant mt-1">Encrypted repository of your verified government documents and identity scans.</p>
        </div>
        <Link
          href="/documents/upload"
          className="px-4 py-2.5 bg-midnight-navy text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition-all flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-sm">cloud_upload</span>
          Upload New Document
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {docs.map((d) => (
          <div
            key={d.id}
            className="bg-surface dark:bg-slate-900 rounded-2xl p-5 border border-outline-variant/30 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex justify-between items-start">
                <span className="p-3 rounded-xl bg-midnight-navy/10 text-midnight-navy dark:text-accent-gold">
                  <span className="material-symbols-outlined text-2xl">description</span>
                </span>
                <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
                  {d.status}
                </span>
              </div>
              <h3 className="font-bold text-sm text-institutional-navy dark:text-white leading-snug">{d.title}</h3>
              <p className="text-xs text-slate-400">{d.type} • {d.size}</p>
            </div>

            <div className="pt-4 mt-4 border-t border-outline-variant/20 flex justify-between items-center text-xs">
              <span className="text-slate-400 font-mono text-[11px]">{d.id}</span>
              <Link
                href={`/documents/${d.id}`}
                className="font-bold text-mediterranean-cerulean hover:underline flex items-center gap-1"
              >
                Inspect
                <span className="material-symbols-outlined text-xs">open_in_new</span>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
