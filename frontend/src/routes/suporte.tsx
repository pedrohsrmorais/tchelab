import { createFileRoute } from "@tanstack/react-router";
import { LifeBuoy } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui-kit";

export const Route = createFileRoute("/suporte")({
  head: () => ({ meta: [{ title: "Suporte — TcheLab" }] }),
  component: () => (
    <>
      <PageHeader title="Suporte" subtitle="Abra tickets e fale com a equipe TcheLab." />
      <EmptyState icon={<LifeBuoy className="h-7 w-7" />} title="Em desenvolvimento" description="O sistema de tickets de suporte estará disponível em breve." />
    </>
  ),
});
