// configuracoes.tsx

import { createFileRoute } from "@tanstack/react-router";
import { Card, PageHeader, Field, Input, Select, Button } from "@/components/ui-kit";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — TcheLab" }] }),
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader title="Configurações" subtitle="Preferências da conta, notificações e privacidade." />
      <div className="space-y-6">
        <Card className="p-6">
          <h2 className="font-display font-semibold mb-4">Conta</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="E-mail"><Input type="email" defaultValue="mariana.costa@ufrgs.br" /></Field>
            <Field label="Idioma"><Select><option>Português (Brasil)</option><option>English</option></Select></Field>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="font-display font-semibold mb-4">Privacidade padrão</h2>
          <Field label="Visibilidade padrão de novos modelos">
            <Select><option>Privado</option><option>Público</option></Select>
          </Field>
        </Card>

        <Card className="p-6">
          <h2 className="font-display font-semibold mb-4">Notificações</h2>
          {["Quando alguém clonar meu método", "Quando uma análise terminar", "Resumo semanal da comunidade"].map((n, i) => (
            <label key={n} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
              <span className="text-sm">{n}</span>
              <input type="checkbox" defaultChecked={i !== 2} className="accent-primary h-4 w-4" />
            </label>
          ))}
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline">Cancelar</Button>
          <Button>Salvar</Button>
        </div>
      </div>
    </>
  );
}
