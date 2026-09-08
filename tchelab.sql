-- ============================================================
-- TCHELAB - DATABASE INITIALIZATION
-- MVP - Scientific Data Analysis & Workflow Platform
-- MySQL 8.0+
-- ============================================================

CREATE DATABASE IF NOT EXISTS tchelab
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE tchelab;

SET FOREIGN_KEY_CHECKS = 0;


-- ============================================================
-- 1. USERS
-- ============================================================

DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS community_members;
DROP TABLE IF EXISTS communities;

DROP TABLE IF EXISTS metrics;
DROP TABLE IF EXISTS execution_nodes;
DROP TABLE IF EXISTS executions;

DROP TABLE IF EXISTS workflow_edges;
DROP TABLE IF EXISTS workflow_nodes;
DROP TABLE IF EXISTS workflows;

DROP TABLE IF EXISTS ai_interactions;
DROP TABLE IF EXISTS article_analyses;
DROP TABLE IF EXISTS article_techniques;
DROP TABLE IF EXISTS articles;

DROP TABLE IF EXISTS predictions;
DROP TABLE IF EXISTS models;
DROP TABLE IF EXISTS jobs;

DROP TABLE IF EXISTS collection_spectra;
DROP TABLE IF EXISTS collections;

DROP TABLE IF EXISTS dataset_spectra;
DROP TABLE IF EXISTS datasets;
DROP TABLE IF EXISTS spectra;

DROP TABLE IF EXISTS techniques;

DROP TABLE IF EXISTS users;


CREATE TABLE users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    uuid CHAR(36) NOT NULL UNIQUE,

    name VARCHAR(255) NOT NULL,
    initials VARCHAR(20),

    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,

    bio TEXT,
    research_area VARCHAR(255),
    institution VARCHAR(255),

    birth_date DATE,

    lattes_url VARCHAR(500),
    linkedin_url VARCHAR(500),
    github_url VARCHAR(500),

    avatar_url VARCHAR(1000),
    cover_color VARCHAR(100) DEFAULT 'gradient-primary',

    stat_models INT UNSIGNED DEFAULT 0,
    stat_analyses INT UNSIGNED DEFAULT 0,
    stat_datasets INT UNSIGNED DEFAULT 0,
    stat_public_analyses INT UNSIGNED DEFAULT 0,
    stat_private_analyses INT UNSIGNED DEFAULT 0,

    email_verified_at DATETIME NULL,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    role ENUM('user', 'admin', 'moderator')
        NOT NULL DEFAULT 'user',

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    deleted_at DATETIME NULL,

    INDEX idx_users_email (email),
    INDEX idx_users_uuid (uuid),
    INDEX idx_users_active (is_active)
) ENGINE=InnoDB;


-- ============================================================
-- 2. TECHNIQUES
-- ============================================================
-- Representa as "peças" disponíveis no workflow.
--
-- Exemplos:
-- PCA
-- PLS
-- PLS-DA
-- SNV
-- MSC
-- Savitzky-Golay
-- PARAFAC
-- Tucker3
-- RNN
-- Random Forest
--
-- input_type / output_type permitem validação básica
-- de compatibilidade entre nós.
-- ============================================================

CREATE TABLE techniques (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    uuid CHAR(36) NOT NULL UNIQUE,

    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,

    category ENUM(
        'input',
        'preprocessing',
        'exploratory',
        'regression',
        'classification',
        'multiway',
        'deep_learning',
        'visualization',
        'validation',
        'utility',
        'other'
    ) NOT NULL DEFAULT 'other',

    description TEXT,

    input_type VARCHAR(100) NULL,
    output_type VARCHAR(100) NULL,

    parameter_schema JSON NULL,

    implementation VARCHAR(500) NULL,

    documentation TEXT NULL,

    active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_techniques_category (category),
    INDEX idx_techniques_active (active),
    INDEX idx_techniques_slug (slug)
) ENGINE=InnoDB;


-- ============================================================
-- 3. SPECTRA
-- ============================================================

