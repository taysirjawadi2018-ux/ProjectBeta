'use client';

export default function ProfilePage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="border-b border-outline-variant/30 pb-4">
        <h1 className="text-2xl font-extrabold text-institutional-navy dark:text-white">Citizen Identity Profile</h1>
        <p className="text-xs text-on-surface-variant mt-1">Verified civil details linked to your National ID card.</p>
      </div>

      <div className="bg-surface dark:bg-slate-900 rounded-2xl p-6 border border-outline-variant/30 shadow-xs space-y-6">
        <div className="flex items-center gap-4 border-b border-outline-variant/20 pb-6">
          <div className="w-16 h-16 rounded-2xl bg-midnight-navy text-accent-gold font-extrabold text-2xl flex items-center justify-center border border-accent-gold/40">
            YB
          </div>
          <div>
            <h2 className="text-xl font-bold text-institutional-navy dark:text-white">Youssef Ben Ammar</h2>
            <p className="text-xs text-slate-400 font-mono">CIN: 08123456 • Verified Digital Signature</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block text-slate-400 font-medium mb-1">Full Legal Name (Latin)</label>
            <input type="text" readOnly value="Youssef Ben Ammar" className="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface font-semibold" />
          </div>
          <div>
            <label className="block text-slate-400 font-medium mb-1">Full Legal Name (Arabic)</label>
            <input type="text" readOnly value="يوسف بن عمار" className="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface font-semibold text-right" />
          </div>
          <div>
            <label className="block text-slate-400 font-medium mb-1">Date & Place of Birth</label>
            <input type="text" readOnly value="14 March 1990 • Tunis" className="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface font-semibold" />
          </div>
          <div>
            <label className="block text-slate-400 font-medium mb-1">Registered Phone</label>
            <input type="text" readOnly value="+216 98 123 456" className="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface font-semibold" />
          </div>
        </div>
      </div>
    </div>
  );
}
