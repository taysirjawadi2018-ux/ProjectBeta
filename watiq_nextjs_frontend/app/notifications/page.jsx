'use client';

export default function NotificationsPage() {
  const alerts = [
    { title: 'Passport Renewal Update', msg: 'Your application REQ-2026-8819 has passed Stage 1 verification.', time: '2 hours ago', unread: true },
    { title: 'Appointment Reminder', msg: 'Your appointment at Tunis Central Municipality is tomorrow at 10:30 AM.', time: '1 day ago', unread: false },
    { title: 'Payment Receipt Issued', msg: 'Fiscal stamp payment of 60.000 TND confirmed for REQ-2026-8819.', time: '2 days ago', unread: false },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex justify-between items-center border-b border-outline-variant/30 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-institutional-navy dark:text-white">Notification Center</h1>
          <p className="text-xs text-on-surface-variant mt-1">Official system notifications, application updates, and visit alerts.</p>
        </div>
        <button onClick={() => alert('All marked as read')} className="text-xs font-bold text-mediterranean-cerulean hover:underline">
          Mark All as Read
        </button>
      </div>

      <div className="space-y-3">
        {alerts.map((a, i) => (
          <div
            key={i}
            className={`p-5 rounded-2xl border transition-all flex items-start justify-between gap-4 ${
              a.unread
                ? 'bg-surface dark:bg-slate-900 border-accent-gold/60 shadow-sm'
                : 'bg-surface-container/50 border-outline-variant/30'
            }`}
          >
            <div className="flex items-start gap-3">
              <span className={`p-2 rounded-xl text-lg ${a.unread ? 'bg-accent-gold/20 text-midnight-navy dark:text-accent-gold' : 'bg-surface-container text-slate-400'}`}>
                <span className="material-symbols-outlined">notifications</span>
              </span>
              <div className="space-y-1">
                <h3 className="font-bold text-sm text-institutional-navy dark:text-white">{a.title}</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">{a.msg}</p>
                <p className="text-[11px] text-slate-400">{a.time}</p>
              </div>
            </div>
            {a.unread && (
              <span className="w-2.5 h-2.5 rounded-full bg-accent-gold flex-shrink-0 mt-2"></span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
