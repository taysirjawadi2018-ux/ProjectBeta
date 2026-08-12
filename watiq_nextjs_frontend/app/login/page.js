'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [cin, setCin] = useState('08123456');
  const [password, setPassword] = useState('••••••••••••');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      router.push('/mfa');
    }, 600);
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12 bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-md bg-surface dark:bg-slate-900 rounded-2xl p-8 border border-outline-variant/30 shadow-xl space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 rounded-2xl bg-midnight-navy/10 text-midnight-navy dark:text-accent-gold mb-2">
            <span className="material-symbols-outlined text-3xl">lock</span>
          </div>
          <h1 className="text-2xl font-bold text-institutional-navy dark:text-white">
            Citizen Authentication
          </h1>
          <p className="text-xs text-on-surface-variant">
            Enter your National ID (CIN) and password to access official services.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-on-surface mb-1">
              National ID Number (CIN)
            </label>
            <input
              type="text"
              required
              value={cin}
              onChange={(e) => setCin(e.target.value)}
              placeholder="e.g. 08123456"
              className="w-full px-4 py-2.5 rounded-lg border border-outline-variant text-sm bg-background dark:bg-slate-800 text-on-background focus:ring-2 focus:ring-midnight-navy outline-none"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-bold text-on-surface">Password</label>
              <Link href="/password_reset" className="text-xs text-mediterranean-cerulean hover:underline">
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-outline-variant text-sm bg-background dark:bg-slate-800 text-on-background focus:ring-2 focus:ring-midnight-navy outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-midnight-navy hover:bg-slate-800 text-white dark:bg-accent-gold dark:text-midnight-navy font-bold rounded-lg shadow-md transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="animate-spin text-lg">⏳</span>
            ) : (
              <>
                <span>Authenticate & Proceed</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </>
            )}
          </button>
        </form>

        <div className="text-center pt-4 border-t border-outline-variant/30 text-xs text-on-surface-variant space-y-2">
          <p>
            Don't have a digital citizen profile yet?{' '}
            <Link href="/register" className="font-bold text-mediterranean-cerulean hover:underline">
              Register Here
            </Link>
          </p>
          <div className="flex justify-center gap-4 text-[11px] text-slate-400">
            <span>🔒 TLS 1.3 Encrypted</span>
            <span>•</span>
            <span>2FA Verified</span>
          </div>
        </div>
      </div>
    </div>
  );
}
