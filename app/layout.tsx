import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Personal finance — workbench',
  description: 'Local-first Gmail-backed personal finance workbench.',
  icons: { icon: '/assets/logo-icon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