CREATE TABLE spectra (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    uuid CHAR(36) NOT NULL UNIQUE,

    user_id BIGINT UNSIGNED NOT NULL,

    name VARCHAR(255) NOT NULL,
    description TEXT,

    sample_class VARCHAR(255),

    technique ENUM(
        'NIR',
        'Raman',
        'FTIR',
        'UV-Vis',
        'NMR',
        'Fluorescence',
        'Other'
    ) NOT NULL DEFAULT 'Other',

    x_unit VARCHAR(50),
    y_unit VARCHAR(100),

    x_values JSON NOT NULL,
    y_values JSON NOT NULL,

    x_points INT UNSIGNED NOT NULL,

    x_min DOUBLE,
    x_max DOUBLE,

    reference_value DOUBLE NULL,

    reference_values JSON NULL,

    metadata JSON NULL,

    source ENUM(
        'file',
        'paste',
        'api'
    ) NOT NULL DEFAULT 'file',

    source_filename VARCHAR(500),

    visibility ENUM(
        'public',
        'private'
    ) NOT NULL DEFAULT 'private',

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    deleted_at DATETIME NULL,

    CONSTRAINT fk_spectra_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    INDEX idx_spectra_user (user_id),
    INDEX idx_spectra_technique (technique),
    INDEX idx_spectra_visibility (visibility),
    INDEX idx_spectra_created (created_at)
) ENGINE=InnoDB;


-- ============================================================
-- 4. DATASETS
-- ============================================================
-- data_type:
-- matrix = X [samples x variables]
-- tensor = X [dim1 x dim2 x dim3 ...]
-- ============================================================

CREATE TABLE datasets (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    uuid CHAR(36) NOT NULL UNIQUE,

    user_id BIGINT UNSIGNED NOT NULL,

    name VARCHAR(255) NOT NULL,
    description TEXT,

    visibility ENUM(
        'public',
        'private'
    ) NOT NULL DEFAULT 'private',

    data_type ENUM(
        'matrix',
        'tensor'
    ) NOT NULL DEFAULT 'matrix',

    technique VARCHAR(100),

    x_unit VARCHAR(50),
    y_unit VARCHAR(100),

    spectra_count INT UNSIGNED DEFAULT 0,

    x_points INT UNSIGNED,

    x_min DOUBLE,
    x_max DOUBLE,

    reference_labels JSON NULL,

    -- Para datasets multiway
    dimensions JSON NULL,

    metadata JSON NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    deleted_at DATETIME NULL,

    CONSTRAINT fk_datasets_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    INDEX idx_datasets_user (user_id),
    INDEX idx_datasets_type (data_type),
    INDEX idx_datasets_visibility (visibility)
) ENGINE=InnoDB;


-- ============================================================
-- 5. DATASET_SPECTRA
-- ============================================================

