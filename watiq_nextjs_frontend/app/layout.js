import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

// Applies to every route beneath this layout, which is all of them.
//
// Two reasons, either of which is sufficient. The BFF renders per request —
// session, locale, theme and text scale all come from cookies — so a
// prerendered page would be one citizen's view served to the next. And the CSP
// nonce in middleware.js only reaches <script> tags that are rendered at
// request time: a statically prerendered page keeps the build-time HTML, whose
// scripts carry no nonce, and the browser refuses all of them. That failure is
// a blank page with a console error and nothing in the server log.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Watiq National Portal — Republic Government Services',
  description: 'Official digitized citizen services, procedures, document verification, and appointment booking portal.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr" className="h-full scroll-smooth">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className="flex flex-col min-h-screen bg-background text-on-background antialiased">
        <Navbar />
        <main className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
