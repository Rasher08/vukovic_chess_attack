import { getAllStudyIds, getStudyById } from '@/data/studies';
import { notFound, redirect } from 'next/navigation';
import type { ChapterId } from '@/types/chess';

// Existing bookmarks lead into the revised workbook rather than the original demo.
const chapterRoutes: Record<ChapterId, string> = {
  greek_gift: 'bishop-sacrifice',
  rook_lift: 'attacking-lines',
  pawn_demolition: 'pieces-and-pawns',
  king_hunt: 'mating-patterns',
};

export function generateStaticParams() {
  return getAllStudyIds().map((id) => ({ id }));
}

export default function StudyPage({ params }: { params: { id: string } }) {
  const study = getStudyById(params.id);
  if (!study) notFound();
  redirect(`/course/${chapterRoutes[study.chapter]}`);
}
