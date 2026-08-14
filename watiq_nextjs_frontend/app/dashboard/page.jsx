'use client';

import Link from 'next/link';

export default function CitizenDashboard() {
  const citizen = {
    name: 'Youssef Ben Ammar',
    cin: '08123456',
    status: 'Verified Citizen',
    lastLogin: 'Today at 19:42 UTC',
  };

  const requests = [
    { id: 'REQ-2026-8819', service: 'Biometric Passport Renewal', date: '2026-08-10', status: 'In Review', badge: 'bg-amber-500/10 text-amber-600' },
    { id: 'REQ-2026-7731', service: 'Civil Status Extract (Birth)', date: '2026-08-01', status: 'Approved', badge: 'bg-emerald-500/10 text-emerald-600' },
    { id: 'REQ-2026-6410', service: 'National Identity Card (CIN)', date: '2026-07-22', status: 'Completed', badge: 'bg-blue-500/10 text-blue-600' },
  ];

  const appointments = [
    { id: 'APP-901', office: 'Tunis Central Municipality Office', service: 'Biometric Photo & Fingerprints', date: 'Tomorrow, Aug 14 at 10:30 AM' }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header Profile Summary */}
      <div className="bg-gradient-to-r from-midnight-navy to-institutional-navy text-white rounded-2xl p-6 sm:p-8 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold">{citizen.name}</h1>
            <span className="px-3 py-1 text-xs font-bold bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              {citizen.status}
            </span>
          </div>
          <p className="text-xs text-slate-300 flex items-center gap-4">
            <span>National CIN: <strong className="text-white font-mono">{citizen.cin}</strong></span>
            <span>•</span>
            <span>Last Login: {citizen.lastLogin}</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/requests/submit"
            className="px-4 py-2.5 bg-accent-gold text-midnight-navy font-bold text-xs rounded-xl shadow-md hover:bg-amber-300 transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">add_circle</span>
            New Service Request
          </Link>
          <Link
            href="/appointments"
            className="px-4 py-2.5 bg-white/10 text-white font-bold text-xs rounded-xl hover:bg-white/20 border border-white/20 transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">event</span>
            Schedule Visit
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-surface dark:bg-slate-900 p-6 rounded-2xl border border-outline-variant/30 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-on-surface-variant font-medium">Active Applications</p>
            <p className="text-3xl font-extrabold text-institutional-navy dark:text-white mt-1">1</p>
          </div>
          <span className="p-3 bg-amber-500/10 text-amber-600 rounded-xl">
            <span className="material-symbols-outlined text-2xl">hourglass_top</span>
          </span>
        </div>

        <div className="bg-surface dark:bg-slate-900 p-6 rounded-2xl border border-outline-variant/30 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-on-surface-variant font-medium">Verified Vault Documents</p>
            <p className="text-3xl font-extrabold text-institutional-navy dark:text-white mt-1">4</p>
          </div>
          <span className="p-3 bg-emerald-500/10 text-emerald-600 rounded-xl">
            <span className="material-symbols-outlined text-2xl">verified</span>
          </span>
        </div>

        <div className="bg-surface dark:bg-slate-900 p-6 rounded-2xl border border-outline-variant/30 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-on-surface-variant font-medium">Upcoming Appointment</p>
            <p className="text-sm font-bold text-institutional-navy dark:text-white mt-1">Aug 14, 10:30 AM</p>
          </div>
          <span className="p-3 bg-mediterranean-cerulean/10 text-mediterranean-cerulean rounded-xl">
            <span className="material-symbols-outlined text-2xl">event_available</span>
          </span>
        </div>
      </div>

      {/* Main Grid: Live Requests & Upcoming Appointments */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Live Procedures */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-institutional-navy dark:text-white">Recent Requests & Procedures</h2>
            <Link href="/requests" className="text-xs font-bold text-mediterranean-cerulean hover:underline">
              View All Requests →
            </Link>
          </div>

          <div className="bg-surface dark:bg-slate-900 rounded-2xl border border-outline-variant/30 shadow-xs overflow-hidden">
            <div className="divide-y divide-outline-variant/20">
              {requests.map((req) => (
                <div key={req.id} className="p-5 flex items-center justify-between hover:bg-surface-container/50 transition-colors">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-midnight-navy dark:text-accent-gold">{req.id}</span>
                      <span className={`px-2.5 py-0.5 text-[11px] font-bold rounded-full ${req.badge}`}>
                        {req.status}
                      </span>
                    </div>
                    <h3 className="font-bold text-sm text-institutional-navy dark:text-white">{req.service}</h3>
                    <p className="text-xs text-slate-400">Submitted on {req.date}</p>
                  </div>

                  <Link
                    href={`/requests/${req.id}`}
                    className="px-3.5 py-1.5 text-xs font-bold text-midnight-navy dark:text-white border border-outline-variant hover:bg-surface-container rounded-lg transition-colors"
                  >
                    Details
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right 1 Col: Upcoming Appointments & Quick Links */}
        <div className="space-y-6">
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-institutional-navy dark:text-white">Upcoming Visits</h2>
            <div className="bg-surface dark:bg-slate-900 p-5 rounded-2xl border border-outline-variant/30 shadow-xs space-y-4">
              {appointments.map((app) => (
                <div key={app.id} className="space-y-2">
                  <span className="px-2.5 py-0.5 text-[10px] font-bold bg-midnight-navy text-white rounded-md">
                    CONFIRMED PASS #{app.id}
                  </span>
                  <h3 className="font-bold text-sm text-institutional-navy dark:text-white">{app.service}</h3>
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">location_on</span>
                    {app.office}
                  </p>
                  <p className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">schedule</span>
                    {app.date}
                  </p>
                </div>
              ))}

              <Link
                href="/appointments"
                className="block text-center w-full py-2 bg-surface-container text-xs font-bold text-midnight-navy dark:text-white rounded-lg hover:bg-slate-200 transition-colors"
              >
                Manage Appointments
              </Link>
            </div>
          </div>

          <div className="bg-gradient-to-br from-slate-900 to-midnight-navy text-white p-5 rounded-2xl space-y-3">
            <h3 className="font-bold text-sm text-accent-gold">Need Official Support?</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Have questions regarding document authentication or fee payment receipt?
            </p>
            <Link
              href="/support/chat"
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent-gold text-midnight-navy font-bold text-xs rounded-xl shadow-md"
            >
              <span className="material-symbols-outlined text-sm">chat</span>
              Launch Support Chat
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
