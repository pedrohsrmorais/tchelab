-- MySQL dump 10.13  Distrib 8.0.42, for Linux (x86_64)
--
-- Host: localhost    Database: tchelab
-- ------------------------------------------------------
-- Server version	8.0.42-0ubuntu0.20.04.1

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `ai_interactions`
--

DROP TABLE IF EXISTS `ai_interactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ai_interactions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `type` enum('article_analysis','workflow_generation','workflow_assistance','result_analysis','other') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `article_id` bigint unsigned DEFAULT NULL,
  `workflow_id` bigint unsigned DEFAULT NULL,
  `execution_id` bigint unsigned DEFAULT NULL,
  `input_context` json DEFAULT NULL,
  `output` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `model` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uuid` (`uuid`),
  KEY `idx_ai_user` (`user_id`),
  KEY `idx_ai_type` (`type`),
  KEY `idx_ai_article` (`article_id`),
  KEY `idx_ai_workflow` (`workflow_id`),
  KEY `idx_ai_execution` (`execution_id`),
  CONSTRAINT `fk_ai_interactions_article` FOREIGN KEY (`article_id`) REFERENCES `articles` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ai_interactions_execution` FOREIGN KEY (`execution_id`) REFERENCES `executions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ai_interactions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ai_interactions_workflow` FOREIGN KEY (`workflow_id`) REFERENCES `workflows` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ai_interactions`
--

