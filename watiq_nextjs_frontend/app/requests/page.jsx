'use client';

import Link from 'next/link';

export default function MyRequestsPage() {
  const requests = [
    { id: 'REQ-2026-8819', service: 'Biometric Passport Renewal', date: '2026-08-10', status: 'In Review', badge: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
    { id: 'REQ-2026-7731', service: 'Civil Status Extract (Birth)', date: '2026-08-01', status: 'Approved', badge: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
    { id: 'REQ-2026-6410', service: 'National Identity Card (CIN)', date: '2026-07-22', status: 'Completed', badge: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
    { id: 'REQ-2026-4109', service: 'Property Tax Certificate', date: '2026-06-15', status: 'Archived', badge: 'bg-slate-500/10 text-slate-500 border-slate-500/30' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-outline-variant/30 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-institutional-navy dark:text-white">My Procedure Requests</h1>
          <p className="text-xs text-on-surface-variant mt-1">Track the live progress of all submitted government procedures.</p>
        </div>
        <Link
          href="/requests/submit"
          className="px-4 py-2.5 bg-midnight-navy text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition-all flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-sm">add_circle</span>
          Submit New Request
        </Link>
      </div>

      <div className="bg-surface dark:bg-slate-900 rounded-2xl border border-outline-variant/30 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-on-surface">
            <thead className="bg-midnight-navy text-white uppercase text-[11px] tracking-wider">
              <tr>
                <th className="py-3.5 px-6">Reference ID</th>
                <th className="py-3.5 px-6">Procedure Name</th>
                <th className="py-3.5 px-6">Submission Date</th>
                <th className="py-3.5 px-6">Status Badge</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20 font-medium">
              {requests.map((req) => (
                <tr key={req.id} className="hover:bg-surface-container/50 transition-colors">
                  <td className="py-4 px-6 font-mono font-bold text-midnight-navy dark:text-accent-gold">{req.id}</td>
                  <td className="py-4 px-6 font-bold text-institutional-navy dark:text-white">{req.service}</td>
                  <td className="py-4 px-6 text-slate-500">{req.date}</td>
                  <td className="py-4 px-6">
                    <span className={`px-3 py-1 text-[11px] font-bold rounded-full border ${req.badge}`}>
                      {req.status}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <Link
                      href={`/requests/${req.id}`}
                      className="px-3.5 py-1.5 text-xs font-bold text-midnight-navy dark:text-white border border-outline-variant hover:bg-surface-container rounded-lg transition-colors inline-flex items-center gap-1"
                    >
                      <span>Track Status</span>
                      <span className="material-symbols-outlined text-xs">arrow_forward</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
