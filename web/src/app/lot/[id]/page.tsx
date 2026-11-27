"use client";
import { LotPage } from "@/components/pages/LotPage";
export default function Page({ params }: { params: { id: string } }) { return <LotPage id={params.id} />; }
