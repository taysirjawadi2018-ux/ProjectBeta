'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function MfaPage() {
  const router = useRouter();
  const [code, setCode] = useState(['4', '8', '2', '9', '1', '6']);
  const [loading, setLoading] = useState(false);

  const handleVerify = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      router.push('/dashboard');
    }, 600);
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12 bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-md bg-surface dark:bg-slate-900 rounded-2xl p-8 border border-outline-variant/30 shadow-xl space-y-6 text-center">
        <div className="inline-flex p-3.5 rounded-2xl bg-emerald-500/10 text-emerald-600 mb-2">
          <span className="material-symbols-outlined text-4xl">verified_user</span>
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-institutional-navy dark:text-white">
            Two-Factor Security Verification
          </h1>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            We have sent a 6-digit verification code to your registered mobile phone <strong className="text-slate-800 dark:text-slate-200">+216 98 *** *89</strong>.
          </p>
        </div>

        <form onSubmit={handleVerify} className="space-y-6">
          <div className="flex justify-center gap-2">
            {code.map((digit, idx) => (
              <input
                key={idx}
                type="text"
                maxLength={1}
                value={digit}
                onChange={(e) => {
                  const newCode = [...code];
                  newCode[idx] = e.target.value;
                  setCode(newCode);
                }}
                className="w-11 h-12 text-center text-lg font-extrabold rounded-xl border border-outline-variant bg-background dark:bg-slate-800 text-on-background focus:ring-2 focus:ring-midnight-navy outline-none"
              />
            ))}
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
                <span>Confirm Code & Enter Portal</span>
                <span className="material-symbols-outlined text-sm">login</span>
              </>
            )}
          </button>
        </form>

        <p className="text-xs text-slate-400">
          Didn't receive the SMS code?{' '}
          <button onClick={() => alert('New code sent to your phone!')} className="font-bold text-mediterranean-cerulean hover:underline">
            Resend SMS Code
          </button>
        </p>
      </div>
    </div>
  );
}
