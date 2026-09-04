import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';

// ══════════════════════════════════════════════════════════════════════════════
// Tipos base
// ══════════════════════════════════════════════════════════════════════════════

export interface PaginatedResponse<T> {
  data:  T[];
  total: number;
  page:  number;
  limit: number;
}

export interface PaginatedMeta {
  page:  number;
  limit: number;
  total: number;
  pages: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// Auth
// ══════════════════════════════════════════════════════════════════════════════

export interface AuthTokens {
  access_token:  string;
  refresh_token: string;
}

export interface RegisterPayload {
  name:     string;
  email:    string;
  password: string;
}

export interface LoginPayload {
  email:    string;
  password: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// User
// ══════════════════════════════════════════════════════════════════════════════

export interface User {
  id:                    number;
  uuid:                  string;
  name:                  string;
  initials:              string;
  email:                 string;
  bio:                   string | null;
  research_area:         string | null;
  institution:           string | null;
  birth_date:            string | null;
  lattes_url:            string | null;
  linkedin_url:          string | null;
  github_url:            string | null;
  avatar_url:            string | null;
  cover_color:           string | null;
  stat_models:           number;
  stat_analyses:         number;
  stat_datasets:         number;
  stat_public_analyses:  number;
  stat_private_analyses: number;
  role:                  'user' | 'admin' | 'moderator';
  is_active:             number;
  created_at:            string;
  updated_at:            string;
}

export type UpdateUserPayload = Partial<Pick<User,
  'name' | 'bio' | 'research_area' | 'institution' | 'birth_date' |
  'lattes_url' | 'linkedin_url' | 'github_url' | 'avatar_url' | 'cover_color'
>>;

export interface UpdatePasswordPayload {
  current_password: string;
  new_password:     string;
}

// ══════════════════════════════════════════════════════════════════════════════
// Shared enums
// ══════════════════════════════════════════════════════════════════════════════

export type SpectralTechnique = 'NIR' | 'Raman' | 'FTIR' | 'UV-Vis' | 'NMR' | 'Fluorescence' | 'Other';
export type XUnit             = 'nm' | 'cm-1' | 'eV' | 'ppm' | 'THz';
export type YUnit             = 'Absorbance' | 'Transmittance' | 'Reflectance' | 'Intensity' | 'Kubelka-Munk' | 'Other';
export type Visibility        = 'public' | 'private';
export type SpectrumSource    = 'file' | 'paste' | 'api';

// ══════════════════════════════════════════════════════════════════════════════
// Spectrum
// ══════════════════════════════════════════════════════════════════════════════

export interface Spectrum {
  id:               number;
  uuid:             string;
  user_id:          number;
  name:             string;
  description:      string | null;
  sample_class:     string | null;
  technique:        SpectralTechnique;
  x_unit:           XUnit;
  y_unit:           YUnit;
  x_values:         number[];
  y_values:         number[];
  x_points:         number;
  x_min:            number | null;
  x_max:            number | null;
  reference_value:  number | null;
  reference_values: Record<string, number> | null;
  metadata:         Record<string, unknown> | null;
  source:           SpectrumSource;
  source_filename:  string | null;
  visibility:       Visibility;
  created_at:       string;
  updated_at:       string;
  owner_name?:      string;
  owner_initials?:  string;
}

export type SpectrumSummary = Omit<Spectrum, 'x_values' | 'y_values'>;

export interface ImportSpectraFromFilePayload {
  file:          File;
  technique:     SpectralTechnique;
  x_unit:        XUnit;
  y_unit:        YUnit;
  visibility?:   Visibility;
  sample_class?: string;
}

export interface ImportSpectrumFromPastePayload {
  name:          string;
  text:          string;
  technique:     SpectralTechnique;
  x_unit:        XUnit;
  y_unit:        YUnit;
  description?:  string;
  sample_class?: string;
  visibility?:   Visibility;
}

export type UpdateSpectrumPayload = Partial<Pick<Spectrum,
  'name' | 'description' | 'visibility' | 'sample_class' |
  'reference_value' | 'reference_values' | 'metadata'
>>;

export interface ListSpectraParams {
  page?:         number;
  limit?:        number;
  technique?:    SpectralTechnique;
  sample_class?: string;
}

// ─── Scan / Import response types ─────────────────────────────────────────────

export interface DetectedLayout {
  orientation:           'samples-as-rows' | 'samples-as-cols';
  confidence:            'high' | 'medium' | 'low';
  x_points:              number;
  meta_columns_detected: string[];
  classes_found:         string[];
  sets_found:            string[];
  warnings:              string[];
}

export interface ScanFilePreviewRow {
  name:         string;
  sample_class: string | null;
  sample_set:   string | null;
  x_first:      number;
  x_last:       number;
  y_points:     number;
}

export interface ScanFileResponse {
  total_spectra: number;
  layout:        DetectedLayout;
  preview:       ScanFilePreviewRow[];
}

export interface ImportSpectraResponse {
  message:         string;
  spectra_count:   number;
  spectra:         Array<{ id: number; name: string; sample_class: string | null }>;
  detected_layout: DetectedLayout;
}

// ══════════════════════════════════════════════════════════════════════════════
// Collection
// ══════════════════════════════════════════════════════════════════════════════

export interface Collection {
  id:            number;
  uuid:          string;
  user_id:       number;
  name:          string;
  description:   string | null;
  visibility:    Visibility;
  spectra_count: number;
  created_at:    string;
  updated_at:    string;
  owner_name?:   string;
  owner_initials?: string;
}

export interface CreateCollectionPayload {
  name:         string;
  description?: string;
  visibility?:  Visibility;
}

export type UpdateCollectionPayload = Partial<Pick<Collection, 'name' | 'description' | 'visibility'>>;

export interface ListCollectionsParams {
  page?:  number;
  limit?: number;
}

/** Espectro dentro de uma coleção (versão resumida, sem x/y_values) */
export type CollectionSpectrum = Omit<SpectrumSummary, 'user_id' | 'description' | 'source_filename' | 'metadata' | 'reference_values' | 'updated_at'> & {
  added_at: string;
};

export interface ExportToDatasetPayload {
  name:         string;
  technique:    SpectralTechnique;
  x_unit:       XUnit;
  y_unit:       YUnit;
  spectrum_ids: number[];
  visibility?:  Visibility;
  description?: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// Dataset
// ══════════════════════════════════════════════════════════════════════════════

export interface Dataset {
  id:               number;
  uuid:             string;
  user_id:          number;
  name:             string;
  description:      string | null;
  visibility:       Visibility;
  technique:        SpectralTechnique;
  x_unit:           XUnit;
  y_unit:           YUnit;
  spectra_count:    number;
  x_points:         number | null;
  x_min:            number | null;
  x_max:            number | null;
  reference_labels: string[] | null;
  created_at:       string;
  updated_at:       string;
  owner_name?:      string;
  owner_initials?:  string;
}

export interface CreateDatasetPayload {
  name:         string;
  technique:    SpectralTechnique;
  x_unit:       XUnit;
  y_unit:       YUnit;
  description?: string;
  visibility?:  Visibility;
}

export type UpdateDatasetPayload = Partial<Pick<Dataset, 'name' | 'description' | 'visibility'>>;

export interface ListDatasetsParams {
  page?:      number;
  limit?:     number;
  technique?: SpectralTechnique;
}

/** Papel do espectro dentro do dataset: usado para definir o split de treino/teste manualmente */
export type DatasetSpectrumRole = 'unassigned' | 'train' | 'test';

export interface DatasetSpectrum extends Spectrum {
  position: number;
  role:     DatasetSpectrumRole;
}

// ══════════════════════════════════════════════════════════════════════════════
// Model
// ══════════════════════════════════════════════════════════════════════════════

export type ModelAlgorithm =
  | 'KNN' | 'PLS-OC' | 'SIMCA'
  | 'PLS' | 'PLS-DA' | 'PCR' | 'PCA'
  | 'LDA' | 'SVM' | 'Random Forest' | 'MLP' | 'CNN-1D' | 'Other';

export type ModelType       = 'regression' | 'classification' | 'exploratory';
export type ModelVisibility = 'public' | 'private';
export type ModelStatus     = 'pending' | 'training' | 'ready' | 'failed';

export interface ClassificationMetrics {
  accuracy:         number;
  f1_weighted:      number;
  f1_macro:         number;
  confusion_matrix: number[][];
  classes:          string[];
}

export interface CVMetrics {
  cv_folds:          number;
  accuracy_mean:     number;
  accuracy_std:      number;
  f1_weighted_mean:  number;
  f1_weighted_std:   number;
  note?:             string;
}

export interface RegressionMetrics {
  r2:            number;
  rmsec:         number;
  rmsecv?:       number;
  bias?:         number;
  n_components?: number;
}

export type PreprocessingStep =
  | 'none' | 'center' | 'autoscale' | 'snv' | 'msc'
  | 'sg_smooth' | 'sg_deriv1' | 'sg_deriv2' | 'range_cut';

export interface PreprocessingEntry {
  step:           PreprocessingStep;
  window_length?: number;
  polyorder?:     number;
  delta?:         number;
  idx_min?:       number;
  idx_max?:       number;
}

export interface HyperparameterSchema {
  type:     'int' | 'float' | 'select' | 'bool';
  label:    string;
  default:  number | string | boolean;
  min?:     number;
  max?:     number;
  step?:    number;
  options?: string[];
}

export interface AlgorithmInfo {
  algorithm:       ModelAlgorithm;
  label:           string;
  description:     string;
  model_type:      ModelType;
  status:          'available' | 'coming_soon';
  hyperparameters: Record<string, HyperparameterSchema>;
}

export interface PreprocessingStepInfo {
  step:    PreprocessingStep;
  label:   string;
  params?: Record<string, HyperparameterSchema>;
}

export interface AlgorithmsResponse {
  algorithms:          AlgorithmInfo[];
  preprocessing_steps: PreprocessingStepInfo[];
}

export interface Model {
  id:              number;
  uuid:            string;
  name:            string;
  description:     string | null;
  visibility:      ModelVisibility;
  algorithm:       ModelAlgorithm;
  model_type:      ModelType;
  status:          ModelStatus;
  hyperparameters: Record<string, unknown> | null;
  preprocessing:   PreprocessingEntry[] | null;
  selected_vars:   number[] | null;
  model_size_kb:   number | null;
  metrics_cal:     ClassificationMetrics | RegressionMetrics | null;
  metrics_cv:      CVMetrics | null;
  metrics_ext:     ClassificationMetrics | RegressionMetrics | null;
  train_samples:   number | null;
  test_samples:    number | null;
  cv_folds:        number | null;
  dataset_id:      number;
  created_at:      string;
  updated_at:      string;
  owner_id?:          number;
  owner_name?:        string;
  owner_initials?:    string;
  dataset_name?:      string;
  dataset_technique?: SpectralTechnique;
  x_unit?:            XUnit;
  y_unit?:            YUnit;
}

export interface TrainModelPayload {
  name:               string;
  dataset_id:         number;
  algorithm:          ModelAlgorithm;
  model_type?:        ModelType;
  description?:       string;
  visibility?:        ModelVisibility;
  hyperparameters?:   Record<string, unknown>;
  preprocessing?:     PreprocessingEntry[];
  selected_vars?:     number[];
  cv_folds?:          number;
  test_split?:        number;
  target_property?:   string;
  target_properties?: string[];
}

export interface TrainModelResponse {
  message:      string;
  model_id:     number;
  job_id:       number;
  queue_task:   string;
  manual_split?: boolean;
}

export type UpdateModelPayload = Partial<Pick<Model, 'name' | 'description' | 'visibility'>>;

export interface RetrainModelPayload {
  hyperparameters?:   Record<string, unknown>;
  preprocessing?:     PreprocessingEntry[];
  test_split?:        number;
  target_property?:   string;
  target_properties?: string[];
}

export interface ListModelsParams {
  page?:       number;
  limit?:      number;
  algorithm?:  ModelAlgorithm;
  model_type?: ModelType;
}

// ══════════════════════════════════════════════════════════════════════════════
// Job
// ══════════════════════════════════════════════════════════════════════════════

export type JobType   = 'train_model' | 'predict' | 'preprocess' | 'export';
export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface Job {
  id:             number;
  uuid:           string;
  job_type:       JobType;
  status:         JobStatus;
  progress:       number;
  queue_name:     string;
  celery_task_id: string | null;
  error_message:  string | null;
  queued_at:      string;
  started_at:     string | null;
  finished_at:    string | null;
  duration_s:     number | null;
  model_id:       number | null;
  dataset_id:     number | null;
  model_name?:    string;
  algorithm?:     ModelAlgorithm;
  dataset_name?:  string;
}

export interface JobDetail extends Job {
  payload:            Record<string, unknown>;
  result:             Record<string, unknown> | null;
  metrics_cal?:       ClassificationMetrics | RegressionMetrics | null;
  metrics_cv?:        CVMetrics | null;
  model_status?:      ModelStatus;
  dataset_technique?: SpectralTechnique;
}

export interface JobLogs {
  id:              number;
  status:          JobStatus;
  error_message:   string | null;
  error_traceback: string | null;
}

export interface ListJobsParams {
  page?:     number;
  limit?:    number;
  status?:   JobStatus;
  job_type?: JobType;
}

// ══════════════════════════════════════════════════════════════════════════════
// Prediction
// ══════════════════════════════════════════════════════════════════════════════

export interface PredictionResult {
  position:    number;
  sample_name: string | null;
  predicted:   string | number;
  score:       number | null;
}

export interface PredictionResults {
  predictions:  PredictionResult[];
  sample_count: number;
}

export interface Prediction {
  id:           number;
  uuid:         string;
  sample_count: number;
  created_at:   string;
  model_id:     number;
  model_uuid:   string;
  model_name:   string;
  algorithm:    ModelAlgorithm;
  model_type:   ModelType;
  dataset_id:   number | null;
  dataset_uuid: string | null;
  dataset_name: string | null;
  job_id:       number;
  job_uuid:     string;
  job_status:   JobStatus;
  job_progress: number;
}

export interface PredictionDetail extends Prediction {
  results:     PredictionResults;
  job_error:   string | null;
  started_at:  string | null;
  finished_at: string | null;
}

export interface PredictionsListResponse {
  data: Prediction[];
  meta: PaginatedMeta;
}

// ══════════════════════════════════════════════════════════════════════════════
// Token storage
// ══════════════════════════════════════════════════════════════════════════════

const TOKEN_KEY   = 'tchelab:access_token';
const REFRESH_KEY = 'tchelab:refresh_token';

export const tokenStorage = {
  getAccess:  ()              => localStorage.getItem(TOKEN_KEY),
  getRefresh: ()              => localStorage.getItem(REFRESH_KEY),
  set:        (t: AuthTokens) => {
    localStorage.setItem(TOKEN_KEY,   t.access_token);
    localStorage.setItem(REFRESH_KEY, t.refresh_token);
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// Axios instance + interceptors
// ══════════════════════════════════════════════════════════════════════════════

const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'https://tchelab.intellsn.com.br/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
});

api.interceptors.request.use((config) => {
  const token = tokenStorage.getAccess();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
let pendingQueue: Array<{ resolve: (t: string) => void; reject: (e: unknown) => void }> = [];

function processPendingQueue(err: unknown, token: string | null) {
  pendingQueue.forEach(({ resolve, reject }) => err ? reject(err) : resolve(token!));
  pendingQueue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as AxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status !== 401 || original._retry) return Promise.reject(error);

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({
          resolve: (token) => {
            original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
            resolve(api(original));
          },
          reject,
        });
      });
    }