LOCK TABLES `ai_interactions` WRITE;
/*!40000 ALTER TABLE `ai_interactions` DISABLE KEYS */;
/*!40000 ALTER TABLE `ai_interactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `article_analyses`
--

DROP TABLE IF EXISTS `article_analyses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `article_analyses` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `article_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `status` enum('pending','processing','completed','failed') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `model` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `summary` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `methodology` json DEFAULT NULL,
  `raw_response` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `error_message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `generated_workflow_id` bigint unsigned DEFAULT NULL COMMENT 'Atalho direto para o workflow gerado a partir desta análise',
  `data_type_detected` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Tipo de dado identificado pela IA (ex: EEM, NIR, LC-DAD, LC-EEM-Phosphorescence)',
  `dimensionality_detected` tinyint unsigned DEFAULT NULL COMMENT 'Ordem analítica dos dados identificada pela IA (sem limite superior fixo)',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uuid` (`uuid`),
  KEY `idx_article_analyses_article` (`article_id`),
  KEY `idx_article_analyses_user` (`user_id`),
  KEY `idx_article_analyses_status` (`status`),
  KEY `idx_article_analyses_workflow` (`generated_workflow_id`),
  CONSTRAINT `fk_article_analyses_article` FOREIGN KEY (`article_id`) REFERENCES `articles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_article_analyses_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_article_analyses_workflow` FOREIGN KEY (`generated_workflow_id`) REFERENCES `workflows` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `article_analyses`
--

LOCK TABLES `article_analyses` WRITE;
/*!40000 ALTER TABLE `article_analyses` DISABLE KEYS */;
/*!40000 ALTER TABLE `article_analyses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `article_techniques`
--

DROP TABLE IF EXISTS `article_techniques`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `article_techniques` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `article_analysis_id` bigint unsigned NOT NULL,
  `technique_id` bigint unsigned NOT NULL,
  `step_order` int unsigned DEFAULT NULL,
  `parameters` json DEFAULT NULL,
  `evidence` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `confidence` float DEFAULT NULL COMMENT 'Confiança da IA na extração, 0.0 a 1.0',
  `raw_text` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'Citação exata do texto que originou a identificação',
  `mapping_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'Raciocínio da IA ao mapear o texto à técnica do catálogo',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_article_techniques_analysis` (`article_analysis_id`),
  KEY `idx_article_techniques_technique` (`technique_id`),
  CONSTRAINT `fk_article_techniques_analysis` FOREIGN KEY (`article_analysis_id`) REFERENCES `article_analyses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_article_techniques_technique` FOREIGN KEY (`technique_id`) REFERENCES `techniques` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `article_techniques`
--

LOCK TABLES `article_techniques` WRITE;
/*!40000 ALTER TABLE `article_techniques` DISABLE KEYS */;
/*!40000 ALTER TABLE `article_techniques` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `articles`
--

DROP TABLE IF EXISTS `articles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `articles` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `doi` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `abstract` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `authors` json DEFAULT NULL,
  `journal` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `publisher` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `publication_date` date DEFAULT NULL,
  `url` varchar(1000) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pdf_path` varchar(1000) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `full_text_path` varchar(1000) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Caminho do texto extraído do PDF, reutilizado em análises futuras sem reprocessar',
  `extraction_status` enum('pending','extracted','failed') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'pending' COMMENT 'Status do pipeline de extração de texto do PDF',
  `metadata` json DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uuid` (`uuid`),
  KEY `idx_articles_user` (`user_id`),
  KEY `idx_articles_doi` (`doi`),
  KEY `idx_articles_publication_date` (`publication_date`),
  KEY `idx_articles_extraction` (`extraction_status`),
  CONSTRAINT `fk_articles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `articles`
--

LOCK TABLES `articles` WRITE;
/*!40000 ALTER TABLE `articles` DISABLE KEYS */;
/*!40000 ALTER TABLE `articles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `audit_logs`
--

DROP TABLE IF EXISTS `audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned DEFAULT NULL,
  `action` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_type` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_id` bigint unsigned DEFAULT NULL,
  `before_data` json DEFAULT NULL,
  `after_data` json DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_user` (`user_id`),
  KEY `idx_audit_entity` (`entity_type`,`entity_id`),
  KEY `idx_audit_action` (`action`),
  KEY `idx_audit_created` (`created_at`),
  CONSTRAINT `fk_audit_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `audit_logs`
--

LOCK TABLES `audit_logs` WRITE;
/*!40000 ALTER TABLE `audit_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `audit_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `collection_spectra`
--

DROP TABLE IF EXISTS `collection_spectra`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `collection_spectra` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `collection_id` bigint unsigned NOT NULL,
  `spectrum_id` bigint unsigned NOT NULL,
  `added_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_collection_spectrum` (`collection_id`,`spectrum_id`),
  KEY `idx_collection_spectra_collection` (`collection_id`),
  KEY `idx_collection_spectra_spectrum` (`spectrum_id`),
  CONSTRAINT `fk_collection_spectra_collection` FOREIGN KEY (`collection_id`) REFERENCES `collections` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_collection_spectra_spectrum` FOREIGN KEY (`spectrum_id`) REFERENCES `spectra` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `collection_spectra`
--

LOCK TABLES `collection_spectra` WRITE;
/*!40000 ALTER TABLE `collection_spectra` DISABLE KEYS */;
/*!40000 ALTER TABLE `collection_spectra` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `collections`
--

DROP TABLE IF EXISTS `collections`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `collections` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `visibility` enum('public','private') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'private',
  `spectra_count` int unsigned DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uuid` (`uuid`),
  KEY `idx_collections_user` (`user_id`),
  CONSTRAINT `fk_collections_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `collections`
--

LOCK TABLES `collections` WRITE;
/*!40000 ALTER TABLE `collections` DISABLE KEYS */;
/*!40000 ALTER TABLE `collections` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `communities`
--

DROP TABLE IF EXISTS `communities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `communities` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `owner_id` bigint unsigned NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `visibility` enum('public','private') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'private',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uuid` (`uuid`),
  KEY `idx_communities_owner` (`owner_id`),
  KEY `idx_communities_visibility` (`visibility`),
  CONSTRAINT `fk_communities_owner` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `communities`
--

LOCK TABLES `communities` WRITE;
/*!40000 ALTER TABLE `communities` DISABLE KEYS */;
/*!40000 ALTER TABLE `communities` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `community_datasets`
--

DROP TABLE IF EXISTS `community_datasets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `community_datasets` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `community_id` bigint unsigned NOT NULL,
  `dataset_id` bigint unsigned NOT NULL,
  `shared_by` bigint unsigned NOT NULL,
  `shared_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_community_dataset` (`community_id`,`dataset_id`),
  KEY `fk_community_datasets_user` (`shared_by`),
  KEY `idx_community_datasets_community` (`community_id`),
  KEY `idx_community_datasets_dataset` (`dataset_id`),
  CONSTRAINT `fk_community_datasets_community` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_community_datasets_dataset` FOREIGN KEY (`dataset_id`) REFERENCES `datasets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_community_datasets_user` FOREIGN KEY (`shared_by`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `community_datasets`
--

LOCK TABLES `community_datasets` WRITE;
/*!40000 ALTER TABLE `community_datasets` DISABLE KEYS */;
/*!40000 ALTER TABLE `community_datasets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `community_members`
--

DROP TABLE IF EXISTS `community_members`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `community_members` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `community_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `role` enum('member','moderator','admin') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'member',
  `joined_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_community_member` (`community_id`,`user_id`),
  KEY `idx_community_members_community` (`community_id`),
  KEY `idx_community_members_user` (`user_id`),
  CONSTRAINT `fk_community_members_community` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_community_members_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `community_members`
--

LOCK TABLES `community_members` WRITE;
/*!40000 ALTER TABLE `community_members` DISABLE KEYS */;
/*!40000 ALTER TABLE `community_members` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `community_workflows`
--

DROP TABLE IF EXISTS `community_workflows`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `community_workflows` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `community_id` bigint unsigned NOT NULL,
  `workflow_id` bigint unsigned NOT NULL,
  `shared_by` bigint unsigned NOT NULL,
  `shared_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_community_workflow` (`community_id`,`workflow_id`),
  KEY `fk_community_workflows_user` (`shared_by`),
  KEY `idx_community_workflows_community` (`community_id`),
  KEY `idx_community_workflows_workflow` (`workflow_id`),
  CONSTRAINT `fk_community_workflows_community` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_community_workflows_user` FOREIGN KEY (`shared_by`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_community_workflows_workflow` FOREIGN KEY (`workflow_id`) REFERENCES `workflows` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `community_workflows`
--

LOCK TABLES `community_workflows` WRITE;
/*!40000 ALTER TABLE `community_workflows` DISABLE KEYS */;
/*!40000 ALTER TABLE `community_workflows` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `dataset_lineage`
--

DROP TABLE IF EXISTS `dataset_lineage`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dataset_lineage` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `source_dataset_id` bigint unsigned NOT NULL COMMENT 'Dataset de entrada da operação.',
  `target_dataset_id` bigint unsigned NOT NULL COMMENT 'Dataset produzido pela operação.',
  `operation` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Slug da operação executada (ex: transpose, reshape, unfolding, concatenacao, soma).',
  `parameters` json DEFAULT NULL COMMENT 'Parâmetros utilizados na operação (ex: {"axes": [1, 0]} para transpose).',
  `workflow_id` bigint unsigned DEFAULT NULL COMMENT 'Workflow que gerou a transformação, quando aplicável.',
  `workflow_node_id` bigint unsigned DEFAULT NULL COMMENT 'Nó específico do workflow responsável pela operação.',
  `execution_id` bigint unsigned DEFAULT NULL COMMENT 'Execução em que a transformação ocorreu.',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_lineage` (`source_dataset_id`,`target_dataset_id`,`operation`),
  KEY `idx_lineage_source` (`source_dataset_id`),
  KEY `idx_lineage_target` (`target_dataset_id`),
  KEY `idx_lineage_workflow` (`workflow_id`),
  KEY `idx_lineage_node` (`workflow_node_id`),
  KEY `idx_lineage_execution` (`execution_id`),
  CONSTRAINT `fk_lineage_execution` FOREIGN KEY (`execution_id`) REFERENCES `executions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lineage_source` FOREIGN KEY (`source_dataset_id`) REFERENCES `datasets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lineage_target` FOREIGN KEY (`target_dataset_id`) REFERENCES `datasets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lineage_workflow` FOREIGN KEY (`workflow_id`) REFERENCES `workflows` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lineage_workflow_node` FOREIGN KEY (`workflow_node_id`) REFERENCES `workflow_nodes` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Linhagem de datasets: cada linha registra que target_dataset_id foi produzido a partir de source_dataset_id pela operação indicada. Permite reconstruir a cadeia completa de transformações.';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `dataset_lineage`
--

LOCK TABLES `dataset_lineage` WRITE;
/*!40000 ALTER TABLE `dataset_lineage` DISABLE KEYS */;
/*!40000 ALTER TABLE `dataset_lineage` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `dataset_spectra`
--

DROP TABLE IF EXISTS `dataset_spectra`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dataset_spectra` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `dataset_id` bigint unsigned NOT NULL,
  `spectrum_id` bigint unsigned NOT NULL,
  `position` int unsigned NOT NULL,
  `added_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dataset_spectrum` (`dataset_id`,`spectrum_id`),
  UNIQUE KEY `uq_dataset_position` (`dataset_id`,`position`),
  KEY `idx_dataset_spectra_dataset` (`dataset_id`),
  KEY `idx_dataset_spectra_spectrum` (`spectrum_id`),
  CONSTRAINT `fk_dataset_spectra_dataset` FOREIGN KEY (`dataset_id`) REFERENCES `datasets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dataset_spectra_spectrum` FOREIGN KEY (`spectrum_id`) REFERENCES `spectra` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `dataset_spectra`
--

LOCK TABLES `dataset_spectra` WRITE;
/*!40000 ALTER TABLE `dataset_spectra` DISABLE KEYS */;
/*!40000 ALTER TABLE `dataset_spectra` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `datasets`
--

DROP TABLE IF EXISTS `datasets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `datasets` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `visibility` enum('public','private') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'private',
  `data_type` enum('matrix','tensor') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'matrix',
  `technique` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `x_unit` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `y_unit` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `spectra_count` int unsigned DEFAULT '0',
  `x_points` int unsigned DEFAULT NULL,
  `x_min` double DEFAULT NULL,
  `x_max` double DEFAULT NULL,
  `reference_labels` json DEFAULT NULL COMMENT 'Nomes das variáveis alvo, ex: ["analyte_1","analyte_2"]',
  `dimensions` json DEFAULT NULL COMMENT 'Shape completo do array, incluindo eixo de amostras se existir. Ex: [9,17,19,10,5] para um array de amostras x 4 modos',
  `mode_labels` json DEFAULT NULL COMMENT 'Nomes de cada modo na ordem de `dimensions`. Ex: ["samples","chrom_time","excitation","emission","phosphorescence_decay"]. Sem limite de tamanho.',
  `mode_ranges` json DEFAULT NULL COMMENT 'Ranges [first,last,step] de cada modo, no formato do mvc3_gui. Ex: [[1,17,1],[1,19,1],[1,10,1]]',
  `sample_axis` tinyint unsigned DEFAULT '0' COMMENT 'Índice (0-based) do modo em `dimensions`/`mode_labels` que representa amostras. NULL = não existe eixo de amostras — o array é uma medição única (ex: matriz aumentada MCR-ALS, imagem hiperespectral, array cinético isolado).',
  `data_order` tinyint unsigned DEFAULT '1' COMMENT 'Ordem analítica de UMA unidade de medição, excluindo o eixo de amostras se ele existir. Sem teto científico — CHECK 1..20 é só proteção contra erro de digitação.',
  `augmentation_scheme` json DEFAULT NULL COMMENT 'Descreve dados concatenados/não ortogonais. Ex: {"type":"augmented","augmented_mode":"C&D","n_blocks":9,"block_sizes":[300,300,...]}. NULL para arrays regulares (ortogonais).',
  `file_format` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Formato de serialização: X_vectors, X_matrices, numpy, hdf5, etc.',
  `storage_path` varchar(1000) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Caminho no storage externo (S3/disco/Zarr) onde o array N-dimensional está armazenado. NULL = dataset não persistido externamente ainda.',
  `parent_dataset_id` bigint unsigned DEFAULT NULL COMMENT 'Dataset de origem quando este foi produzido por uma operação (atalho de conveniência; linhagem completa em dataset_lineage).',
  `derived_from_operation` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Slug da operação que gerou este dataset (ex: transpose, reshape, unfolding). Preenchido junto com parent_dataset_id.',
  `derived_parameters` json DEFAULT NULL COMMENT 'Parâmetros da operação que gerou este dataset (ex: {"axes": [1, 0]} para transpose).',
  `metadata` json DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uuid` (`uuid`),
  KEY `idx_datasets_user` (`user_id`),
  KEY `idx_datasets_type` (`data_type`),
  KEY `idx_datasets_visibility` (`visibility`),
  KEY `idx_datasets_order` (`data_order`),
  KEY `idx_datasets_parent` (`parent_dataset_id`),
  CONSTRAINT `fk_datasets_parent` FOREIGN KEY (`parent_dataset_id`) REFERENCES `datasets` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_datasets_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_datasets_order` CHECK ((`data_order` between 1 and 20)),
  CONSTRAINT `chk_datasets_sample_axis` CHECK (((`sample_axis` is null) or (`sample_axis` <= 20)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Dataset estruturado. Suporta arrays N-way de ordem arbitrária via JSON, sem limite estrutural de dimensões.';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `datasets`
--

LOCK TABLES `datasets` WRITE;
/*!40000 ALTER TABLE `datasets` DISABLE KEYS */;
/*!40000 ALTER TABLE `datasets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `execution_comparison_items`
--

DROP TABLE IF EXISTS `execution_comparison_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `execution_comparison_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `comparison_id` bigint unsigned NOT NULL,
  `execution_id` bigint unsigned NOT NULL,
  `label` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `position` int unsigned NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_comparison_execution` (`comparison_id`,`execution_id`),
  KEY `idx_comparison_items_comparison` (`comparison_id`),
  KEY `idx_comparison_items_execution` (`execution_id`),
  CONSTRAINT `fk_comp_items_comparison` FOREIGN KEY (`comparison_id`) REFERENCES `execution_comparisons` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_comp_items_execution` FOREIGN KEY (`execution_id`) REFERENCES `executions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `execution_comparison_items`
--

LOCK TABLES `execution_comparison_items` WRITE;
/*!40000 ALTER TABLE `execution_comparison_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `execution_comparison_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `execution_comparisons`
--

DROP TABLE IF EXISTS `execution_comparisons`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `execution_comparisons` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `conclusion` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uuid` (`uuid`),
  KEY `idx_comparisons_user` (`user_id`),
  CONSTRAINT `fk_comparisons_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `execution_comparisons`
--

LOCK TABLES `execution_comparisons` WRITE;
/*!40000 ALTER TABLE `execution_comparisons` DISABLE KEYS */;
/*!40000 ALTER TABLE `execution_comparisons` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `execution_nodes`
--

DROP TABLE IF EXISTS `execution_nodes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `execution_nodes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `execution_id` bigint unsigned NOT NULL,
  `node_key` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `technique_id` bigint unsigned DEFAULT NULL,
  `status` enum('pending','running','completed','failed','skipped') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `parameters` json DEFAULT NULL,
  `input_data` json DEFAULT NULL,
  `input_metadata` json DEFAULT NULL COMMENT 'Metadados das entradas recebidas pelo nó: {port: {type, shape, dtype}}. Permite rastrear o que foi consumido sem rearmazenar os dados.',
  `output_data` json DEFAULT NULL COMMENT 'Output pequeno embutido diretamente (scores, métricas, listas curtas)',
  `output_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Tipo lógico/semântico do output principal: scalar, vector, matrix, tensor, model, metrics, classification, prediction, complex_vector, complex_matrix.',
  `output_shape` json DEFAULT NULL COMMENT 'Shape do output principal como array JSON (ex: [100, 5] para matrix, [5] para vetor, [] para scalar).',
  `output_dtype` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Dtype numérico do output (ex: float32, float64, complex64, complex128, int32).',
  `output_storage_path` varchar(1000) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Caminho no storage externo (S3/disco) para outputs grandes: tensores N-way, modelos serializados',
  `output_storage_type` enum('json','numpy','pickle','hdf5','csv','other') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Formato do arquivo no storage externo',
  `metrics` json DEFAULT NULL,
  `runtime_ms` bigint unsigned DEFAULT NULL,
  `logs` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `error_message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `started_at` datetime DEFAULT NULL,
  `finished_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_execution_node` (`execution_id`,`node_key`),
  KEY `idx_execution_nodes_execution` (`execution_id`),
  KEY `idx_execution_nodes_technique` (`technique_id`),
  KEY `idx_execution_nodes_status` (`status`),
  CONSTRAINT `fk_execution_nodes_execution` FOREIGN KEY (`execution_id`) REFERENCES `executions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_execution_nodes_technique` FOREIGN KEY (`technique_id`) REFERENCES `techniques` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `execution_nodes`
--

LOCK TABLES `execution_nodes` WRITE;
/*!40000 ALTER TABLE `execution_nodes` DISABLE KEYS */;
/*!40000 ALTER TABLE `execution_nodes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `executions`
--

DROP TABLE IF EXISTS `executions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `executions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `workflow_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `dataset_id` bigint unsigned DEFAULT NULL,
  `collection_id` bigint unsigned DEFAULT NULL COMMENT 'Alternativa a dataset_id: coleção de espectros usada diretamente como entrada',
  `parent_execution_id` bigint unsigned DEFAULT NULL COMMENT 'Execução pai quando esta é uma variante para comparação de modelos',
  `comparison_group` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Chave livre para agrupar execuções comparadas lado a lado',
  `label` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Rótulo descritivo (ex: "PARAFAC 3 comp sem restrições")',
  `status` enum('queued','running','completed','failed','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'queued',
  `parameters` json DEFAULT NULL,
  `results` json DEFAULT NULL,
  `error_message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `random_seed` bigint DEFAULT NULL,
  `code_version` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `environment` json DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  `finished_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uuid` (`uuid`),
  KEY `idx_executions_workflow` (`workflow_id`),
  KEY `idx_executions_user` (`user_id`),
  KEY `idx_executions_dataset` (`dataset_id`),
  KEY `idx_executions_collection` (`collection_id`),
  KEY `idx_executions_status` (`status`),
  KEY `idx_executions_created` (`created_at`),
  KEY `idx_executions_parent` (`parent_execution_id`),
  KEY `idx_executions_comparison_group` (`comparison_group`),
  CONSTRAINT `fk_executions_collection` FOREIGN KEY (`collection_id`) REFERENCES `collections` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_executions_dataset` FOREIGN KEY (`dataset_id`) REFERENCES `datasets` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_executions_parent` FOREIGN KEY (`parent_execution_id`) REFERENCES `executions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_executions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_executions_workflow` FOREIGN KEY (`workflow_id`) REFERENCES `workflows` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `executions`
--

LOCK TABLES `executions` WRITE;
/*!40000 ALTER TABLE `executions` DISABLE KEYS */;
/*!40000 ALTER TABLE `executions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `jobs`
--

DROP TABLE IF EXISTS `jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `jobs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `job_type` enum('train_model','predict','preprocess','execute_workflow','analyze_article','generate_workflow','operate_dataset','export','other') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tipo do job. operate_dataset cobre operações matemáticas e estruturais sobre arrays (transpose, reshape, matmul, svd, etc.) executadas fora de um workflow completo.',
  `model_id` bigint unsigned DEFAULT NULL,
  `dataset_id` bigint unsigned DEFAULT NULL,
  `workflow_id` bigint unsigned DEFAULT NULL,
  `execution_id` bigint unsigned DEFAULT NULL,
  `celery_task_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `queue_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'default',
  `payload` json DEFAULT NULL,
  `status` enum('queued','running','done','failed','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'queued',
  `progress` decimal(5,2) DEFAULT '0.00',
  `result` json DEFAULT NULL,
  `error_message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `error_traceback` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `queued_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `started_at` datetime DEFAULT NULL,
  `finished_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uuid` (`uuid`),
  KEY `fk_jobs_model` (`model_id`),
  KEY `fk_jobs_dataset` (`dataset_id`),
  KEY `idx_jobs_user` (`user_id`),
  KEY `idx_jobs_status` (`status`),
  KEY `idx_jobs_type` (`job_type`),
  KEY `idx_jobs_workflow` (`workflow_id`),
  KEY `idx_jobs_execution` (`execution_id`),
  CONSTRAINT `fk_jobs_dataset` FOREIGN KEY (`dataset_id`) REFERENCES `datasets` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_jobs_execution` FOREIGN KEY (`execution_id`) REFERENCES `executions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_jobs_model` FOREIGN KEY (`model_id`) REFERENCES `models` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_jobs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_jobs_workflow` FOREIGN KEY (`workflow_id`) REFERENCES `workflows` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `jobs`
--

LOCK TABLES `jobs` WRITE;
/*!40000 ALTER TABLE `jobs` DISABLE KEYS */;
/*!40000 ALTER TABLE `jobs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `messages`
--

DROP TABLE IF EXISTS `messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `messages` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `community_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `content` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uuid` (`uuid`),
  KEY `idx_messages_community` (`community_id`),
  KEY `idx_messages_user` (`user_id`),
  KEY `idx_messages_created` (`created_at`),
  CONSTRAINT `fk_messages_community` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_messages_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `messages`
--

LOCK TABLES `messages` WRITE;
/*!40000 ALTER TABLE `messages` DISABLE KEYS */;
/*!40000 ALTER TABLE `messages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `metrics`
--

DROP TABLE IF EXISTS `metrics`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `metrics` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `execution_node_id` bigint unsigned NOT NULL,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` double NOT NULL,
  `dataset_split` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unit` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_metrics_execution_node` (`execution_node_id`),
  KEY `idx_metrics_name` (`name`),
  CONSTRAINT `fk_metrics_execution_node` FOREIGN KEY (`execution_node_id`) REFERENCES `execution_nodes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `metrics`
--

LOCK TABLES `metrics` WRITE;
/*!40000 ALTER TABLE `metrics` DISABLE KEYS */;
/*!40000 ALTER TABLE `metrics` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `models`
--

DROP TABLE IF EXISTS `models`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `models` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `dataset_id` bigint unsigned DEFAULT NULL,
  `execution_id` bigint unsigned DEFAULT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `algorithm` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `model_type` enum('regression','classification','exploratory','other') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other',
  `hyperparameters` json DEFAULT NULL,
  `preprocessing` json DEFAULT NULL,
  `selected_vars` json DEFAULT NULL,
  `model_path` varchar(1000) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `model_size_kb` bigint unsigned DEFAULT NULL,
  `status` enum('pending','training','ready','failed') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `metrics_cal` json DEFAULT NULL,
  `metrics_cv` json DEFAULT NULL,
  `metrics_ext` json DEFAULT NULL,
  `train_samples` int unsigned DEFAULT NULL,
  `test_samples` int unsigned DEFAULT NULL,
  `cv_folds` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uuid` (`uuid`),
  KEY `idx_models_user` (`user_id`),
  KEY `idx_models_dataset` (`dataset_id`),
  KEY `idx_models_execution` (`execution_id`),
  KEY `idx_models_algorithm` (`algorithm`),
  KEY `idx_models_status` (`status`),
  CONSTRAINT `fk_models_dataset` FOREIGN KEY (`dataset_id`) REFERENCES `datasets` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_models_execution` FOREIGN KEY (`execution_id`) REFERENCES `executions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_models_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `models`
--

LOCK TABLES `models` WRITE;
/*!40000 ALTER TABLE `models` DISABLE KEYS */;
/*!40000 ALTER TABLE `models` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `predictions`
--

DROP TABLE IF EXISTS `predictions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `predictions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `model_id` bigint unsigned NOT NULL,
  `job_id` bigint unsigned DEFAULT NULL,
  `source_dataset_id` bigint unsigned DEFAULT NULL,
  `source_filename` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `results` json NOT NULL,
  `sample_count` int unsigned DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uuid` (`uuid`),
  KEY `fk_predictions_job` (`job_id`),
  KEY `idx_predictions_user` (`user_id`),
  KEY `idx_predictions_model` (`model_id`),
  KEY `idx_predictions_dataset` (`source_dataset_id`),
  CONSTRAINT `fk_predictions_dataset` FOREIGN KEY (`source_dataset_id`) REFERENCES `datasets` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_predictions_model` FOREIGN KEY (`model_id`) REFERENCES `models` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_predictions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `predictions`
--

LOCK TABLES `predictions` WRITE;
/*!40000 ALTER TABLE `predictions` DISABLE KEYS */;
/*!40000 ALTER TABLE `predictions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `spectra`
--

DROP TABLE IF EXISTS `spectra`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `spectra` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `sample_class` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `technique` enum('NIR','Raman','FTIR','UV-Vis','NMR','Fluorescence','Other') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Other',
  `x_unit` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `y_unit` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `x_values` json NOT NULL,
  `y_values` json NOT NULL,
  `x_points` int unsigned NOT NULL,
  `x_min` double DEFAULT NULL,
  `x_max` double DEFAULT NULL,
  `reference_value` double DEFAULT NULL,
  `reference_values` json DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `source` enum('file','paste','api') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'file',
  `source_filename` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `visibility` enum('public','private') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'private',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uuid` (`uuid`),
  KEY `idx_spectra_user` (`user_id`),
  KEY `idx_spectra_technique` (`technique`),
  KEY `idx_spectra_visibility` (`visibility`),
  KEY `idx_spectra_created` (`created_at`),
  CONSTRAINT `fk_spectra_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `spectra`
--

LOCK TABLES `spectra` WRITE;
/*!40000 ALTER TABLE `spectra` DISABLE KEYS */;
/*!40000 ALTER TABLE `spectra` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `technique_compatibilities`
--

DROP TABLE IF EXISTS `technique_compatibilities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `technique_compatibilities` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `source_technique_id` bigint unsigned NOT NULL,
  `target_technique_id` bigint unsigned NOT NULL,
  `source_port` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `target_port` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `condition` json DEFAULT NULL COMMENT 'Condições adicionais, ex: {"min_order": 3} ou {"requires_sample_axis": false}',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `is_valid` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_compat` (`source_technique_id`,`target_technique_id`,`source_port`,`target_port`),
  KEY `idx_compat_source` (`source_technique_id`),
  KEY `idx_compat_target` (`target_technique_id`),
  KEY `idx_compat_valid` (`is_valid`),
  CONSTRAINT `fk_compat_source` FOREIGN KEY (`source_technique_id`) REFERENCES `techniques` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_compat_target` FOREIGN KEY (`target_technique_id`) REFERENCES `techniques` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Mapa de compatibilidades entre técnicas — lista branca e lista negra explícitas.';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `technique_compatibilities`
--

LOCK TABLES `technique_compatibilities` WRITE;
/*!40000 ALTER TABLE `technique_compatibilities` DISABLE KEYS */;
/*!40000 ALTER TABLE `technique_compatibilities` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `techniques`
--

DROP TABLE IF EXISTS `techniques`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `techniques` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` enum('input','preprocessing','exploratory','regression','classification','multiway','multiway_regression','multiway_classification','calibration','interferents','deep_learning','visualization','validation','variable_selection','optimization','synthetic','utility','other') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other',
  `subcategory` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Subcategoria livre dentro da família (ex: third_order, augmented)',
  `family` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Família do catálogo de scripts (ex: 07_decomposicao_multiway)',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `input_type` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Tipo genérico de entrada para filtragem rápida (Matrix, Tensor, Model...)',
  `output_type` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Tipo genérico de saída para filtragem rápida',
  `input_schema` json DEFAULT NULL COMMENT 'Schema detalhado dos ports de entrada: {port: {type, shape, ...}}',
  `output_schema` json DEFAULT NULL COMMENT 'Schema detalhado dos ports de saída — base da validação de conexões do workflow',
  `min_order` tinyint unsigned DEFAULT NULL COMMENT 'Ordem analítica mínima suportada pela técnica (excluindo eixo de amostras, se houver)',
  `max_order` tinyint unsigned DEFAULT NULL COMMENT 'Ordem analítica máxima suportada. NULL = sem teto (ex: PARAFAC/Tucker genéricos aceitam N-way arbitrário)',
  `requires_sample_axis` tinyint(1) DEFAULT NULL COMMENT 'Tri-state: 1 = exige eixo de amostras (ex: PLS, CV), 0 = opera sobre array único sem amostras (ex: MCR-ALS num bloco aumentado), NULL = indiferente/aceita ambos (ex: PARAFAC genérico)',
  `parameter_schema` json DEFAULT NULL COMMENT 'Schema JSON dos parâmetros configuráveis pelo usuário',
  `tags` json DEFAULT NULL COMMENT 'Tags livres para busca semântica (ex: ["EEM","fluorescence","N-way"])',
  `version` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_beta` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Técnica experimental ainda não validada para produção',
  `implementation` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Caminho do script Python que implementa a técnica',
  `documentation` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uuid` (`uuid`),
  UNIQUE KEY `slug` (`slug`),
  KEY `idx_techniques_category` (`category`),
  KEY `idx_techniques_active` (`active`),
  KEY `idx_techniques_slug` (`slug`),
  KEY `idx_techniques_family` (`family`),
  KEY `idx_techniques_subcategory` (`subcategory`),
  KEY `idx_techniques_order` (`min_order`,`max_order`),
  CONSTRAINT `chk_techniques_max_order` CHECK (((`max_order` is null) or (`max_order` between 1 and 20))),
  CONSTRAINT `chk_techniques_min_order` CHECK (((`min_order` is null) or (`min_order` between 1 and 20))),
  CONSTRAINT `chk_techniques_order_range` CHECK (((`max_order` is null) or (`min_order` is null) or (`max_order` >= `min_order`)))
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Catálogo de blocos executáveis. min_order/max_order sem teto científico — CHECK 1..20 é apenas proteção contra erro de digitação.';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `techniques`
--

LOCK TABLES `techniques` WRITE;
/*!40000 ALTER TABLE `techniques` DISABLE KEYS */;
INSERT INTO `techniques` VALUES (1,'399fab36-b854-11f1-a672-8eaf6b4b2bf7','Dataset','dataset','input','importacao','01_dados','Entrada de dados para o workflow.','Dataset','Matrix',NULL,'{\"X\": {\"type\": \"matrix\"}}',1,NULL,NULL,'{}','[\"input\", \"dataset\"]','1.0',0,NULL,NULL,1,'2026-09-24 17:12:10','2026-09-24 17:12:10'),(2,'39a01eb1-b854-11f1-a672-8eaf6b4b2bf7','SNV','snv','preprocessing','scatter_correction','02_pre_processamento','Standard Normal Variate.','Matrix','Matrix','{\"X\": {\"type\": \"matrix\"}}','{\"X\": {\"type\": \"matrix\"}}',1,1,1,'{}','[\"preprocessing\", \"NIR\", \"scatter\"]','1.0',0,NULL,NULL,1,'2026-09-24 17:12:10','2026-09-24 17:12:10'),(3,'39a02237-b854-11f1-a672-8eaf6b4b2bf7','MSC','msc','preprocessing','scatter_correction','02_pre_processamento','Multiplicative Scatter Correction.','Matrix','Matrix','{\"X\": {\"type\": \"matrix\"}}','{\"X\": {\"type\": \"matrix\"}}',1,1,1,'{}','[\"preprocessing\", \"NIR\", \"scatter\"]','1.0',0,NULL,NULL,1,'2026-09-24 17:12:10','2026-09-24 17:12:10'),(4,'39a024ad-b854-11f1-a672-8eaf6b4b2bf7','Savitzky-Golay','savitzky-golay','preprocessing','smoothing_derivative','02_pre_processamento','Filtro e derivada Savitzky-Golay.','Matrix','Matrix','{\"X\": {\"type\": \"matrix\"}}','{\"X\": {\"type\": \"matrix\"}}',1,1,NULL,'{\"window\": {\"type\": \"integer\", \"default\": 11}, \"polyorder\": {\"type\": \"integer\", \"default\": 2}, \"derivative\": {\"type\": \"integer\", \"default\": 0}}','[\"preprocessing\", \"smoothing\", \"derivative\"]','1.0',0,NULL,NULL,1,'2026-09-24 17:12:10','2026-09-24 17:12:10'),(5,'39a030f1-b854-11f1-a672-8eaf6b4b2bf7','Normalization','normalization','preprocessing','scaling','02_pre_processamento','Normalização dos dados.','Matrix','Matrix','{\"X\": {\"type\": \"matrix\"}}','{\"X\": {\"type\": \"matrix\"}}',1,NULL,NULL,'{}','[\"preprocessing\", \"scaling\"]','1.0',0,NULL,NULL,1,'2026-09-24 17:12:10','2026-09-24 17:12:10'),(6,'39a039be-b854-11f1-a672-8eaf6b4b2bf7','PCA','pca','exploratory',NULL,'03_exploratoria_1d','Principal Component Analysis.','Matrix','PCA_Result','{\"X\": {\"type\": \"matrix\"}}','{\"scores\": {\"type\": \"matrix\", \"shape\": \"(I, R)\"}, \"loadings\": {\"type\": \"matrix\", \"shape\": \"(J, R)\"}, \"explained_variance\": {\"type\": \"float\"}}',1,1,1,'{\"components\": {\"type\": \"integer\", \"default\": 2, \"minimum\": 1}}','[\"exploratory\", \"PCA\"]','1.0',0,NULL,NULL,1,'2026-09-24 17:12:10','2026-09-24 17:12:10'),(7,'39a03e67-b854-11f1-a672-8eaf6b4b2bf7','PLS','pls','regression',NULL,'04_regressao_1d','Partial Least Squares regression.','Matrix','Model','{\"X\": {\"type\": \"matrix\"}, \"y\": {\"type\": \"matrix\"}}','{\"model\": {\"type\": \"model\"}, \"scores\": {\"type\": \"matrix\"}}',1,1,1,'{\"components\": {\"type\": \"integer\", \"default\": 5, \"minimum\": 1}}','[\"regression\", \"PLS\"]','1.0',0,NULL,NULL,1,'2026-09-24 17:12:10','2026-09-24 17:12:10'),(8,'39a04101-b854-11f1-a672-8eaf6b4b2bf7','PLS-DA','pls-da','classification',NULL,'05_classificacao_1d','Partial Least Squares Discriminant Analysis.','Matrix','Model','{\"X\": {\"type\": \"matrix\"}, \"y\": {\"type\": \"matrix\"}}','{\"model\": {\"type\": \"model\"}}',1,1,1,'{\"components\": {\"type\": \"integer\", \"default\": 5, \"minimum\": 1}}','[\"classification\", \"PLS-DA\"]','1.0',0,NULL,NULL,1,'2026-09-24 17:12:10','2026-09-24 17:12:10'),(9,'39a044fb-b854-11f1-a672-8eaf6b4b2bf7','PARAFAC','parafac','multiway',NULL,'07_decomposicao_multiway','Parallel Factor Analysis para dados multiway. Suporta N-way de ordem arbitrária (3-way, 4-way, 5-way ou mais), com ou sem eixo de amostras.','Tensor','PARAFAC_Result','{\"X\": {\"type\": \"tensor\"}}','{\"scores\": {\"type\": \"matrix\", \"shape\": \"(I, R)\"}, \"loadings\": {\"type\": \"array\", \"description\": \"uma matriz de loadings por modo, além do eixo de amostras\"}, \"residuals\": {\"type\": \"tensor\"}, \"core_consistency\": {\"type\": \"float\"}, \"explained_variance\": {\"type\": \"float\"}}',2,NULL,NULL,'{\"max_iter\": {\"type\": \"integer\", \"default\": 2500}, \"tolerance\": {\"type\": \"number\", \"default\": 0.000001}, \"components\": {\"type\": \"integer\", \"default\": 3, \"minimum\": 1}, \"non_negative\": {\"type\": \"boolean\", \"default\": true}, \"initialization\": {\"type\": \"string\", \"default\": \"svd\", \"options\": [\"svd\", \"random\", \"dtld\"]}}','[\"multiway\", \"PARAFAC\", \"N-way\", \"EEM\", \"fourth-order\"]','1.0',0,NULL,NULL,1,'2026-09-24 17:12:10','2026-09-24 17:12:10'),(10,'39a04a1b-b854-11f1-a672-8eaf6b4b2bf7','Tucker3','tucker3','multiway',NULL,'07_decomposicao_multiway','Tucker3 tensor decomposition. Suporta N-way de ordem arbitrária.','Tensor','Tucker_Result','{\"X\": {\"type\": \"tensor\"}}','{\"core\": {\"type\": \"tensor\"}, \"loadings\": {\"type\": \"array\"}, \"explained_variance\": {\"type\": \"float\"}}',2,NULL,NULL,'{\"rank\": {\"type\": \"array\"}}','[\"multiway\", \"Tucker3\", \"N-way\"]','1.0',0,NULL,NULL,1,'2026-09-24 17:12:10','2026-09-24 17:12:10'),(11,'39a04d28-b854-11f1-a672-8eaf6b4b2bf7','Random Forest','random-forest','classification',NULL,'05_classificacao_1d','Random Forest.','Matrix','Model','{\"X\": {\"type\": \"matrix\"}, \"y\": {\"type\": \"matrix\"}}','{\"model\": {\"type\": \"model\"}}',1,1,1,'{\"n_estimators\": {\"type\": \"integer\", \"default\": 100}}','[\"classification\", \"random-forest\"]','1.0',0,NULL,NULL,1,'2026-09-24 17:12:10','2026-09-24 17:12:10'),(12,'39a04fa5-b854-11f1-a672-8eaf6b4b2bf7','RNN','rnn','deep_learning',NULL,'06_deep_learning_1d','Recurrent Neural Network.','Matrix','Model','{\"X\": {\"type\": \"matrix\"}, \"y\": {\"type\": \"matrix\"}}','{\"model\": {\"type\": \"model\"}}',1,1,1,'{\"epochs\": {\"type\": \"integer\", \"default\": 100}, \"hidden_units\": {\"type\": \"integer\", \"default\": 64}, \"hidden_layers\": {\"type\": \"integer\", \"default\": 2}}','[\"deep_learning\", \"RNN\"]','1.0',0,NULL,NULL,1,'2026-09-24 17:12:10','2026-09-24 17:12:10'),(13,'39a052c3-b854-11f1-a672-8eaf6b4b2bf7','Cross Validation','cross-validation','validation',NULL,'14_validacao','Validação cruzada.','Matrix','Metrics','{\"X\": {\"type\": \"matrix\"}, \"y\": {\"type\": \"matrix\"}}','{\"metrics\": {\"type\": \"object\"}}',NULL,NULL,1,'{\"folds\": {\"type\": \"integer\", \"default\": 10, \"minimum\": 2}}','[\"validation\", \"cross-validation\"]','1.0',0,NULL,NULL,1,'2026-09-24 17:12:10','2026-09-24 17:12:10');
/*!40000 ALTER TABLE `techniques` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `initials` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `bio` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `research_area` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `institution` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `birth_date` date DEFAULT NULL,
  `lattes_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `linkedin_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `github_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `avatar_url` varchar(1000) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cover_color` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'gradient-primary',
  `stat_models` int unsigned DEFAULT '0',
  `stat_analyses` int unsigned DEFAULT '0',
  `stat_datasets` int unsigned DEFAULT '0',
  `stat_public_analyses` int unsigned DEFAULT '0',
  `stat_private_analyses` int unsigned DEFAULT '0',
  `email_verified_at` datetime DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `role` enum('user','admin','moderator') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'user',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uuid` (`uuid`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_users_email` (`email`),
  KEY `idx_users_uuid` (`uuid`),
  KEY `idx_users_active` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'61524c92-bea1-11f1-a672-8eaf6b4b2bf7','Pedro Henrique','PH','admin@intellsn.com.br','$2a$12$JqP0Wmj/OdtwO80EOmwDOuzVx78QZyXfvAfGufvqfk8C.XE0.ddxK',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'gradient-primary',0,0,0,0,0,'2026-10-02 17:39:35',1,'admin','2026-10-02 17:39:35','2026-10-02 17:39:35',NULL);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `workflow_edges`
--

DROP TABLE IF EXISTS `workflow_edges`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `workflow_edges` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `workflow_id` bigint unsigned NOT NULL,
  `source_node_key` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_node_key` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_port` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `target_port` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_edge` (`workflow_id`,`source_node_key`,`target_node_key`,`source_port`,`target_port`),
  KEY `idx_workflow_edges_workflow` (`workflow_id`),
  KEY `idx_workflow_edges_source` (`source_node_key`),
  KEY `idx_workflow_edges_target` (`target_node_key`),
  CONSTRAINT `fk_workflow_edges_workflow` FOREIGN KEY (`workflow_id`) REFERENCES `workflows` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `workflow_edges`
--

LOCK TABLES `workflow_edges` WRITE;
/*!40000 ALTER TABLE `workflow_edges` DISABLE KEYS */;
/*!40000 ALTER TABLE `workflow_edges` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `workflow_node_origins`
--

DROP TABLE IF EXISTS `workflow_node_origins`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `workflow_node_origins` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `workflow_node_id` bigint unsigned NOT NULL,
  `article_technique_id` bigint unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wno` (`workflow_node_id`,`article_technique_id`),
  KEY `fk_wno_node` (`workflow_node_id`),
  KEY `fk_wno_technique` (`article_technique_id`),
  CONSTRAINT `fk_wno_node` FOREIGN KEY (`workflow_node_id`) REFERENCES `workflow_nodes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_wno_technique` FOREIGN KEY (`article_technique_id`) REFERENCES `article_techniques` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Rastreabilidade: liga cada nó de workflow à técnica extraída do artigo que o originou.';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `workflow_node_origins`
--

LOCK TABLES `workflow_node_origins` WRITE;
/*!40000 ALTER TABLE `workflow_node_origins` DISABLE KEYS */;
/*!40000 ALTER TABLE `workflow_node_origins` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `workflow_nodes`
--

DROP TABLE IF EXISTS `workflow_nodes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `workflow_nodes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `workflow_id` bigint unsigned NOT NULL,
  `node_key` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `technique_id` bigint unsigned DEFAULT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `parameters` json DEFAULT NULL,
  `position_x` double DEFAULT '0',
  `position_y` double DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_workflow_node_key` (`workflow_id`,`node_key`),
  KEY `idx_workflow_nodes_workflow` (`workflow_id`),
  KEY `idx_workflow_nodes_technique` (`technique_id`),
  CONSTRAINT `fk_workflow_nodes_technique` FOREIGN KEY (`technique_id`) REFERENCES `techniques` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_workflow_nodes_workflow` FOREIGN KEY (`workflow_id`) REFERENCES `workflows` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `workflow_nodes`
--

LOCK TABLES `workflow_nodes` WRITE;
/*!40000 ALTER TABLE `workflow_nodes` DISABLE KEYS */;
/*!40000 ALTER TABLE `workflow_nodes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `workflow_templates`
--

DROP TABLE IF EXISTS `workflow_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `workflow_templates` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `workflow_id` bigint unsigned NOT NULL,
  `domain` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Domínio científico (ex: spectroscopy, chromatography, imaging)',
  `data_type` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Tipo de dado principal (ex: EEM, NIR, LC-DAD, LC-EEM-Phosphorescence)',
  `analytical_order` tinyint unsigned DEFAULT NULL COMMENT 'Ordem analítica do workflow, sem teto fixo',
  `use_case` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `thumbnail_path` varchar(1000) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `usage_count` int unsigned DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_template_workflow` (`workflow_id`),
  KEY `idx_templates_domain` (`domain`),
  KEY `idx_templates_order` (`analytical_order`),
  CONSTRAINT `fk_templates_workflow` FOREIGN KEY (`workflow_id`) REFERENCES `workflows` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `workflow_templates`
--

LOCK TABLES `workflow_templates` WRITE;
/*!40000 ALTER TABLE `workflow_templates` DISABLE KEYS */;
/*!40000 ALTER TABLE `workflow_templates` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `workflows`
--

DROP TABLE IF EXISTS `workflows`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `workflows` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `visibility` enum('public','private') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'private',
  `status` enum('draft','ready','archived') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `source_article_analysis_id` bigint unsigned DEFAULT NULL,
  `fork_from_workflow_id` bigint unsigned DEFAULT NULL COMMENT 'Workflow original quando este foi derivado por fork/cópia',
  `tags` json DEFAULT NULL,
  `is_template` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Se 1, aparece no catálogo público de templates',
  `definition` json NOT NULL COMMENT 'Snapshot denormalizado do grafo completo (nós+arestas+parâmetros) para reconstituição rápida',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uuid` (`uuid`),
  KEY `idx_workflows_user` (`user_id`),
  KEY `idx_workflows_visibility` (`visibility`),
  KEY `idx_workflows_status` (`status`),
  KEY `idx_workflows_source_article` (`source_article_analysis_id`),
  KEY `idx_workflows_template` (`is_template`),
  KEY `idx_workflows_fork` (`fork_from_workflow_id`),
  CONSTRAINT `fk_workflows_article_analysis` FOREIGN KEY (`source_article_analysis_id`) REFERENCES `article_analyses` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_workflows_fork` FOREIGN KEY (`fork_from_workflow_id`) REFERENCES `workflows` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_workflows_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `workflows`
--

LOCK TABLES `workflows` WRITE;
/*!40000 ALTER TABLE `workflows` DISABLE KEYS */;
/*!40000 ALTER TABLE `workflows` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-09  9:39:22
