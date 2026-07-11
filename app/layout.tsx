import type { Metadata } from 'next';
import { Schibsted_Grotesk, Hanken_Grotesk, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

// Self-hosted via next/font (no runtime request to Google Fonts — local-first).
// Schibsted Grotesk and Hanken Grotesk are loaded as variable fonts (weight
// omitted = variable axis 400-900/100-900), matching the arbitrary weights
// already used in workbench.css (e.g. font-weight: 650, 750). IBM Plex Mono
// has no variable axis in the Google Fonts catalog, so it's pinned to the
// single static weight (400) that colors_and_type.css / workbench.css use.
const schibstedGrotesk = Schibsted_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--nf-display',
});

const hankenGrotesk = Hanken_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--nf-text',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--nf-mono',
});

export const metadata: Metadata = {
  title: 'Personal finance — workbench',
  description: 'Local-first Gmail-backed personal finance workbench.',
  icons: { icon: '/assets/logo-icon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${schibstedGrotesk.variable} ${hankenGrotesk.variable} ${ibmPlexMono.variable}`}
    >
      {/* suppressHydrationWarning: browser extensions (e.g. Grammarly) inject
          attributes onto <body> before hydration; ignore that one mismatch. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
