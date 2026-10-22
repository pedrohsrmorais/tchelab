/**
 * Ícones da plataforma — duas camadas, uma biblioteca para cada papel:
 *
 *  • Interface (botões, setas, ações): lucide-react — traço fino e neutro, já usado em toda a UI.
 *  • Domínio (navegação principal, famílias de técnicas, seções do catálogo): Phosphor Icons —
 *    traço mais expressivo e pesos "regular" (inativo) e "duotone" (ativo/destaque), o que
 *    permite mostrar estado sem depender só de cor.
 *
 * Regras (ver docs/auditoria_ux.md e docs/ux_catalogo.md):
 *  1. Ícone de navegação sempre acompanha um texto (o rótulo some só na barra recolhida e ganha `title`).
 *  2. Um conceito = um ícone, em toda a plataforma.
 *  3. Importar sempre ícones nomeados (a árvore é "tree-shaken": só o que é usado entra no bundle).
 */
import {
  SquaresFour, FolderSimple, Database, Browsers, FlowArrow, Books, Article, UsersThree,
  Cpu, Lightning, Sparkle, ShieldCheck,
  SlidersHorizontal, ChartScatter, TrendUp, Shapes, Brain, Cube, CubeFocus, Stack,
  Crosshair, ListChecks, SealCheck, Swap, WaveSine, Images, PuzzlePiece, ArrowsMerge, Factory,
  Lightbulb, Toolbox, UploadSimple, MathOperations, ChartBar, Function as FunctionIcon, Scissors,
  Ruler,
} from '@phosphor-icons/react';

/** Navegação principal (Sidebar). */
export const NAV_ICONS = {
  dashboard: SquaresFour,
  projects: FolderSimple,
  datasets: Database,
  workspace: Browsers,
  workflows: FlowArrow,
  catalog: Books,
  articles: Article,
  communities: UsersThree,
  models: Cpu,
  jobs: Lightning,
  ai: Sparkle,
  admin: ShieldCheck,
};

/** Uma família de técnicas = uma etapa do pipeline quimiométrico (ver FAMILIES em techniqueRegistry.js). */
export const FAMILY_ICONS = {
  '01_dados': Database,
  '02_preprocessamento': SlidersHorizontal,
  '03_exploratoria': ChartScatter,
  '04_regressao_1d': TrendUp,
  '05_classificacao_1d': Shapes,
  '06_deep_learning': Brain,
  '07_multiway_decomp': Cube,
  '08_multiway_regression': CubeFocus,
  '09_multiway_classif': Stack,
  '10_calibracao_ordem_superior': Crosshair,
  '11_selecao_variaveis': ListChecks,
  '12_validacao_modelos': SealCheck,
  '13_transferencia_aprendizado': Swap,
  '14_sinais_espectrais': WaveSine,
  '15_imagens_hiperespectrais': Images,
  '16_dados_faltantes': PuzzlePiece,
  '17_fusao_dados': ArrowsMerge,
  '18_quimiometria_processo': Factory,
  '19_interpretabilidade': Lightbulb,
  '20_utilitarios': Toolbox,
};

/** Seções dentro de famílias grandes (ver config/techniqueSections.js). */
export const SECTION_ICONS = {
  input: UploadSimple,
  manipulation: Scissors,
  math: FunctionIcon,
  stats: ChartBar,
  linear_algebra: MathOperations,
  sampling: Ruler,
};
