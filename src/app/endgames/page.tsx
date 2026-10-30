import type { Metadata } from 'next';
import { EndgameHub } from '@/components/endgames/EndgameHub';

export const metadata: Metadata = {
  title: 'Эндшпиль',
  description: 'Практика эндшпиля: реализация перевеса, активная защита и точная техника с доигрыванием против движка.',
};
export default function EndgamesPage() { return <EndgameHub />; }
