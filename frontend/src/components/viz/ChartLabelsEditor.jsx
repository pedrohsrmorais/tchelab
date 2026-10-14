import { useTranslation } from 'react-i18next';
import { Type } from 'lucide-react';

/**
 * Barra compacta de campos editáveis (título do gráfico, rótulo X, rótulo Y,
 * rótulo da barra de cor) que fica acima do gráfico em si. É o que falta pra
 * um gráfico sair do "índice numérico da dimensão" e virar uma figura de
 * verdade ("Comprimento de onda (nm)" em vez de "dim 2").
 *
 * Os valores não são persistidos automaticamente — quem usa decide se quer
 * guardar (ex: DatasetVizPage pode salvar na URL/local, MultiDimModal pode
 * deixar só na sessão do modal).
 */
export function ChartLabelsEditor({ title, onTitleChange, xTitle, onXTitleChange, yTitle, onYTitleChange, colorbarTitle, onColorbarTitleChange }) {
  const { t } = useTranslation();
  const fieldStyle = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '0.3rem 0.5rem',
    fontSize: '0.75rem',
    color: 'var(--text-primary)',
    minWidth: 0,
  };
  return (
    <div className="flex flex-wrap items-center gap-2" style={{ color: 'var(--text-muted)' }}>
      <Type className="w-3.5 h-3.5 flex-shrink-0" />
      <input
        value={title ?? ''}
        onChange={e => onTitleChange(e.target.value)}
        placeholder={t('viz.chartTitlePlaceholder')}
        style={{ ...fieldStyle, width: 200, fontWeight: 600 }}
      />
      <input
        value={xTitle ?? ''}
        onChange={e => onXTitleChange(e.target.value)}
        placeholder={t('viz.xAxisPlaceholder')}
        style={{ ...fieldStyle, width: 160 }}
      />
      <input
        value={yTitle ?? ''}
        onChange={e => onYTitleChange(e.target.value)}
        placeholder={t('viz.yAxisPlaceholder')}
        style={{ ...fieldStyle, width: 160 }}
      />
      {onColorbarTitleChange && (
        <input
          value={colorbarTitle ?? ''}
          onChange={e => onColorbarTitleChange(e.target.value)}
          placeholder={t('viz.colorbarPlaceholder')}
          style={{ ...fieldStyle, width: 160 }}
        />
      )}
    </div>
  );
}

export default ChartLabelsEditor;
