import { useRef, useImperativeHandle, forwardRef } from 'react';
import { Plot, downloadPlot } from './plotly';
import { academicLayout, ACADEMIC_CONFIG } from './chartTheme';

/**
 * Heatmap 2D no padrão de publicação científica — fundo branco, Viridis
 * (colormap perceptualmente uniforme, padrão de fato em química analítica/
 * espectroscopia desde que o matplotlib o adotou como default em 2015) com
 * barra de cor titulada.
 *
 * @param {number[][]} z  matriz [linhas][colunas]
 * @param {(number|string)[]} [x]  rótulos do eixo X (colunas)
 * @param {(number|string)[]} [y]  rótulos do eixo Y (linhas)
 */
export const HeatmapAcademic = forwardRef(function HeatmapAcademic(
  { z, x, y, xTitle, yTitle, title, colorbarTitle },
  ref
) {
  const gdRef = useRef(null);

  useImperativeHandle(ref, () => ({
    exportImage: (opts) => downloadPlot(gdRef.current, { filename: 'heatmap', ...opts }),
  }), []);

  const data = [{
    type: 'heatmap',
    z, x, y,
    colorscale: 'Viridis',
    colorbar: {
      title: colorbarTitle ? { text: colorbarTitle, side: 'right', font: { size: 13 } } : undefined,
      outlinecolor: '#374151',
      outlinewidth: 1,
      tickfont: { size: 11 },
      thickness: 16,
    },
    hoverongaps: false,
    hovertemplate: `${xTitle || 'x'}: %{x}<br>${yTitle || 'y'}: %{y}<br>valor: %{z:.6g}<extra></extra>`,
  }];

  const layout = academicLayout({ title, xTitle, yTitle, showLegend: false });

  return (
    <Plot
      data={data}
      layout={layout}
      config={ACADEMIC_CONFIG}
      style={{ width: '100%', height: '100%' }}
      useResizeHandler
      onInitialized={(_, gd) => { gdRef.current = gd; }}
      onUpdate={(_, gd) => { gdRef.current = gd; }}
      onError={(err) => console.error('[HeatmapAcademic] Plotly error:', err)}
    />
  );
});

export default HeatmapAcademic;
