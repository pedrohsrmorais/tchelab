/**
 * Instância única do Plotly usada por toda a plataforma, montada a partir do
 * bundle "cartesian" (scatter + heatmap + contour + eixos 2D) em vez do
 * plotly.js-dist completo — não usamos traces 3D/geo/financeiro do Plotly
 * (o 3D da plataforma é desenhado à parte, em Three.js puro, ver Scene3D em
 * MultiDimModal.jsx), então o bundle completo só inflaria o build à toa.
 *
 * Exporta também o componente React (via react-plotly.js/factory, ligado a
 * essa mesma instância) e o helper de export de imagem, pra nunca haver duas
 * instâncias de Plotly divergentes no app.
 */
import Plotly from 'plotly.js-cartesian-dist-min';
import createPlotlyComponent from 'react-plotly.js/factory';

export const Plot = createPlotlyComponent(Plotly);

/**
 * Exporta um gráfico Plotly já renderizado (gd = o <div> do gráfico, obtido
 * via onInitialized/onUpdate ou ref) como arquivo.
 *   - format: 'png' (raster em alta resolução, scale=4 ≈ 384dpi pra um
 *     gráfico de 700px) ou 'svg' (vetorial de verdade — abre e edita no
 *     Illustrator/Inkscape, é o que uma revista científica pede).
 */
export function downloadPlot(gd, { format = 'png', filename = 'chart', scale = 4 } = {}) {
  if (!gd) return Promise.reject(new Error('Plot element not ready'));
  return Plotly.downloadImage(gd, { format, filename, scale: format === 'svg' ? 1 : scale });
}

export default Plotly;
