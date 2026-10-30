import type { Metadata } from 'next';
import { GameAnalysis } from '@/components/analysis/GameAnalysis';

export const metadata: Metadata = {
  title: 'Разбор партий',
  description: 'Импорт PGN, анализ Stockfish, график оценки, точность и интересные жертвы — разбор своих шахматных партий в nonchalant.',
};

export default function AnalysisPage() {
  return <GameAnalysis />;
}
