'use client';

export default function AdminManagementPage() {
  const metrics = [
    { title: 'Total Portal Users', val: '1,420,890', change: '+12.4% this month' },
    { title: 'Procedures Processed (2026)', val: '389,102', change: '+8.1% YoY' },
    { title: 'API Uptime', val: '99.99%', change: 'BFF Replica Active' },
    { title: 'Redis Session Store', val: '0.42 ms', change: 'Operational' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="bg-gradient-to-r from-slate-900 to-midnight-navy text-white rounded-2xl p-6 shadow-xl flex justify-between items-center">
        <div>
          <span className="px-3 py-0.5 rounded-full bg-red-500/20 text-red-300 text-[10px] font-extrabold uppercase border border-red-500/30">
            System Administration
          </span>
          <h1 className="text-2xl font-extrabold mt-1">National Portal Control Center</h1>
          <p className="text-xs text-slate-300">Global metrics, access role management, and service configuration.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.map((m, i) => (
          <div key={i} className="bg-surface dark:bg-slate-900 p-5 rounded-2xl border border-outline-variant/30 shadow-xs space-y-1">
            <p className="text-xs text-slate-400 font-medium">{m.title}</p>
            <p className="text-2xl font-extrabold text-institutional-navy dark:text-white">{m.val}</p>
            <p className="text-[11px] font-bold text-emerald-600">{m.change}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
