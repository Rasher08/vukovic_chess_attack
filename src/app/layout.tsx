import type { Metadata } from 'next';
import './globals.css';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { themeInitScript } from '@/lib/theme';

export const metadata: Metadata = {
  title: {
    default: 'nonchalant — шахматный практикум',
    template: '%s | nonchalant',
  },
  description: 'Самостоятельный шахматный практикум: атака, техника эндшпиля и анализ своих партий. Выбор плана, игра против сильной защиты и отложенные повторы.',
  icons: { icon: '/icon.svg' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInitScript }} /></head>
      <body className="min-h-screen flex flex-col antialiased">
        <ThemeProvider>
        <Header />
        <main className="flex-1 flex flex-col">{children}</main>
        <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
