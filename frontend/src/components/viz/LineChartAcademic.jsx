import { useRef, useImperativeHandle, forwardRef } from 'react';
import { Plot, downloadPlot } from './plotly';
import { academicLayout, ACADEMIC_CONFIG, ACADEMIC_COLORWAY, LINE_DASHES, MARKER_SYMBOLS } from './chartTheme';

/**
 * Gráfico de linha/espectro no padrão de publicação científica.
 *
 * - Fundo branco fixo, fonte sans-serif, eixos com título e unidade.
 * - Cada série recebe cor + estilo de traço (sólido/tracejado/pontilhado...)
 *   diferente ciclicamente, pra permanecer legível impressa em P&B — é o
 *   que uma revista cobra e o canvas caseiro anterior não fazia (só cor).
 * - markers=true liga marcadores nos pontos (útil quando há poucos pontos
 *   por série, ex: curva de calibração) — com poucas séries e muitos
 *   pontos (ex: espectro), fica melhor off (linha contínua).
 * - exportável via ref.exportImage({format:'png'|'svg', filename}).
 *
 * @param {{label:string, x?:number[], y:number[], color?:string}[]} series
 */
export const LineChartAcademic = forwardRef(function LineChartAcademic(
  { series, xTitle, yTitle, title, markers = false, xType = 'linear', yType = 'linear', showLegend },
  ref
) {
  const gdRef = useRef(null);

  useImperativeHandle(ref, () => ({
    exportImage: (opts) => downloadPlot(gdRef.current, { filename: 'chart', ...opts }),
  }), []);

  const data = (series || []).map((s, i) => {
    const trace = {
      type: 'scatter',
      mode: markers ? 'lines+markers' : 'lines',
      name: s.label,
      x: s.x ?? s.values?.map((_, idx) => idx) ?? [],
      y: s.y ?? s.values ?? [],
      line: {
        color: s.color || ACADEMIC_COLORWAY[i % ACADEMIC_COLORWAY.length],
        width: 2,
        dash: LINE_DASHES[i % LINE_DASHES.length],
      },
      hovertemplate: `${s.label}<br>${xTitle || 'x'}: %{x}<br>${yTitle || 'y'}: %{y:.6g}<extra></extra>`,
    };
    // IMPORTANTE: só inclui a chave "marker" quando markers=true. O Plotly
    // (cleanData) faz `"marker" in trace` pra decidir se deve inspecionar
    // trace.marker.line — a chave existir com valor `undefined` já é o
    // suficiente pra ele tentar `"line" in undefined` e estourar um
    // TypeError (silenciosamente engolido pelo react-plotly.js se não há
    // onError, derrubando o gráfico inteiro). Por isso nunca setar
    // `marker: undefined`, e sim omitir a chave.
    if (markers) {
      trace.marker = {
        color: s.color || ACADEMIC_COLORWAY[i % ACADEMIC_COLORWAY.length],
        symbol: MARKER_SYMBOLS[i % MARKER_SYMBOLS.length],
        size: 6,
      };
    }
    return trace;
  });

  const layout = academicLayout({
    title, xTitle, yTitle,
    showLegend: showLegend ?? (series?.length > 1),
    extraXAxis: xType === 'log' ? { type: 'log' } : undefined,
    extraYAxis: yType === 'log' ? { type: 'log' } : undefined,
  });

  return (
    <Plot
      data={data}
      layout={layout}
      config={ACADEMIC_CONFIG}
      style={{ width: '100%', height: '100%' }}
      useResizeHandler
      onInitialized={(_, gd) => { gdRef.current = gd; }}
      onUpdate={(_, gd) => { gdRef.current = gd; }}
      onError={(err) => console.error('[LineChartAcademic] Plotly error:', err)}
    />
  );
});

export default LineChartAcademic;
