import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../hooks/useApi';
import { api } from '../api';
import EmptyState from '../components/ui/EmptyState';
import { TechniqueDetails } from '../components/ui/TechniqueModal';

export default function CatalogDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const lang = String(i18n.language || 'pt').slice(0, 2);
  // refaz a busca ao trocar de idioma: a API devolve os textos já traduzidos
  const { data, loading } = useApi(() => api.techniques.get(id, { lang }), [id, lang]);
  const tech = data?.data ?? data ?? null;

  if (loading) {
    return <div className="anim-shimmer" style={{ height: 300, borderRadius: 16 }} />;
  }
  if (!tech) {
    return <EmptyState icon={BookOpen} title={t('catalog.notFound')} description={t('catalog.notFoundDesc')} />;
  }

  return (
    <div className="space-y-4 max-w-3xl" data-testid="catalog-detail">
      <Link to="/catalogo" className="btn-ghost inline-flex items-center gap-1.5 text-sm" style={{ textDecoration: 'none' }}>
        <ArrowLeft className="w-4 h-4" /> {t('catalog.backToCatalog')}
      </Link>
      <TechniqueDetails technique={tech} showFullLink={false} />
    </div>
  );
}
