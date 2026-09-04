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
-- Table structure for table `dataset_samples`
--

DROP TABLE IF EXISTS `dataset_samples`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dataset_samples` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `dataset_id` bigint unsigned NOT NULL,
  `position` int unsigned NOT NULL,
  `sample_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sample_class` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `y_values` json NOT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sample_pos` (`dataset_id`,`position`),
  KEY `idx_sample_class` (`dataset_id`,`sample_class`),
  CONSTRAINT `fk_samples_dataset` FOREIGN KEY (`dataset_id`) REFERENCES `datasets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `dataset_samples`
--

LOCK TABLES `dataset_samples` WRITE;
/*!40000 ALTER TABLE `dataset_samples` DISABLE KEYS */;
/*!40000 ALTER TABLE `dataset_samples` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `dataset_x_axis`
--

DROP TABLE IF EXISTS `dataset_x_axis`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dataset_x_axis` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `dataset_id` bigint unsigned NOT NULL,
  `position` int unsigned NOT NULL,
  `x_value` decimal(10,4) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_x_axis_pos` (`dataset_id`,`position`),
  CONSTRAINT `fk_x_axis_dataset` FOREIGN KEY (`dataset_id`) REFERENCES `datasets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `dataset_x_axis`
--

LOCK TABLES `dataset_x_axis` WRITE;
/*!40000 ALTER TABLE `dataset_x_axis` DISABLE KEYS */;
/*!40000 ALTER TABLE `dataset_x_axis` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `datasets`
--

DROP TABLE IF EXISTS `datasets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `datasets` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT (uuid()),
  `user_id` bigint unsigned NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `visibility` enum('public','private') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'private',
  `technique` enum('NIR','Raman','FTIR','UV-Vis','NMR','Fluorescence','Other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `x_unit` enum('nm','cm-1','eV','ppm','THz') COLLATE utf8mb4_unicode_ci NOT NULL,
  `x_min` decimal(10,4) DEFAULT NULL,
  `x_max` decimal(10,4) DEFAULT NULL,
  `x_points` int unsigned NOT NULL,
  `y_unit` enum('Absorbance','Transmittance','Reflectance','Intensity','Kubelka-Munk','Other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `sample_count` int unsigned NOT NULL DEFAULT '0',
  `source_filename` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_format` enum('xlsx','csv','spc','jcamp','other') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_datasets_uuid` (`uuid`),
  KEY `idx_datasets_user` (`user_id`),
  KEY `idx_datasets_vis` (`visibility`),
  KEY `idx_datasets_tech` (`technique`),
  CONSTRAINT `fk_datasets_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `datasets`
--

LOCK TABLES `datasets` WRITE;
/*!40000 ALTER TABLE `datasets` DISABLE KEYS */;
/*!40000 ALTER TABLE `datasets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `jobs`
--

DROP TABLE IF EXISTS `jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `jobs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT (uuid()),
  `user_id` bigint unsigned NOT NULL,
  `job_type` enum('train_model','predict','preprocess','export') COLLATE utf8mb4_unicode_ci NOT NULL,
  `model_id` bigint unsigned DEFAULT NULL,
  `dataset_id` bigint unsigned DEFAULT NULL,
  `celery_task_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `queue_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'default',
  `payload` json NOT NULL,
  `status` enum('queued','running','done','failed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'queued',
  `progress` tinyint unsigned NOT NULL DEFAULT '0',
  `result` json DEFAULT NULL,
  `error_message` text COLLATE utf8mb4_unicode_ci,
  `error_traceback` text COLLATE utf8mb4_unicode_ci,
  `queued_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `started_at` timestamp NULL DEFAULT NULL,
  `finished_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_jobs_uuid` (`uuid`),
  KEY `idx_jobs_user` (`user_id`),
  KEY `idx_jobs_status` (`status`),
  KEY `idx_jobs_celery` (`celery_task_id`),
  KEY `idx_jobs_type` (`job_type`),
  KEY `fk_jobs_model` (`model_id`),
  KEY `fk_jobs_dataset` (`dataset_id`),
  CONSTRAINT `fk_jobs_dataset` FOREIGN KEY (`dataset_id`) REFERENCES `datasets` (`id`),
  CONSTRAINT `fk_jobs_model` FOREIGN KEY (`model_id`) REFERENCES `models` (`id`),
  CONSTRAINT `fk_jobs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
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
-- Table structure for table `models`
--

DROP TABLE IF EXISTS `models`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `models` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT (uuid()),
  `user_id` bigint unsigned NOT NULL,
  `dataset_id` bigint unsigned NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `visibility` enum('public','private') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'private',
  `algorithm` enum('PLS','PLS-DA','PCR','PCA','SIMCA','LDA','SVM','Random Forest','KNN','MLP','CNN-1D','Other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `model_type` enum('regression','classification','exploratory') COLLATE utf8mb4_unicode_ci NOT NULL,
  `hyperparameters` json DEFAULT NULL,
  `preprocessing` json DEFAULT NULL,
  `selected_vars` json DEFAULT NULL,
  `model_path` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `model_size_kb` int unsigned DEFAULT NULL,
  `status` enum('pending','training','ready','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `metrics_cal` json DEFAULT NULL,
  `metrics_cv` json DEFAULT NULL,
  `metrics_ext` json DEFAULT NULL,
  `train_samples` int unsigned DEFAULT NULL,
  `test_samples` int unsigned DEFAULT NULL,
  `cv_folds` int unsigned DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_models_uuid` (`uuid`),
  KEY `idx_models_user` (`user_id`),
  KEY `idx_models_dataset` (`dataset_id`),
  KEY `idx_models_algorithm` (`algorithm`),
  KEY `idx_models_status` (`status`),
  CONSTRAINT `fk_models_dataset` FOREIGN KEY (`dataset_id`) REFERENCES `datasets` (`id`),
  CONSTRAINT `fk_models_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
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
  `uuid` char(36) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT (uuid()),
  `user_id` bigint unsigned NOT NULL,
  `model_id` bigint unsigned NOT NULL,
  `job_id` bigint unsigned DEFAULT NULL,
  `source_dataset_id` bigint unsigned DEFAULT NULL,
  `source_filename` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `results` json NOT NULL,
  `sample_count` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_predictions_uuid` (`uuid`),
  KEY `idx_predictions_user` (`user_id`),
  KEY `idx_predictions_model` (`model_id`),
  KEY `fk_pred_job` (`job_id`),
  CONSTRAINT `fk_pred_job` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`),
  CONSTRAINT `fk_pred_model` FOREIGN KEY (`model_id`) REFERENCES `models` (`id`),
  CONSTRAINT `fk_pred_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
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
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `uuid` char(36) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT (uuid()),
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `initials` varchar(4) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `bio` text COLLATE utf8mb4_unicode_ci,
  `research_area` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `institution` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `birth_date` date DEFAULT NULL,
  `lattes_url` varchar(2048) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `linkedin_url` varchar(2048) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `github_url` varchar(2048) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `avatar_url` varchar(2048) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cover_color` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'gradient-primary',
  `stat_models` int unsigned NOT NULL DEFAULT '0',
  `stat_analyses` int unsigned NOT NULL DEFAULT '0',
  `stat_datasets` int unsigned NOT NULL DEFAULT '0',
  `stat_public_analyses` int unsigned NOT NULL DEFAULT '0',
  `stat_private_analyses` int unsigned NOT NULL DEFAULT '0',
  `email_verified_at` timestamp NULL DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `role` enum('user','admin','moderator') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'user',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_uuid` (`uuid`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `idx_users_name` (`name`),
  KEY `idx_users_active` (`is_active`),
  KEY `idx_users_deleted` (`deleted_at`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'8739813b-65f1-11f1-95a7-8eaf6b4b2bf7','Pedro Henrique','PH','pedrinhu.moraes@gmail.com','$2a$12$IGQSNj.R3UDwXBsdY9V.Mej8sakFsJ3QuVRwdCes6uF7LWrZtmn52',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'gradient-primary',0,0,0,0,0,NULL,1,'user','2026-06-11 23:59:05','2026-06-11 23:59:05',NULL);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-26  4:07:37
