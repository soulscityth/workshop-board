import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Board from "@/components/Board";
import { getBoard } from "@/lib/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const board = await getBoard(slug);
  return { title: board ? `${board.title} · บอร์ดเวิร์กช็อป` : "ไม่พบบอร์ด", robots: { index: false } };
}

export default async function BoardPage({ params }: Props) {
  const { slug } = await params;
  const board = await getBoard(slug);
  if (!board) notFound();
  // Never pass admin data to the client here; the admin key only lives in the facilitator's URL.
  return <Board slug={board.slug} initialTitle={board.title} />;
}
