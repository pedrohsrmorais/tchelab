import { createFileRoute } from "@tanstack/react-router";
import { Smartphone } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui-kit";

export const Route = createFileRoute("/mobile")({
  head: () => ({ meta: [{ title: "Versão mobile — TcheLab" }] }),
  component: () => (
    <>
      <PageHeader title="Versão mobile" subtitle="Acesso pelo celular para análises rápidas em campo." />
      <EmptyState icon={<Smartphone className="h-7 w-7" />} title="Em desenvolvimento" description="O app mobile do TcheLab está em construção." />
    </>
  ),
});
