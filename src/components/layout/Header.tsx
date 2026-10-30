'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Moon, Sun, Volume2, VolumeX } from 'lucide-react';
import { isAudioMuted, toggleAudio } from '@/lib/audioSynth';
import { BrandMark } from '@/components/brand/BrandMark';
import { useTheme } from './ThemeProvider';
import { PracticeStreak } from './PracticeStreak';
import { HudBridgeControl } from '@/components/chess/HudBridgeControl';
import '@/components/catalog/course-home.css';

export function Header() {
  const [muted, setMuted] = useState(false);
  const { theme, toggleTheme } = useTheme();
  useEffect(() => setMuted(isAudioMuted()), []);
  return (
    <header className="home-header">
      <div className="home-header-inner">
        <Link href="/" className="home-brand" aria-label="nonchalant — на главную">
          <BrandMark className="home-brand-mark" />
          <span className="home-wordmark">nonchalant</span>
        </Link>
        <nav className="home-header-nav" aria-label="Основная навигация">
          <Link href="/#chapters">Атака</Link>
          <Link href="/train">Практика</Link>
          <Link href="/endgames">Эндшпиль</Link>
          <Link href="/analysis">Анализ</Link>
        </nav>
        <div className="home-header-controls">
          <HudBridgeControl />
          <PracticeStreak />
          <button type="button" className="home-theme" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'} aria-pressed={theme === 'dark'} title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}>
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}<span>{theme === 'dark' ? 'Светлая' : 'Тёмная'}</span>
          </button>
          <button type="button" className="home-sound" onClick={() => setMuted(toggleAudio())}
            aria-label={muted ? 'Включить звук' : 'Выключить звук'} aria-pressed={!muted}
            title={muted ? 'Включить звук ходов' : 'Выключить звук ходов'}>
            {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
            <span>Звук {muted ? 'выкл.' : 'вкл.'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
export default Header;
