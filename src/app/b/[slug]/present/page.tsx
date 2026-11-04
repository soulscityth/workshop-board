import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Display from "@/components/Display";
import { getBoard } from "@/lib/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const board = await getBoard(slug);
  return { title: board ? `จอแสดงผล · ${board.title}` : "ไม่พบบอร์ด", robots: { index: false } };
}

export default async function PresentPage({ params }: Props) {
  const { slug } = await params;
  const board = await getBoard(slug);
  if (!board) notFound();
  return <Display slug={board.slug} initialTitle={board.title} />;
}
