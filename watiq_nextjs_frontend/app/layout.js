import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

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
