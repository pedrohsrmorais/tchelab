/**
 * Tema "publicação científica" pros gráficos Plotly da plataforma: fundo
 * branco fixo (independe do tema dark/light/classic do app — um gráfico que
 * vai parar num artigo não pode mudar de cor conforme o modo da UI), fonte
 * sans-serif neutra em tamanho de leitura, grid discreto, linha de eixo
 * sólida com ticks pra fora (convenção de journal: Nature, ACS, Elsevier
 * etc. praticamente sempre desenham assim).
 *
 * Isso é INDEPENDENTE do tema dark/light/classic do app (ver ThemeContext) —
 * um gráfico pensado pra ir num artigo ou apresentação não deve mudar de
 * esquema de cor conforme o usuário troca o tema da plataforma.
 */
export const ACADEMIC_FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

// Paleta categórica com bom contraste em impressão colorida E em escala de
// cinza (ordem pensada pra que os 4 primeiros já sejam bem distinguíveis
// convertidos pra P&B). Usada junto com dash/marker diferentes por série.
export const ACADEMIC_COLORWAY = [
  '#1f4e8c', // azul escuro
  '#c0392b', // vermelho tijolo
  '#1a7a4c', // verde escuro
  '#d68910', // âmbar
  '#6c3483', // roxo
  '#117864', // teal escuro
  '#943126', // vinho
  '#515a5a', // cinza chumbo
];

// Padrões de traço e marcador — atribuídos ciclicamente por série, pra que
// um gráfico com várias curvas continue legível impresso em P&B (requisito
// comum de revista) sem depender só da cor.
export const LINE_DASHES = ['solid', 'dash', 'dot', 'dashdot', 'longdash', 'longdashdot'];
export const MARKER_SYMBOLS = ['circle', 'square', 'diamond', 'triangle-up', 'cross', 'triangle-down', 'star', 'pentagon'];

const AXIS_BASE = {
  showgrid: true,
  gridcolor: '#e5e7eb',
  gridwidth: 1,
  zeroline: false,
  showline: true,
  linecolor: '#374151',
  linewidth: 1.25,
  ticks: 'outside',
  tickcolor: '#374151',
  ticklen: 5,
  tickfont: { size: 12 },
  mirror: true,
  automargin: true,
};

/**
 * Monta o objeto `layout` do Plotly já no tema acadêmico.
 * @param {object} opts
 * @param {string} [opts.title]
 * @param {string} [opts.xTitle]
 * @param {string} [opts.yTitle]
 * @param {boolean} [opts.showLegend]
 * @param {object} [opts.extraXAxis] — mesclado por cima do eixo X (ex: type:'log')
 * @param {object} [opts.extraYAxis]
 */
export function academicLayout({ title, xTitle, yTitle, showLegend = true, extraXAxis, extraYAxis } = {}) {
  return {
    title: title
      ? { text: title, font: { family: ACADEMIC_FONT, size: 17, color: '#111827' }, x: 0.01, xanchor: 'left', pad: { b: 8 } }
      : undefined,
    font: { family: ACADEMIC_FONT, size: 13, color: '#111827' },
    paper_bgcolor: '#ffffff',
    plot_bgcolor: '#ffffff',
    colorway: ACADEMIC_COLORWAY,
    margin: { l: 72, r: 28, t: title ? 56 : 24, b: 64 },
    xaxis: { ...AXIS_BASE, title: xTitle ? { text: xTitle, font: { size: 14 }, standoff: 10 } : undefined, ...extraXAxis },
    yaxis: { ...AXIS_BASE, title: yTitle ? { text: yTitle, font: { size: 14 }, standoff: 10 } : undefined, ...extraYAxis },
    showlegend: showLegend,
    legend: {
      font: { size: 12 },
      bgcolor: 'rgba(255,255,255,0.85)',
      bordercolor: '#d1d5db',
      borderwidth: 1,
      orientation: 'h',
      yanchor: 'bottom', y: 1.02, xanchor: 'left', x: 0,
    },
    hoverlabel: { font: { family: ACADEMIC_FONT, size: 12 }, bgcolor: '#111827' },
    hovermode: 'closest',
  };
}

export const ACADEMIC_CONFIG = {
  displaylogo: false,
  responsive: true,
  scrollZoom: false,
  toImageButtonOptions: { format: 'png', filename: 'chart', scale: 4 },
  modeBarButtonsToRemove: ['select2d', 'lasso2d', 'autoScale2d'],
};
