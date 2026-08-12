'use client';

import Link from 'next/link';

export default function StaffWorkbenchPage() {
  const queue = [
    { id: 'REQ-2026-8819', service: 'Biometric Passport Renewal', citizen: 'Youssef Ben Ammar', cin: '08123456', priority: 'High', date: '2026-08-10' },
    { id: 'REQ-2026-8820', service: 'Civil Status Extract (Birth)', citizen: 'Amina Mansouri', cin: '09876543', priority: 'Normal', date: '2026-08-11' },
    { id: 'REQ-2026-8821', service: 'Business License Registration', citizen: 'Kharroubi Trading SARL', cin: '07112233', priority: 'Urgent', date: '2026-08-12' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="bg-midnight-navy text-white rounded-2xl p-6 flex justify-between items-center shadow-lg">
        <div>
          <span className="px-3 py-0.5 rounded-full bg-accent-gold text-midnight-navy text-[10px] font-extrabold uppercase">
            Staff Operations Level 2
          </span>
          <h1 className="text-2xl font-extrabold mt-1">Government Staff Processing Workbench</h1>
          <p className="text-xs text-slate-300">Queue of incoming citizen applications requiring verification and approval.</p>
        </div>
        <Link href="/staff/audit" className="px-4 py-2 bg-white/10 text-white rounded-xl text-xs font-bold hover:bg-white/20">
          Security Audit Log
        </Link>
      </div>

      <div className="bg-surface dark:bg-slate-900 rounded-2xl border border-outline-variant/30 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-outline-variant/20 flex justify-between items-center text-xs">
          <h2 className="font-bold text-institutional-navy dark:text-white">Active Queue ({queue.length} items pending)</h2>
          <span className="text-slate-400">Agent: Officer K. Trabelsi</span>
        </div>

        <table className="w-full text-left text-xs">
          <thead className="bg-surface-container text-on-surface uppercase text-[10px]">
            <tr>
              <th className="p-4">Ref ID</th>
              <th className="p-4">Procedure</th>
              <th className="p-4">Applicant</th>
              <th className="p-4">Priority</th>
              <th className="p-4">Submission</th>
              <th className="p-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/20 font-medium">
            {queue.map((item) => (
              <tr key={item.id} className="hover:bg-surface-container/40">
                <td className="p-4 font-mono font-bold text-midnight-navy dark:text-accent-gold">{item.id}</td>
                <td className="p-4 font-bold text-institutional-navy dark:text-white">{item.service}</td>
                <td className="p-4">{item.citizen} (<span className="font-mono text-slate-400">{item.cin}</span>)</td>
                <td className="p-4">
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${item.priority === 'Urgent' ? 'bg-error-container text-on-error-container' : 'bg-amber-500/10 text-amber-600'}`}>
                    {item.priority}
                  </span>
                </td>
                <td className="p-4 text-slate-400">{item.date}</td>
                <td className="p-4 text-right">
                  <Link
                    href={`/staff/verify/${item.id}`}
                    className="px-3.5 py-1.5 bg-midnight-navy text-white text-xs font-bold rounded-lg hover:bg-slate-800"
                  >
                    Verify & Review →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
