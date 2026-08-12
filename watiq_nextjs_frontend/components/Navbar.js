'use client';

import Link from 'next/link';
import Logo from './Logo';
import A11yControls from './A11yControls';
import { useState } from 'react';

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [lang, setLang] = useState('FR');

  return (
    <header className="sticky top-0 z-50 bg-surface/95 dark:bg-slate-900/95 backdrop-blur border-b border-outline-variant/30 shadow-xs">
      {/* Top Utility Bar */}
      <div className="bg-midnight-navy text-white text-xs py-1.5 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Official Republic Portal
            </span>
            <span className="hidden md:inline text-slate-300">|</span>
            <span className="hidden md:inline text-slate-300">Secure 256-Bit Encrypted BFF</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 font-semibold">
              {['FR', 'AR', 'EN'].map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    lang === l ? 'bg-accent-gold text-midnight-navy font-bold' : 'hover:bg-white/10 text-slate-300'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            <span className="text-slate-500">|</span>
            <A11yControls />
          </div>
        </div>
      </div>

      {/* Main Navbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <Logo />

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-6 font-medium text-sm text-on-surface">
          <Link href="/" className="hover:text-mediterranean-cerulean transition-colors py-1">
            Services
          </Link>
          <Link href="/dashboard" className="hover:text-mediterranean-cerulean transition-colors py-1">
            Citizen Dashboard
          </Link>
          <Link href="/requests" className="hover:text-mediterranean-cerulean transition-colors py-1">
            My Requests
          </Link>
          <Link href="/appointments" className="hover:text-mediterranean-cerulean transition-colors py-1">
            Appointments
          </Link>
          <Link href="/documents" className="hover:text-mediterranean-cerulean transition-colors py-1">
            Documents
          </Link>
          <Link href="/staff/workbench" className="text-accent-gold dark:text-amber-400 font-semibold hover:underline py-1">
            Staff Portal
          </Link>
          <Link href="/admin" className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 py-1">
            Admin
          </Link>
        </nav>

        {/* Right CTA / User actions */}
        <div className="hidden sm:flex items-center gap-3">
          <Link
            href="/notifications"
            className="p-2 text-on-surface hover:bg-surface-container rounded-lg relative transition-colors"
            title="Notifications"
          >
            <span className="material-symbols-outlined text-xl">notifications</span>
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-error"></span>
          </Link>

          <Link
            href="/login"
            className="px-4 py-2 text-sm font-semibold text-midnight-navy dark:text-white border border-outline-variant hover:bg-surface-container rounded-lg transition-colors"
          >
            Log In
          </Link>

          <Link
            href="/requests/submit"
            className="px-4 py-2 text-sm font-semibold text-white bg-midnight-navy hover:bg-slate-800 dark:bg-accent-gold dark:text-midnight-navy rounded-lg shadow-sm transition-all"
          >
            Submit Request
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="lg:hidden p-2 text-on-surface hover:bg-surface-container rounded-lg"
          aria-label="Toggle Menu"
        >
          <span className="material-symbols-outlined">{mobileMenuOpen ? 'close' : 'menu'}</span>
        </button>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-outline-variant/30 bg-surface dark:bg-slate-900 px-4 py-4 space-y-3">
          <Link href="/" className="block py-2 text-sm font-semibold text-on-surface hover:text-mediterranean-cerulean">
            Services Catalog
          </Link>
          <Link href="/dashboard" className="block py-2 text-sm font-semibold text-on-surface hover:text-mediterranean-cerulean">
            Citizen Dashboard
          </Link>
          <Link href="/requests" className="block py-2 text-sm font-semibold text-on-surface hover:text-mediterranean-cerulean">
            My Requests
          </Link>
          <Link href="/appointments" className="block py-2 text-sm font-semibold text-on-surface hover:text-mediterranean-cerulean">
            Appointments
          </Link>
          <Link href="/documents" className="block py-2 text-sm font-semibold text-on-surface hover:text-mediterranean-cerulean">
            Documents Repository
          </Link>
          <Link href="/staff/workbench" className="block py-2 text-sm font-semibold text-accent-gold">
            Staff Workbench
          </Link>
          <Link href="/admin" className="block py-2 text-sm font-semibold text-slate-500">
            Admin Portal
          </Link>
          <div className="pt-3 border-t border-outline-variant/30 flex gap-2">
            <Link
              href="/login"
              className="flex-1 text-center py-2 text-sm font-semibold border border-outline-variant rounded-lg"
            >
              Log In
            </Link>
            <Link
              href="/requests/submit"
              className="flex-1 text-center py-2 text-sm font-semibold bg-midnight-navy text-white rounded-lg"
            >
              New Request
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
