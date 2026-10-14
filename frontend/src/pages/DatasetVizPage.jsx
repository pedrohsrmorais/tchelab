import React, { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Database } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../hooks/useApi';
import { api } from '../api';
import SkeletonCard from '../components/ui/SkeletonCard';
import EmptyState from '../components/ui/EmptyState';
import { VizWorkspace } from '../components/datasets/MultiDimModal';

/**
 * Página própria (rota) de visualização multidimensional — mesmo motor do
 * MultiDimModal (VizWorkspace), mas fora de um modal fullscreen: útil para
 * quem quer manter a visualização aberta numa aba/janela separada, com URL
 * própria pra compartilhar ou favoritar.
 */
export default function DatasetVizPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: raw, loading, error } = useApi(() => api.datasets.get(id), [id]);
  const ds = useMemo(() => raw?.data ?? raw, [raw]);

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard className="h-16" />
        <SkeletonCard className="h-96" />
      </div>
    );
  }

  if (error || !ds) {
    return (
      <EmptyState
        icon={Database}
        title={t('viz.notFound')}
        description={t('datasets.detail.notFoundDesc')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/datasets/${id}`)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            <ArrowLeft className="w-3.5 h-3.5" />
            {t('viz.backToDataset')}
          </button>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              {t('viz.pageTitle')}
            </h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{ds.name}</p>
          </div>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('viz.academicNote')}</p>
      </div>

      <div
        className="rounded-xl p-4"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', height: 'calc(100vh - 220px)', minHeight: 480 }}>
        <VizWorkspace dataset={ds} />
      </div>
    </div>
  );
}
