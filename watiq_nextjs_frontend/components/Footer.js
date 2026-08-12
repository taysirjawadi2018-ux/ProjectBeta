import Link from 'next/link';
import Logo from './Logo';

export default function Footer() {
  return (
    <footer className="bg-midnight-navy text-white pt-12 pb-8 border-t-4 border-accent-gold mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-8 border-b border-slate-700/60">
          <div className="space-y-4">
            <Logo />
            <p className="text-xs text-slate-300 leading-relaxed">
              Watiq National Portal provides secure, digitized citizen identity, document verification, and government services.
            </p>
            <div className="flex items-center gap-2 text-xs text-accent-gold font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              API Status: Operational
            </div>
          </div>

          <div>
            <h4 className="font-bold text-sm uppercase tracking-wider text-accent-gold mb-4">Citizen Services</h4>
            <ul className="space-y-2 text-xs text-slate-300">
              <li><Link href="/requests/submit" className="hover:text-white transition-colors">Submit Procedure Request</Link></li>
              <li><Link href="/appointments" className="hover:text-white transition-colors">Book Office Visit</Link></li>
              <li><Link href="/documents" className="hover:text-white transition-colors">Digital Document Vault</Link></li>
              <li><Link href="/requests" className="hover:text-white transition-colors">Track Status</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-sm uppercase tracking-wider text-accent-gold mb-4">Portals & Staff</h4>
            <ul className="space-y-2 text-xs text-slate-300">
              <li><Link href="/staff/workbench" className="hover:text-white transition-colors">Staff Workbench</Link></li>
              <li><Link href="/staff/verify/REQ-2026-8819" className="hover:text-white transition-colors">Verification Desk</Link></li>
              <li><Link href="/staff/audit" className="hover:text-white transition-colors">Audit & Security Log</Link></li>
              <li><Link href="/admin" className="hover:text-white transition-colors">System Admin</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-sm uppercase tracking-wider text-accent-gold mb-4">Support & Legal</h4>
            <ul className="space-y-2 text-xs text-slate-300">
              <li><Link href="/faq" className="hover:text-white transition-colors">Frequently Asked Questions</Link></li>
              <li><Link href="/support" className="hover:text-white transition-colors">Help Center & Chat</Link></li>
              <li><Link href="/terms" className="hover:text-white transition-colors">Terms of Service & Privacy</Link></li>
              <li><a href="#a11y" className="hover:text-white transition-colors">Accessibility Commitment</a></li>
            </ul>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-slate-400">
          <p>© 2026 Republic National Portal (Watiq). All Rights Reserved.</p>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:underline">Privacy Policy</Link>
            <Link href="/terms" className="hover:underline">Security Protocols</Link>
            <Link href="/support" className="hover:underline">Contact Support</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
