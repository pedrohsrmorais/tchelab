import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Compass, FlaskConical, Microscope, Database } from "lucide-react";
import { Card, PageHeader } from "@/components/ui-kit";

export const Route = createFileRoute("/instrucoes")({
  head: () => ({ meta: [{ title: "Instruções — TcheLab" }, { name: "description", content: "Como usar a plataforma TcheLab — guia rápido de quimiometria e análise espectral." }] }),
  component: Page,
});

const steps = [
  { icon: Database, title: "1. Envie seus dados", text: "Vá em Datasets e envie um CSV/XLSX com seus espectros. Cada linha é uma amostra, cada coluna um número de onda/comprimento." },
  { icon: FlaskConical, title: "2. Construa um modelo", text: "Em Modelagem Clássica ou ML, escolha o algoritmo, o dataset, o pré-processamento e os parâmetros." },
  { icon: Microscope, title: "3. Aplique a novas amostras", text: "Use o módulo Análise para predizer valores ou classes em novos espectros." },
  { icon: Compass, title: "4. Compartilhe e descubra", text: "Publique modelos no feed Explorar ou clone métodos de outros pesquisadores." },
];

function Page() {
  return (
    <>
      <PageHeader title="Instruções" subtitle="Como usar a plataforma TcheLab em quatro passos." />
      <Card className="p-6 mb-6 flex items-center gap-4 bg-gradient-to-r from-primary-soft to-accent/10 border-primary/20">
        <BookOpen className="h-10 w-10 text-primary shrink-0" />
        <div>
          <h2 className="font-display font-semibold">Bem-vindo(a) ao TcheLab</h2>
          <p className="text-sm text-muted-foreground">Uma plataforma colaborativa para quimiometria moderna — do pré-processamento à publicação.</p>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {steps.map((s) => (
          <Card key={s.title} className="p-5">
            <div className="h-10 w-10 rounded-xl bg-primary-soft text-primary grid place-items-center mb-3">
              <s.icon className="h-5 w-5" />
            </div>
            <h3 className="font-display font-semibold">{s.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{s.text}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
