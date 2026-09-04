// ─── Re-exporta tipos da API para uso nos componentes ────────────────────────
export type {
  User,
  Spectrum,
  SpectrumSummary,
  Dataset,
  DatasetSpectrum,
  Model,
  Job,
  JobDetail,
  Prediction,
  PredictionDetail,
  AlgorithmInfo,
  PreprocessingEntry,
  SpectralTechnique,
  XUnit,
  YUnit,
  Visibility,
  ModelAlgorithm,
  ModelType,
  ModelStatus,
  JobStatus,
  JobType,
} from "./api";

// ─── Feed ─────────────────────────────────────────────────────────────────────

export type FeedCategory = "Clássico" | "ML";

export interface FeedMetric {
  label: string;
  value: string;
}

export interface FeedItem {
  id:             string;
  author:         string;
  authorInitials: string;
  institution:    string;
  time:           string;
  modelType:      string;
  category:       FeedCategory;
  dataset:        string;
  spectraCount:   number;
  variables:      number;
  metrics:        FeedMetric[];
  description:    string;
}

// ─── Status de job/modelo para UI ────────────────────────────────────────────

export type UIJobStatus =
  | "queued"
  | "running"
  | "done"
  | "failed"
  | "cancelled";

export type UIModelStatus =
  | "pending"
  | "training"
  | "ready"
  | "failed";

// ─── Histórico ────────────────────────────────────────────────────────────────

export type HistoryStatus = "done" | "failed" | "running" | "queued" | "cancelled" | "—";

export interface HistoryItem {
  id:         string;
  date:       string;
  action:     string;
  target:     string;
  status:     HistoryStatus;
  visibility: "public" | "private";
}

// ─── Navegação ────────────────────────────────────────────────────────────────

export interface NavItem {
  label: string;
  to:    string;
  icon?: React.ReactNode;
}