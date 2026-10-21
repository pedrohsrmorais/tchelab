import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../hooks/useApi';
import { api } from '../api';
import EmptyState from '../components/ui/EmptyState';
import { TechniqueDetails } from '../components/ui/TechniqueModal';

export default function CatalogDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { data, loading } = useApi(() => api.techniques.get(id), [id]);
  const tech = data?.data ?? data ?? null;

  if (loading) {
    return <div className="anim-shimmer" style={{ height: 300, borderRadius: 16 }} />;
  }
  if (!tech) {
    return <EmptyState icon={BookOpen} title={t('catalog.notFound')} description={t('catalog.notFoundDesc')} />;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Link to="/catalogo" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" /> {t('catalog.backToCatalog')}
      </Link>
      <TechniqueDetails technique={tech} showFullLink={false} />
    </div>
  );
}
