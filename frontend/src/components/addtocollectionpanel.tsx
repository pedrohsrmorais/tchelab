/**
 * Componente a ser inserido na sidebar de /spectra/$id.tsx
 * na mesma posição do painel "Adicionar a dataset".
 *
 * Dependências já presentes no projeto:
 *   collectionsApi — importar de @/lib/api
 *   Collection     — tipo de @/lib/api
 *   toast          — de sonner
 *
 * Uso:
 *   <AddToCollectionPanel spectrumId={spectrum.id} />
 */

import { useEffect, useState } from "react";
import { FolderOpen, Plus, Check, ChevronDown, Loader2, X } from "lucide-react";
import { Button, Field, Input, Select } from "@/components/ui-kit";
import { collectionsApi } from "@/lib/api";
import type { Collection, Visibility } from "@/lib/api";
import { toast } from "sonner";

export function AddToCollectionPanel({ spectrumId }: { spectrumId: number }) {
  const [collections,  setCollections]  = useState<Collection[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [selectedId,   setSelectedId]   = useState<string>("");
  const [adding,       setAdding]       = useState(false);
  const [showCreate,   setShowCreate]   = useState(false);
  const [addedIds,     setAddedIds]     = useState<Set<number>>(new Set());

  // Campos para criar nova coleção inline
  const [newName,       setNewName]       = useState("");
  const [newVisibility, setNewVisibility] = useState<Visibility>("private");
  const [creating,      setCreating]      = useState(false);

  useEffect(() => {
    collectionsApi.listMine({ limit: 100 })
      .then(({ data }) => {
        setCollections(data.data);
        if (data.data.length > 0) setSelectedId(String(data.data[0].id));
      })
      .catch(() => toast.error("Erro ao carregar coleções."))
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd() {
    if (!selectedId) return;
    setAdding(true);
    try {
      await collectionsApi.addSpectrum(selectedId, spectrumId);
      toast.success("Espectro adicionado à coleção.");
      setAddedIds((prev) => new Set([...prev, Number(selectedId)]));
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? "Erro ao adicionar à coleção.";
      toast.error(msg);
    } finally {
      setAdding(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) { toast.error("Informe um nome para a coleção."); return; }
    setCreating(true);
    try {
      const { data } = await collectionsApi.create({
        name: newName.trim(),
        visibility: newVisibility,
      });
      const created = data.collection;
      setCollections((prev) => [created, ...prev]);
      setSelectedId(String(created.id));
      setNewName("");
      setShowCreate(false);
      toast.success(`Coleção "${created.name}" criada.`);
    } catch {
      toast.error("Erro ao criar coleção.");
    } finally {
      setCreating(false);
    }
  }

  const isAdded = addedIds.has(Number(selectedId));

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      {/* Cabeçalho */}
      <div className="flex items-center gap-2 mb-1">
        <FolderOpen className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Adicionar a coleção</span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
        </div>
      ) : (
        <>
          {collections.length === 0 && !showCreate ? (
            <p className="text-xs text-muted-foreground">
              Você não tem coleções ainda.
            </p>
          ) : (
            !showCreate && (
              <div className="flex gap-2">
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="flex-1 h-9 rounded-lg border border-border bg-muted/30 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
                >
                  {collections.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name} ({c.spectra_count})
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  onClick={handleAdd}
                  disabled={adding || !selectedId || isAdded}
                  variant={isAdded ? "outline" : "default"}
                >
                  {adding
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : isAdded
                    ? <><Check className="h-4 w-4 text-emerald-500" /> Adicionado</>
                    : "Adicionar"}
                </Button>
              </div>
            )
          )}

          {/* Criar nova coleção inline */}
          {showCreate ? (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Nova coleção</span>
                <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome da coleção…"
                autoFocus
                className="w-full h-9 rounded-lg border border-border bg-muted/30 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
              />
              <select
                value={newVisibility}
                onChange={(e) => setNewVisibility(e.target.value as Visibility)}
                className="w-full h-9 rounded-lg border border-border bg-muted/30 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
              >
                <option value="private">Privado</option>
                <option value="public">Público</option>
              </select>
              <div className="flex gap-2 justify-end pt-1">
                <Button size="sm" variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleCreate} disabled={creating}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar e selecionar"}
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Nova coleção
            </button>
          )}
        </>
      )}
    </div>
  );
}