    original._retry = true;
    isRefreshing    = true;
    const refreshToken = tokenStorage.getRefresh();

    if (!refreshToken) { tokenStorage.clear(); isRefreshing = false; return Promise.reject(error); }

    try {
      const { data } = await axios.post<AuthTokens>(
        `${api.defaults.baseURL}/auth/refresh`,
        { refresh_token: refreshToken }
      );
      tokenStorage.set(data);
      processPendingQueue(null, data.access_token);
      original.headers = { ...original.headers, Authorization: `Bearer ${data.access_token}` };
      return api(original);
    } catch (e) {
      processPendingQueue(e, null);
      tokenStorage.clear();
      return Promise.reject(e);
    } finally {
      isRefreshing = false;
    }
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// Auth
// ══════════════════════════════════════════════════════════════════════════════

export const authApi = {
  register: (payload: RegisterPayload) =>
    api.post<AuthTokens & { message: string }>('/auth/register', payload),
  login: async (payload: LoginPayload): Promise<AuthTokens> => {
    const { data } = await api.post<AuthTokens>('/auth/login', payload);
    tokenStorage.set(data);
    return data;
  },
  refresh: (refresh_token: string) =>
    api.post<AuthTokens>('/auth/refresh', { refresh_token }),
  logout: async () => {
    await api.post('/auth/logout');
    tokenStorage.clear();
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// Users
// ══════════════════════════════════════════════════════════════════════════════

export const usersApi = {
  me:             ()                         => api.get<User>('/users/me'),
  updateMe:       (p: UpdateUserPayload)     => api.patch<User>('/users/me', p),
  updatePassword: (p: UpdatePasswordPayload) => api.patch<{ message: string }>('/users/me/password', p),
  deleteMe:       ()                         => api.delete<{ message: string }>('/users/me'),
  getById:        (id: number | string)      => api.get<User>(`/users/${id}`),
};

// ══════════════════════════════════════════════════════════════════════════════
// Admin
// ══════════════════════════════════════════════════════════════════════════════

export const adminApi = {
  listUsers:  (page = 1, limit = 20)        => api.get<PaginatedResponse<User>>('/admin/users', { params: { page, limit } }),
  deleteUser: (id: number)                  => api.delete<{ message: string }>(`/admin/users/${id}`),
  listJobs:   (params: ListJobsParams = {}) => api.get<PaginatedResponse<Job>>('/admin/jobs', { params }),
};

// ══════════════════════════════════════════════════════════════════════════════
// Spectra
// ══════════════════════════════════════════════════════════════════════════════

export const spectraApi = {
  scanFile: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<ScanFileResponse>('/spectra/scan', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  importFile: (payload: ImportSpectraFromFilePayload) => {
    const form = new FormData();
    form.append('file',      payload.file);
    form.append('technique', payload.technique);
    form.append('x_unit',    payload.x_unit);
    form.append('y_unit',    payload.y_unit);
    if (payload.visibility)   form.append('visibility',   payload.visibility);
    if (payload.sample_class) form.append('sample_class', payload.sample_class);
    return api.post<ImportSpectraResponse>('/spectra/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  importPaste: (payload: ImportSpectrumFromPastePayload) =>
    api.post<{ message: string; spectrum: Spectrum }>('/spectra/paste', payload),
  list:     (params: ListSpectraParams = {}) =>
    api.get<PaginatedResponse<SpectrumSummary>>('/spectra', { params }),
  listMine: (params: ListSpectraParams = {}) =>
    api.get<PaginatedResponse<SpectrumSummary>>('/spectra/mine', { params }),
  get:    (id: number | string) => api.get<Spectrum>(`/spectra/${id}`),
  update: (id: number | string, payload: UpdateSpectrumPayload) =>
    api.patch<Spectrum>(`/spectra/${id}`, payload),
  delete: (id: number | string) =>
    api.delete<{ message: string }>(`/spectra/${id}`),
};

// ══════════════════════════════════════════════════════════════════════════════
// Collections
// ══════════════════════════════════════════════════════════════════════════════

export const collectionsApi = {
  create: (payload: CreateCollectionPayload) =>
    api.post<{ message: string; collection: Collection }>('/collections', payload),

  list: (params: ListCollectionsParams = {}) =>
    api.get<PaginatedResponse<Collection>>('/collections', { params }),

  listMine: (params: ListCollectionsParams = {}) =>
    api.get<PaginatedResponse<Collection>>('/collections/mine', { params }),

  get: (id: number | string) =>
    api.get<Collection>(`/collections/${id}`),

  /** Lista espectros da coleção (paginado) */
  getSpectra: (id: number | string, params: { page?: number; limit?: number } = {}) =>
    api.get<PaginatedResponse<CollectionSpectrum>>(`/collections/${id}/spectra`, { params }),

  /** Adiciona um espectro à coleção */
  addSpectrum: (collectionId: number | string, spectrumId: number | string) =>
    api.post<{ message: string }>(`/collections/${collectionId}/spectra`, { spectrum_id: spectrumId }),

  /** Remove um espectro da coleção */
  removeSpectrum: (collectionId: number | string, spectrumId: number | string) =>
    api.delete<{ message: string }>(`/collections/${collectionId}/spectra/${spectrumId}`),

  /** Cria um dataset a partir de espectros selecionados da coleção */
  exportToDataset: (collectionId: number | string, payload: ExportToDatasetPayload) =>
    api.post<{ message: string; dataset: Dataset }>(`/collections/${collectionId}/export-dataset`, payload),

  update: (id: number | string, payload: UpdateCollectionPayload) =>
    api.patch<{ message: string }>(`/collections/${id}`, payload),

  delete: (id: number | string) =>
    api.delete<{ message: string }>(`/collections/${id}`),
};

// ══════════════════════════════════════════════════════════════════════════════
// Datasets
// ══════════════════════════════════════════════════════════════════════════════

export const datasetsApi = {
  create: (payload: CreateDatasetPayload) =>
    api.post<{ message: string; dataset: Dataset }>('/datasets', payload),
  list: (params: ListDatasetsParams = {}) =>
    api.get<PaginatedResponse<Dataset>>('/datasets', { params }),
  get: (id: number | string) =>
    api.get<Dataset>(`/datasets/${id}`),
  getSpectra: (id: number | string) =>
    api.get<{ data: DatasetSpectrum[]; spectra_count: number }>(`/datasets/${id}/spectra`),
  addSpectrum: (datasetId: number | string, spectrumId: number | string) =>
    api.post<{ message: string }>(`/datasets/${datasetId}/spectra`, { spectrum_id: spectrumId }),
  removeSpectrum: (datasetId: number | string, spectrumId: number | string) =>
    api.delete<{ message: string }>(`/datasets/${datasetId}/spectra/${spectrumId}`),
  /** Atribui papel (treino/teste/sem papel) a um lote de espectros do dataset */
  updateSpectraRoles: (datasetId: number | string, spectrum_ids: number[], role: DatasetSpectrumRole) =>
    api.patch<{ message: string; updated: number }>(`/datasets/${datasetId}/spectra/roles`, { spectrum_ids, role }),
  export: (id: number | string) =>
    api.get(`/datasets/${id}/export`, { responseType: 'blob' }),
  update: (id: number | string, payload: UpdateDatasetPayload) =>
    api.patch<{ message: string }>(`/datasets/${id}`, payload),
  delete: (id: number | string) =>
    api.delete<{ message: string }>(`/datasets/${id}`),
};

// ══════════════════════════════════════════════════════════════════════════════
// Models
// ══════════════════════════════════════════════════════════════════════════════

export const modelsApi = {
  listAlgorithms: () => api.get<AlgorithmsResponse>('/models/algorithms'),
  listMine: (page = 1, limit = 20) =>
    api.get<PaginatedResponse<Model>>('/models/mine', { params: { page, limit } }),
  list: (params: ListModelsParams = {}) =>
    api.get<PaginatedResponse<Model>>('/models', { params }),
  get: (id: number | string) => api.get<Model>(`/models/${id}`),
  train: (payload: TrainModelPayload) =>
    api.post<TrainModelResponse>('/models/train', payload),
  retrain: (id: number | string, payload: RetrainModelPayload = {}) =>
    api.post<{ message: string; job_id: number }>(`/models/${id}/retrain`, payload),
  update: (id: number | string, payload: UpdateModelPayload) =>
    api.patch<{ message: string }>(`/models/${id}`, payload),
  delete: (id: number | string) =>
    api.delete<{ message: string }>(`/models/${id}`),
};

// ══════════════════════════════════════════════════════════════════════════════
// Jobs
// ══════════════════════════════════════════════════════════════════════════════

export const jobsApi = {
  list:   (params: ListJobsParams = {}) => api.get<PaginatedResponse<Job>>('/jobs', { params }),
  get:    (id: number | string)         => api.get<JobDetail>(`/jobs/${id}`),
  logs:   (id: number | string)         => api.get<JobLogs>(`/jobs/${id}/logs`),
  cancel: (id: number | string)         => api.post<{ message: string }>(`/jobs/${id}/cancel`),
};

// ══════════════════════════════════════════════════════════════════════════════
// Predictions
// ══════════════════════════════════════════════════════════════════════════════

export const predictionsApi = {
  create: (model_id: number | string, dataset_id: number | string) =>
    api.post<{ message: string; job: Pick<Job, 'id' | 'uuid' | 'job_type' | 'status' | 'progress' | 'queued_at'> }>(
      '/predictions', { model_id, dataset_id }
    ),
  list:   (page = 1, limit = 20) => api.get<PredictionsListResponse>('/predictions', { params: { page, limit } }),
  get:    (id: number | string)  => api.get<PredictionDetail>(`/predictions/${id}`),
  delete: (id: number | string)  => api.delete<void>(`/predictions/${id}`),
};

export default api;
