import type { Metadata } from 'next';
import { TrainingHub } from '@/components/training/TrainingHub';

export const metadata: Metadata = {
  title: 'Смешанная практика',
  description: 'Длительная шахматная практика со скрытой темой, самостоятельным расчётом и интервальными повторениями.',
};

export default function TrainingPage() {
  return <TrainingHub />;
}