CREATE TABLE dataset_spectra (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    dataset_id BIGINT UNSIGNED NOT NULL,
    spectrum_id BIGINT UNSIGNED NOT NULL,

    position INT UNSIGNED NOT NULL,

    added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_dataset_spectra_dataset
        FOREIGN KEY (dataset_id)
        REFERENCES datasets(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_dataset_spectra_spectrum
        FOREIGN KEY (spectrum_id)
        REFERENCES spectra(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_dataset_spectrum
        UNIQUE (dataset_id, spectrum_id),

    CONSTRAINT uq_dataset_position
        UNIQUE (dataset_id, position),

    INDEX idx_dataset_spectra_dataset (dataset_id),
    INDEX idx_dataset_spectra_spectrum (spectrum_id)
) ENGINE=InnoDB;


-- ============================================================
-- 6. COLLECTIONS
-- ============================================================

CREATE TABLE collections (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    uuid CHAR(36) NOT NULL UNIQUE,

    user_id BIGINT UNSIGNED NOT NULL,

    name VARCHAR(255) NOT NULL,
    description TEXT,

    visibility ENUM(
        'public',
        'private'
    ) NOT NULL DEFAULT 'private',

    spectra_count INT UNSIGNED DEFAULT 0,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    deleted_at DATETIME NULL,

    CONSTRAINT fk_collections_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    INDEX idx_collections_user (user_id)
) ENGINE=InnoDB;


-- ============================================================
-- 7. COLLECTION_SPECTRA
-- ============================================================

CREATE TABLE collection_spectra (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    collection_id BIGINT UNSIGNED NOT NULL,
    spectrum_id BIGINT UNSIGNED NOT NULL,

    added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_collection_spectra_collection
        FOREIGN KEY (collection_id)
        REFERENCES collections(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_collection_spectra_spectrum
        FOREIGN KEY (spectrum_id)
        REFERENCES spectra(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_collection_spectrum
        UNIQUE (collection_id, spectrum_id),

    INDEX idx_collection_spectra_collection (collection_id),
    INDEX idx_collection_spectra_spectrum (spectrum_id)
) ENGINE=InnoDB;


-- ============================================================
-- 8. ARTICLES
-- ============================================================
-- Artigos científicos salvos pelo usuário.
-- DOI é opcional porque o PDF pode ser inserido diretamente.
-- ============================================================

CREATE TABLE articles (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    uuid CHAR(36) NOT NULL UNIQUE,

    user_id BIGINT UNSIGNED NOT NULL,

    doi VARCHAR(500) NULL,

    title TEXT,
    abstract TEXT,

    authors JSON NULL,

    journal VARCHAR(500),
    publisher VARCHAR(255),

    publication_date DATE NULL,

    url VARCHAR(1000),
    pdf_path VARCHAR(1000),

    metadata JSON NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_articles_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    INDEX idx_articles_user (user_id),
    INDEX idx_articles_doi (doi),
    INDEX idx_articles_publication_date (publication_date)
) ENGINE=InnoDB;


-- ============================================================
-- 9. ARTICLE_ANALYSES
-- ============================================================
-- Resultado da análise da IA sobre um artigo.
--
-- methodology contém a metodologia estruturada.
-- ============================================================

CREATE TABLE article_analyses (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    uuid CHAR(36) NOT NULL UNIQUE,

    article_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,

    status ENUM(
        'pending',
        'processing',
        'completed',
        'failed'
    ) NOT NULL DEFAULT 'pending',

    model VARCHAR(255),

    summary TEXT,

    methodology JSON NULL,

    raw_response LONGTEXT NULL,

    error_message TEXT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_article_analyses_article
        FOREIGN KEY (article_id)
        REFERENCES articles(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_article_analyses_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    INDEX idx_article_analyses_article (article_id),
    INDEX idx_article_analyses_user (user_id),
    INDEX idx_article_analyses_status (status)
) ENGINE=InnoDB;


-- ============================================================
-- 10. ARTICLE_TECHNIQUES
-- ============================================================
-- Técnicas identificadas pela IA dentro do artigo.
-- ============================================================

CREATE TABLE article_techniques (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    article_analysis_id BIGINT UNSIGNED NOT NULL,
    technique_id BIGINT UNSIGNED NOT NULL,

    step_order INT UNSIGNED,

    parameters JSON NULL,

    evidence TEXT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_article_techniques_analysis
        FOREIGN KEY (article_analysis_id)
        REFERENCES article_analyses(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_article_techniques_technique
        FOREIGN KEY (technique_id)
        REFERENCES techniques(id)
        ON DELETE CASCADE,

    INDEX idx_article_techniques_analysis (article_analysis_id),
    INDEX idx_article_techniques_technique (technique_id)
) ENGINE=InnoDB;


-- ============================================================
-- 11. WORKFLOWS
-- ============================================================
-- O workflow é o "projeto" visual de análise.
-- ============================================================

CREATE TABLE workflows (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    uuid CHAR(36) NOT NULL UNIQUE,

    user_id BIGINT UNSIGNED NOT NULL,

    name VARCHAR(255) NOT NULL,
    description TEXT,

    visibility ENUM(
        'public',
        'private'
    ) NOT NULL DEFAULT 'private',

    status ENUM(
        'draft',
        'ready',
        'archived'
    ) NOT NULL DEFAULT 'draft',

    -- Pode apontar para o artigo que originou o workflow
    source_article_analysis_id BIGINT UNSIGNED NULL,

    -- Definição completa do workflow no MVP
    definition JSON NOT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    deleted_at DATETIME NULL,

    CONSTRAINT fk_workflows_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_workflows_article_analysis
        FOREIGN KEY (source_article_analysis_id)
        REFERENCES article_analyses(id)
        ON DELETE SET NULL,

    INDEX idx_workflows_user (user_id),
    INDEX idx_workflows_visibility (visibility),
    INDEX idx_workflows_status (status),
    INDEX idx_workflows_source_article (source_article_analysis_id)
) ENGINE=InnoDB;


-- ============================================================
-- 12. WORKFLOW_NODES
-- ============================================================
-- Nós individuais do workflow.
-- A definição completa também fica em workflows.definition.
-- Esta tabela facilita consultas e validações.
-- ============================================================

CREATE TABLE workflow_nodes (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    workflow_id BIGINT UNSIGNED NOT NULL,

    node_key VARCHAR(100) NOT NULL,

    technique_id BIGINT UNSIGNED NULL,

    name VARCHAR(255),

    parameters JSON NULL,

    position_x DOUBLE DEFAULT 0,
    position_y DOUBLE DEFAULT 0,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_workflow_nodes_workflow
        FOREIGN KEY (workflow_id)
        REFERENCES workflows(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_workflow_nodes_technique
        FOREIGN KEY (technique_id)
        REFERENCES techniques(id)
        ON DELETE SET NULL,

    CONSTRAINT uq_workflow_node_key
        UNIQUE (workflow_id, node_key),

    INDEX idx_workflow_nodes_workflow (workflow_id),
    INDEX idx_workflow_nodes_technique (technique_id)
) ENGINE=InnoDB;


-- ============================================================
-- 13. WORKFLOW_EDGES
-- ============================================================
-- Conexões entre os nós.
-- ============================================================

CREATE TABLE workflow_edges (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    workflow_id BIGINT UNSIGNED NOT NULL,

    source_node_key VARCHAR(100) NOT NULL,
    target_node_key VARCHAR(100) NOT NULL,

    source_port VARCHAR(100) NULL,
    target_port VARCHAR(100) NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_workflow_edges_workflow
        FOREIGN KEY (workflow_id)
        REFERENCES workflows(id)
        ON DELETE CASCADE,

    INDEX idx_workflow_edges_workflow (workflow_id),
    INDEX idx_workflow_edges_source (source_node_key),
    INDEX idx_workflow_edges_target (target_node_key)
) ENGINE=InnoDB;


-- ============================================================
-- 14. EXECUTIONS
-- ============================================================
-- Uma execução concreta de um workflow.
--
-- Workflow = receita
-- Execution = experimento realizado
-- ============================================================

CREATE TABLE executions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    uuid CHAR(36) NOT NULL UNIQUE,

    workflow_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,

    dataset_id BIGINT UNSIGNED NULL,

    status ENUM(
        'queued',
        'running',
        'completed',
        'failed',
        'cancelled'
    ) NOT NULL DEFAULT 'queued',

    parameters JSON NULL,

    results JSON NULL,

    error_message TEXT NULL,

    random_seed BIGINT NULL,

    code_version VARCHAR(255) NULL,

    environment JSON NULL,

    started_at DATETIME NULL,
    finished_at DATETIME NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_executions_workflow
        FOREIGN KEY (workflow_id)
        REFERENCES workflows(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_executions_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_executions_dataset
        FOREIGN KEY (dataset_id)
        REFERENCES datasets(id)
        ON DELETE SET NULL,

    INDEX idx_executions_workflow (workflow_id),
    INDEX idx_executions_user (user_id),
    INDEX idx_executions_dataset (dataset_id),
    INDEX idx_executions_status (status),
    INDEX idx_executions_created (created_at)
) ENGINE=InnoDB;


-- ============================================================
-- 15. EXECUTION_NODES
-- ============================================================
-- Resultado individual de cada peça executada.
-- ============================================================

CREATE TABLE execution_nodes (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    execution_id BIGINT UNSIGNED NOT NULL,

    node_key VARCHAR(100) NOT NULL,

    technique_id BIGINT UNSIGNED NULL,

    status ENUM(
        'pending',
        'running',
        'completed',
        'failed',
        'skipped'
    ) NOT NULL DEFAULT 'pending',

    parameters JSON NULL,

    input_data JSON NULL,

    output_data JSON NULL,

    metrics JSON NULL,

    runtime_ms BIGINT UNSIGNED NULL,

    logs LONGTEXT NULL,

    error_message TEXT NULL,

    started_at DATETIME NULL,
    finished_at DATETIME NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_execution_nodes_execution
        FOREIGN KEY (execution_id)
        REFERENCES executions(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_execution_nodes_technique
        FOREIGN KEY (technique_id)
        REFERENCES techniques(id)
        ON DELETE SET NULL,

    CONSTRAINT uq_execution_node
        UNIQUE (execution_id, node_key),

    INDEX idx_execution_nodes_execution (execution_id),
    INDEX idx_execution_nodes_technique (technique_id),
    INDEX idx_execution_nodes_status (status)
) ENGINE=InnoDB;


-- ============================================================
-- 16. METRICS
-- ============================================================
-- Métricas associadas diretamente à execução de um nó.
--
-- Ex:
-- R2 = 0.991
-- RMSE = 0.31
-- Accuracy = 0.95
-- Core Consistency = 82.3
-- ============================================================

CREATE TABLE metrics (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    execution_node_id BIGINT UNSIGNED NOT NULL,

    name VARCHAR(100) NOT NULL,

    value DOUBLE NOT NULL,

    dataset_split VARCHAR(100) NULL,

    unit VARCHAR(100) NULL,

    metadata JSON NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_metrics_execution_node
        FOREIGN KEY (execution_node_id)
        REFERENCES execution_nodes(id)
        ON DELETE CASCADE,

    INDEX idx_metrics_execution_node (execution_node_id),
    INDEX idx_metrics_name (name)
) ENGINE=InnoDB;


-- ============================================================
-- 17. MODELS
-- ============================================================
-- Mantém compatibilidade com a estrutura antiga.
-- O modelo pode ter sido produzido por uma execução.
-- ============================================================

CREATE TABLE models (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    uuid CHAR(36) NOT NULL UNIQUE,

    user_id BIGINT UNSIGNED NOT NULL,

    dataset_id BIGINT UNSIGNED NULL,

    execution_id BIGINT UNSIGNED NULL,

    name VARCHAR(255) NOT NULL,
    description TEXT,

    algorithm VARCHAR(255) NOT NULL,

    model_type ENUM(
        'regression',
        'classification',
        'exploratory',
        'other'
    ) NOT NULL DEFAULT 'other',

    hyperparameters JSON NULL,

    preprocessing JSON NULL,

    selected_vars JSON NULL,

    model_path VARCHAR(1000),

    model_size_kb BIGINT UNSIGNED NULL,

    status ENUM(
        'pending',
        'training',
        'ready',
        'failed'
    ) NOT NULL DEFAULT 'pending',

    metrics_cal JSON NULL,
    metrics_cv JSON NULL,
    metrics_ext JSON NULL,

    train_samples INT UNSIGNED NULL,
    test_samples INT UNSIGNED NULL,

    cv_folds INT UNSIGNED NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    deleted_at DATETIME NULL,

    CONSTRAINT fk_models_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_models_dataset
        FOREIGN KEY (dataset_id)
        REFERENCES datasets(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_models_execution
        FOREIGN KEY (execution_id)
        REFERENCES executions(id)
        ON DELETE SET NULL,

    INDEX idx_models_user (user_id),
    INDEX idx_models_dataset (dataset_id),
    INDEX idx_models_execution (execution_id),
    INDEX idx_models_algorithm (algorithm),
    INDEX idx_models_status (status)
) ENGINE=InnoDB;


-- ============================================================
-- 18. JOBS
-- ============================================================

CREATE TABLE jobs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    uuid CHAR(36) NOT NULL UNIQUE,

    user_id BIGINT UNSIGNED NOT NULL,

    job_type ENUM(
        'train_model',
        'predict',
        'preprocess',
        'execute_workflow',
        'analyze_article',
        'generate_workflow',
        'export',
        'other'
    ) NOT NULL,

    model_id BIGINT UNSIGNED NULL,

    dataset_id BIGINT UNSIGNED NULL,

    workflow_id BIGINT UNSIGNED NULL,

    execution_id BIGINT UNSIGNED NULL,

    celery_task_id VARCHAR(255),

    queue_name VARCHAR(100) DEFAULT 'default',

    payload JSON NULL,

    status ENUM(
        'queued',
        'running',
        'done',
        'failed',
        'cancelled'
    ) NOT NULL DEFAULT 'queued',

    progress DECIMAL(5,2) DEFAULT 0,

    result JSON NULL,

    error_message TEXT NULL,

    error_traceback LONGTEXT NULL,

    queued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME NULL,
    finished_at DATETIME NULL,

    CONSTRAINT fk_jobs_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_jobs_model
        FOREIGN KEY (model_id)
        REFERENCES models(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_jobs_dataset
        FOREIGN KEY (dataset_id)
        REFERENCES datasets(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_jobs_workflow
        FOREIGN KEY (workflow_id)
        REFERENCES workflows(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_jobs_execution
        FOREIGN KEY (execution_id)
        REFERENCES executions(id)
        ON DELETE SET NULL,

    INDEX idx_jobs_user (user_id),
    INDEX idx_jobs_status (status),
    INDEX idx_jobs_type (job_type),
    INDEX idx_jobs_workflow (workflow_id),
    INDEX idx_jobs_execution (execution_id)
) ENGINE=InnoDB;


-- ============================================================
-- 19. PREDICTIONS
-- ============================================================

CREATE TABLE predictions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    uuid CHAR(36) NOT NULL UNIQUE,

    user_id BIGINT UNSIGNED NOT NULL,

    model_id BIGINT UNSIGNED NOT NULL,

    job_id BIGINT UNSIGNED NULL,

    source_dataset_id BIGINT UNSIGNED NULL,

    source_filename VARCHAR(500),

    results JSON NOT NULL,

    sample_count INT UNSIGNED DEFAULT 0,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_predictions_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_predictions_model
        FOREIGN KEY (model_id)
        REFERENCES models(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_predictions_job
        FOREIGN KEY (job_id)
        REFERENCES jobs(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_predictions_dataset
        FOREIGN KEY (source_dataset_id)
        REFERENCES datasets(id)
        ON DELETE SET NULL,

    INDEX idx_predictions_user (user_id),
    INDEX idx_predictions_model (model_id),
    INDEX idx_predictions_dataset (source_dataset_id)
) ENGINE=InnoDB;


-- ============================================================
-- 20. AI_INTERACTIONS
-- ============================================================
-- Registro genérico das interações importantes da IA.
--
-- Exemplos:
-- article_analysis
-- workflow_generation
-- workflow_assistance
-- result_analysis
-- ============================================================

CREATE TABLE ai_interactions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    uuid CHAR(36) NOT NULL UNIQUE,

    user_id BIGINT UNSIGNED NOT NULL,

    type ENUM(
        'article_analysis',
        'workflow_generation',
        'workflow_assistance',
        'result_analysis',
        'other'
    ) NOT NULL,

    article_id BIGINT UNSIGNED NULL,

    workflow_id BIGINT UNSIGNED NULL,

    execution_id BIGINT UNSIGNED NULL,

    input_context JSON NULL,

    output LONGTEXT NULL,

    model VARCHAR(255),

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_ai_interactions_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_ai_interactions_article
        FOREIGN KEY (article_id)
        REFERENCES articles(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_ai_interactions_workflow
        FOREIGN KEY (workflow_id)
        REFERENCES workflows(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_ai_interactions_execution
        FOREIGN KEY (execution_id)
        REFERENCES executions(id)
        ON DELETE SET NULL,

    INDEX idx_ai_user (user_id),
    INDEX idx_ai_type (type),
    INDEX idx_ai_article (article_id),
    INDEX idx_ai_workflow (workflow_id),
    INDEX idx_ai_execution (execution_id)
) ENGINE=InnoDB;


-- ============================================================
-- 21. COMMUNITIES
-- ============================================================

CREATE TABLE communities (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    uuid CHAR(36) NOT NULL UNIQUE,

    owner_id BIGINT UNSIGNED NOT NULL,

    name VARCHAR(255) NOT NULL,
    description TEXT,

    visibility ENUM(
        'public',
        'private'
    ) NOT NULL DEFAULT 'private',

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_communities_owner
        FOREIGN KEY (owner_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    INDEX idx_communities_owner (owner_id),
    INDEX idx_communities_visibility (visibility)
) ENGINE=InnoDB;


-- ============================================================
-- 22. COMMUNITY_MEMBERS
-- ============================================================

CREATE TABLE community_members (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    community_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,

    role ENUM(
        'member',
        'moderator',
        'admin'
    ) NOT NULL DEFAULT 'member',

    joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_community_members_community
        FOREIGN KEY (community_id)
        REFERENCES communities(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_community_members_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_community_member
        UNIQUE (community_id, user_id),

    INDEX idx_community_members_community (community_id),
    INDEX idx_community_members_user (user_id)
) ENGINE=InnoDB;


-- ============================================================
-- 23. COMMUNITY_WORKFLOWS
-- ============================================================
-- Compartilhamento de workflows dentro da comunidade.
-- ============================================================

CREATE TABLE community_workflows (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    community_id BIGINT UNSIGNED NOT NULL,
    workflow_id BIGINT UNSIGNED NOT NULL,

    shared_by BIGINT UNSIGNED NOT NULL,

    shared_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_community_workflows_community
        FOREIGN KEY (community_id)
        REFERENCES communities(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_community_workflows_workflow
        FOREIGN KEY (workflow_id)
        REFERENCES workflows(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_community_workflows_user
        FOREIGN KEY (shared_by)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_community_workflow
        UNIQUE (community_id, workflow_id),

    INDEX idx_community_workflows_community (community_id),
    INDEX idx_community_workflows_workflow (workflow_id)
) ENGINE=InnoDB;


-- ============================================================
-- 24. COMMUNITY_DATASETS
-- ============================================================

CREATE TABLE community_datasets (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    community_id BIGINT UNSIGNED NOT NULL,
    dataset_id BIGINT UNSIGNED NOT NULL,

    shared_by BIGINT UNSIGNED NOT NULL,

    shared_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_community_datasets_community
        FOREIGN KEY (community_id)
        REFERENCES communities(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_community_datasets_dataset
        FOREIGN KEY (dataset_id)
        REFERENCES datasets(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_community_datasets_user
        FOREIGN KEY (shared_by)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_community_dataset
        UNIQUE (community_id, dataset_id),

    INDEX idx_community_datasets_community (community_id),
    INDEX idx_community_datasets_dataset (dataset_id)
) ENGINE=InnoDB;


-- ============================================================
-- 25. MESSAGES
-- ============================================================
-- Chat simples da comunidade.
-- ============================================================

CREATE TABLE messages (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    uuid CHAR(36) NOT NULL UNIQUE,

    community_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,

    content TEXT NOT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    deleted_at DATETIME NULL,

    CONSTRAINT fk_messages_community
        FOREIGN KEY (community_id)
        REFERENCES communities(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_messages_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    INDEX idx_messages_community (community_id),
    INDEX idx_messages_user (user_id),
    INDEX idx_messages_created (created_at)
) ENGINE=InnoDB;


-- ============================================================
-- 26. AUDIT_LOGS
-- ============================================================
-- Rastreabilidade das operações importantes.
-- ============================================================

CREATE TABLE audit_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    user_id BIGINT UNSIGNED NULL,

    action VARCHAR(100) NOT NULL,

    entity_type VARCHAR(100) NOT NULL,
    entity_id BIGINT UNSIGNED NULL,

    before_data JSON NULL,
    after_data JSON NULL,

    metadata JSON NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_audit_logs_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE SET NULL,

    INDEX idx_audit_user (user_id),
    INDEX idx_audit_entity (entity_type, entity_id),
    INDEX idx_audit_action (action),
    INDEX idx_audit_created (created_at)
) ENGINE=InnoDB;


-- ============================================================
-- 27. INITIAL TECHNIQUES
-- ============================================================
-- Técnicas básicas para o MVP.
-- ============================================================

INSERT INTO techniques
(
    uuid,
    name,
    slug,
    category,
    description,
    input_type,
    output_type,
    parameter_schema,
    active
)
VALUES

(
    UUID(),
    'Dataset',
    'dataset',
    'input',
    'Entrada de dados para o workflow.',
    'Dataset',
    'Matrix',
    JSON_OBJECT(),
    TRUE
),

(
    UUID(),
    'SNV',
    'snv',
    'preprocessing',
    'Standard Normal Variate.',
    'Matrix',
    'Matrix',
    JSON_OBJECT(),
    TRUE
),

(
    UUID(),
    'MSC',
    'msc',
    'preprocessing',
    'Multiplicative Scatter Correction.',
    'Matrix',
    'Matrix',
    JSON_OBJECT(),
    TRUE
),

(
    UUID(),
    'Savitzky-Golay',
    'savitzky-golay',
    'preprocessing',
    'Filtro e derivada Savitzky-Golay.',
    'Matrix',
    'Matrix',
    JSON_OBJECT(
        'window',
        JSON_OBJECT(
            'type', 'integer',
            'default', 11
        ),
        'polyorder',
        JSON_OBJECT(
            'type', 'integer',
            'default', 2
        ),
        'derivative',
        JSON_OBJECT(
            'type', 'integer',
            'default', 0
        )
    ),
    TRUE
),

(
    UUID(),
    'Normalization',
    'normalization',
    'preprocessing',
    'Normalização dos dados.',
    'Matrix',
    'Matrix',
    JSON_OBJECT(),
    TRUE
),

(
    UUID(),
    'PCA',
    'pca',
    'exploratory',
    'Principal Component Analysis.',
    'Matrix',
    'PCA_Result',
    JSON_OBJECT(
        'components',
        JSON_OBJECT(
            'type', 'integer',
            'default', 2,
            'minimum', 1
        )
    ),
    TRUE
),

(
    UUID(),
    'PLS',
    'pls',
    'regression',
    'Partial Least Squares regression.',
    'Matrix',
    'Model',
    JSON_OBJECT(
        'components',
        JSON_OBJECT(
            'type', 'integer',
            'default', 5,
            'minimum', 1
        )
    ),
    TRUE
),

(
    UUID(),
    'PLS-DA',
    'pls-da',
    'classification',
    'Partial Least Squares Discriminant Analysis.',
    'Matrix',
    'Model',
    JSON_OBJECT(
        'components',
        JSON_OBJECT(
            'type', 'integer',
            'default', 5,
            'minimum', 1
        )
    ),
    TRUE
),

(
    UUID(),
    'PARAFAC',
    'parafac',
    'multiway',
    'Parallel Factor Analysis para dados multiway.',
    'Tensor',
    'PARAFAC_Result',
    JSON_OBJECT(
        'components',
        JSON_OBJECT(
            'type', 'integer',
            'default', 3,
            'minimum', 1
        ),
        'non_negative',
        JSON_OBJECT(
            'type', 'boolean',
            'default', TRUE
        )
    ),
    TRUE
),

(
    UUID(),
    'Tucker3',
    'tucker3',
    'multiway',
    'Tucker3 tensor decomposition.',
    'Tensor',
    'Tucker_Result',
    JSON_OBJECT(
        'rank',
        JSON_OBJECT(
            'type', 'array'
        )
    ),
    TRUE
),

(
    UUID(),
    'Random Forest',
    'random-forest',
    'classification',
    'Random Forest.',
    'Matrix',
    'Model',
    JSON_OBJECT(
        'n_estimators',
        JSON_OBJECT(
            'type', 'integer',
            'default', 100
        )
    ),
    TRUE
),

(
    UUID(),
    'RNN',
    'rnn',
    'deep_learning',
    'Recurrent Neural Network.',
    'Matrix',
    'Model',
    JSON_OBJECT(
        'hidden_layers',
        JSON_OBJECT(
            'type', 'integer',
            'default', 2
        ),
        'hidden_units',
        JSON_OBJECT(
            'type', 'integer',
            'default', 64
        ),
        'epochs',
        JSON_OBJECT(
            'type', 'integer',
            'default', 100
        )
    ),
    TRUE
),

(
    UUID(),
    'Cross Validation',
    'cross-validation',
    'validation',
    'Validação cruzada.',
    'Matrix',
    'Metrics',
    JSON_OBJECT(
        'folds',
        JSON_OBJECT(
            'type', 'integer',
            'default', 10,
            'minimum', 2
        )
    ),
    TRUE
);


-- ============================================================
-- 28. RESTORE FOREIGN KEY CHECKS
-- ============================================================

SET FOREIGN_KEY_CHECKS = 1;


-- ============================================================
-- 29. DONE
-- ============================================================

SELECT
    'Tchelab database initialized successfully.' AS message;

SELECT
    COUNT(*) AS techniques_created
FROM techniques;