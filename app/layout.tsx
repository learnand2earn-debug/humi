import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jakarta',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains',
});

export const metadata: Metadata = {
  title: 'VerbaForma — Page-by-Page PDF AI Humanizer',
  description:
    'Upload any PDF to humanize AI-generated text page by page into natural human writing while locking all images, diagrams, and page layouts in their exact original positions.',
  openGraph: {
    title: 'VerbaForma — Page-by-Page PDF AI Humanizer',
    description:
      'Upload any PDF to humanize AI-generated text page by page into natural human writing while locking all images, diagrams, and page layouts in their exact original positions.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VerbaForma — Page-by-Page PDF AI Humanizer',
    description:
      'Upload any PDF to humanize AI-generated text page by page into natural human writing while locking all images, diagrams, and page layouts in their exact original positions.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${jetbrainsMono.variable}`}>
      <body
        suppressHydrationWarning
        className="min-h-screen bg-[#F8FAFC] text-slate-900 antialiased selection:bg-blue-600 selection:text-white"
        style={{ fontFamily: 'var(--font-jakarta), sans-serif' }}
      >
        {children}
      </body>
    </html>
  );
}
