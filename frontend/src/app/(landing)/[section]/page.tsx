import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Landing } from "@/components/landing/Landing";
import { SECTIONS, sectionFromPath } from "@/components/landing/sections";

export function generateStaticParams() {
  return Object.values(SECTIONS).map((s) => ({ section: s.path }));
}

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }): Promise<Metadata> {
  const id = sectionFromPath((await params).section);
  return id ? { title: SECTIONS[id].title } : {};
}

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const id = sectionFromPath((await params).section);
  if (!id) notFound();
  return <Landing section={id} />;
}
