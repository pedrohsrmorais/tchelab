'use strict';

/**
 * Migrações idempotentes, executadas na subida da API (server.js).
 *
 * O `init.mysql` continua sendo o script de instalação "do zero", mas bancos
 * já existentes não são recriados — então tudo que foi acrescentado depois
 * (preferências do usuário, convites/conteúdo das comunidades, nível de
 * acesso de projetos vinculados, técnicas de projeto) é aplicado aqui, de
 * forma segura para rodar quantas vezes for preciso (MySQL 8 e MariaDB).
 */

const db = require('./db.config');

const COLLATE = 'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci';

async function hasColumn(table, column) {
  const [rows] = await db.query(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return rows.length > 0;
}

async function hasTable(table) {
  const [rows] = await db.query(
    'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    [table],
  );
  return rows.length > 0;
}

async function addColumn(table, column, ddl) {
  if (!(await hasTable(table))) return false;
  if (await hasColumn(table, column)) return false;
  await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}`);
  console.log(`[migrate] ${table}.${column} adicionada`);
  return true;
}

const TABLES = [
  // ── Consumo (processamento/memória medidos pelo worker + armazenamento ao longo do tempo), agregado por mês ─────────
  ['usage_monthly', `
    CREATE TABLE IF NOT EXISTS \`usage_monthly\` (
      \`user_id\` bigint unsigned NOT NULL,
      \`month\` char(7) ${COLLATE} NOT NULL,
      \`jobs\` int unsigned NOT NULL DEFAULT 0,
      \`jobs_failed\` int unsigned NOT NULL DEFAULT 0,
      \`cpu_seconds\` decimal(16,3) NOT NULL DEFAULT 0,
      \`wall_seconds\` decimal(16,3) NOT NULL DEFAULT 0,
      \`gb_seconds_ram\` decimal(20,3) NOT NULL DEFAULT 0,
      \`peak_rss_max_bytes\` bigint unsigned NOT NULL DEFAULT 0,
      \`input_bytes\` bigint unsigned NOT NULL DEFAULT 0,
      \`output_bytes\` bigint unsigned NOT NULL DEFAULT 0,
      \`storage_gb_hours\` decimal(16,4) NOT NULL DEFAULT 0,
      \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`user_id\`, \`month\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],
  ['usage_meta', `
    CREATE TABLE IF NOT EXISTS \`usage_meta\` (
      \`k\` varchar(60) ${COLLATE} NOT NULL,
      \`v\` varchar(255) ${COLLATE} NOT NULL,
      PRIMARY KEY (\`k\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],
  // ── Armazenamento: planos, objetos e trilha de auditoria da cota por usuário ─────────
  ['storage_plans', `
    CREATE TABLE IF NOT EXISTS \`storage_plans\` (
      \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
      \`code\` varchar(40) ${COLLATE} NOT NULL,
      \`name\` varchar(120) ${COLLATE} NOT NULL,
      \`quota_bytes\` bigint unsigned NOT NULL,
      \`max_file_bytes\` bigint unsigned NOT NULL,
      \`max_concurrent_jobs\` int unsigned NOT NULL DEFAULT 2,
      \`monthly_cpu_seconds\` bigint unsigned DEFAULT NULL,
      \`is_default\` tinyint(1) NOT NULL DEFAULT 0,
      \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_storage_plan_code\` (\`code\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],
  ['storage_objects', `
    CREATE TABLE IF NOT EXISTS \`storage_objects\` (
      \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
      \`user_id\` bigint unsigned NOT NULL,
      \`kind\` varchar(30) ${COLLATE} NOT NULL,
      \`ref_type\` varchar(30) ${COLLATE} NOT NULL,
      \`ref_id\` bigint unsigned NOT NULL,
      \`storage_key\` varchar(500) ${COLLATE} DEFAULT NULL,
      \`size_bytes\` bigint unsigned NOT NULL DEFAULT 0,
      \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`deleted_at\` datetime DEFAULT NULL,
      PRIMARY KEY (\`id\`),
      KEY \`idx_storage_obj_user\` (\`user_id\`,\`deleted_at\`),
      KEY \`idx_storage_obj_ref\` (\`ref_type\`,\`ref_id\`),
      KEY \`idx_storage_obj_key\` (\`storage_key\`(190))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],
  ['storage_ledger', `
    CREATE TABLE IF NOT EXISTS \`storage_ledger\` (
      \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
      \`user_id\` bigint unsigned NOT NULL,
      \`delta_bytes\` bigint NOT NULL,
      \`reason\` varchar(60) ${COLLATE} NOT NULL,
      \`object_id\` bigint unsigned DEFAULT NULL,
      \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`idx_storage_ledger_user\` (\`user_id\`,\`created_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],
  // ── Convites por código/link ────────────────────────────────────────────
  ['community_invites', `
    CREATE TABLE IF NOT EXISTS \`community_invites\` (
      \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
      \`uuid\` char(36) ${COLLATE} NOT NULL,
      \`community_id\` bigint unsigned NOT NULL,
      \`code\` varchar(32) ${COLLATE} NOT NULL,
      \`label\` varchar(120) ${COLLATE} DEFAULT NULL,
      \`created_by\` bigint unsigned NOT NULL,
      \`expires_at\` datetime DEFAULT NULL,
      \`max_uses\` int unsigned DEFAULT NULL,
      \`uses\` int unsigned NOT NULL DEFAULT 0,
      \`revoked_at\` datetime DEFAULT NULL,
      \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_invite_uuid\` (\`uuid\`),
      UNIQUE KEY \`uq_invite_code\` (\`code\`),
      KEY \`idx_invites_community\` (\`community_id\`),
      CONSTRAINT \`fk_invites_community\` FOREIGN KEY (\`community_id\`) REFERENCES \`communities\` (\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`fk_invites_user\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],

  // ── Quem foi removido com banimento não volta pelo mesmo link ───────────
  ['community_bans', `
    CREATE TABLE IF NOT EXISTS \`community_bans\` (
      \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
      \`community_id\` bigint unsigned NOT NULL,
      \`user_id\` bigint unsigned NOT NULL,
      \`banned_by\` bigint unsigned DEFAULT NULL,
      \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_community_ban\` (\`community_id\`,\`user_id\`),
      CONSTRAINT \`fk_bans_community\` FOREIGN KEY (\`community_id\`) REFERENCES \`communities\` (\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`fk_bans_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],

  // ── Conteúdo estilo "Moodle": tópicos/aulas com materiais ───────────────
  ['community_sections', `
    CREATE TABLE IF NOT EXISTS \`community_sections\` (
      \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
      \`uuid\` char(36) ${COLLATE} NOT NULL,
      \`community_id\` bigint unsigned NOT NULL,
      \`title\` varchar(255) ${COLLATE} NOT NULL,
      \`description\` text ${COLLATE},
      \`parent_id\` bigint unsigned DEFAULT NULL,
      \`position\` int NOT NULL DEFAULT 0,
      \`is_visible\` tinyint(1) NOT NULL DEFAULT 1,
      \`created_by\` bigint unsigned DEFAULT NULL,
      \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_section_uuid\` (\`uuid\`),
      KEY \`idx_sections_community\` (\`community_id\`,\`position\`),
      CONSTRAINT \`fk_sections_community\` FOREIGN KEY (\`community_id\`) REFERENCES \`communities\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],

  ['community_items', `
    CREATE TABLE IF NOT EXISTS \`community_items\` (
      \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
      \`uuid\` char(36) ${COLLATE} NOT NULL,
      \`community_id\` bigint unsigned NOT NULL,
      \`section_id\` bigint unsigned DEFAULT NULL,
      \`type\` enum('link','file','text') ${COLLATE} NOT NULL DEFAULT 'link',
      \`title\` varchar(255) ${COLLATE} NOT NULL,
      \`description\` text ${COLLATE},
      \`url\` varchar(1000) ${COLLATE} DEFAULT NULL,
      \`file_path\` varchar(500) ${COLLATE} DEFAULT NULL,
      \`file_name\` varchar(255) ${COLLATE} DEFAULT NULL,
      \`file_mime\` varchar(120) ${COLLATE} DEFAULT NULL,
      \`file_size\` bigint unsigned DEFAULT NULL,
      \`position\` int NOT NULL DEFAULT 0,
      \`is_visible\` tinyint(1) NOT NULL DEFAULT 1,
      \`created_by\` bigint unsigned DEFAULT NULL,
      \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_item_uuid\` (\`uuid\`),
      KEY \`idx_items_community\` (\`community_id\`,\`section_id\`,\`position\`),
      CONSTRAINT \`fk_items_community\` FOREIGN KEY (\`community_id\`) REFERENCES \`communities\` (\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`fk_items_section\` FOREIGN KEY (\`section_id\`) REFERENCES \`community_sections\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],

  // ── Quizzes / exercícios da comunidade ──────────────────────────────────
  ['quizzes', `
    CREATE TABLE IF NOT EXISTS \`quizzes\` (
      \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
      \`uuid\` char(36) ${COLLATE} NOT NULL,
      \`community_id\` bigint unsigned NOT NULL,
      \`section_id\` bigint unsigned DEFAULT NULL,
      \`title\` varchar(255) ${COLLATE} NOT NULL,
      \`description\` text ${COLLATE},
      \`status\` enum('draft','open','closed') ${COLLATE} NOT NULL DEFAULT 'draft',
      \`due_at\` datetime DEFAULT NULL,
      \`show_results\` enum('after_submit','after_close','never') ${COLLATE} NOT NULL DEFAULT 'after_submit',
      \`max_attempts\` int NOT NULL DEFAULT 1,
      \`grade_policy\` enum('highest','latest','first') ${COLLATE} NOT NULL DEFAULT 'highest',
      \`position\` int NOT NULL DEFAULT 0,
      \`created_by\` bigint unsigned DEFAULT NULL,
      \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_quiz_uuid\` (\`uuid\`),
      KEY \`idx_quiz_community\` (\`community_id\`,\`section_id\`,\`position\`),
      CONSTRAINT \`fk_quiz_community\` FOREIGN KEY (\`community_id\`) REFERENCES \`communities\` (\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`fk_quiz_section\` FOREIGN KEY (\`section_id\`) REFERENCES \`community_sections\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],

  // ── Equipamentos (agendador) ────────────────────────────────────────────
  ['equipment', `
    CREATE TABLE IF NOT EXISTS \`equipment\` (
      \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
      \`uuid\` char(36) ${COLLATE} NOT NULL,
      \`community_id\` bigint unsigned NOT NULL,
      \`name\` varchar(150) ${COLLATE} NOT NULL,
      \`description\` text ${COLLATE},
      \`location\` varchar(200) ${COLLATE} DEFAULT NULL,
      \`responsible_id\` bigint unsigned DEFAULT NULL,
      \`specs\` json DEFAULT NULL,
      \`image_path\` varchar(255) ${COLLATE} DEFAULT NULL,
      \`status\` enum('active','maintenance','archived') ${COLLATE} NOT NULL DEFAULT 'active',
      \`timezone\` varchar(64) ${COLLATE} NOT NULL DEFAULT 'America/Sao_Paulo',
      \`slot_minutes\` int NOT NULL DEFAULT 30,
      \`min_minutes\` int NOT NULL DEFAULT 30,
      \`max_minutes\` int NOT NULL DEFAULT 240,
      \`min_notice_minutes\` int NOT NULL DEFAULT 60,
      \`max_advance_days\` int NOT NULL DEFAULT 30,
      \`cancel_until_minutes\` int NOT NULL DEFAULT 0,
      \`member_approval\` enum('auto','manual') ${COLLATE} NOT NULL DEFAULT 'auto',
      \`guest_approval\` enum('auto','manual') ${COLLATE} NOT NULL DEFAULT 'manual',
      \`access\` enum('community','public') ${COLLATE} NOT NULL DEFAULT 'community',
      \`public_token\` varchar(64) ${COLLATE} DEFAULT NULL,
      \`created_by\` bigint unsigned DEFAULT NULL,
      \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_equipment_uuid\` (\`uuid\`),
      UNIQUE KEY \`uq_equipment_token\` (\`public_token\`),
      KEY \`idx_equipment_community\` (\`community_id\`,\`status\`),
      CONSTRAINT \`fk_equipment_community\` FOREIGN KEY (\`community_id\`) REFERENCES \`communities\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],

  ['equipment_windows', `
    CREATE TABLE IF NOT EXISTS \`equipment_windows\` (
      \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
      \`equipment_id\` bigint unsigned NOT NULL,
      \`weekday\` tinyint NOT NULL,
      \`start_time\` time NOT NULL,
      \`end_time\` time NOT NULL,
      \`audience\` enum('members','public') ${COLLATE} NOT NULL DEFAULT 'members',
      PRIMARY KEY (\`id\`),
      KEY \`idx_window_equipment\` (\`equipment_id\`),
      CONSTRAINT \`fk_window_equipment\` FOREIGN KEY (\`equipment_id\`) REFERENCES \`equipment\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],

  ['equipment_blocks', `
    CREATE TABLE IF NOT EXISTS \`equipment_blocks\` (
      \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
      \`uuid\` char(36) ${COLLATE} NOT NULL,
      \`equipment_id\` bigint unsigned NOT NULL,
      \`start_at\` datetime NOT NULL,
      \`end_at\` datetime NOT NULL,
      \`reason\` varchar(200) ${COLLATE} DEFAULT NULL,
      \`show_reason\` tinyint(1) NOT NULL DEFAULT 0,
      \`repeat_until\` date DEFAULT NULL,
      \`created_by\` bigint unsigned DEFAULT NULL,
      \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_block_uuid\` (\`uuid\`),
      KEY \`idx_block_equipment\` (\`equipment_id\`,\`start_at\`),
      CONSTRAINT \`fk_block_equipment\` FOREIGN KEY (\`equipment_id\`) REFERENCES \`equipment\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],

  ['equipment_bookings', `
    CREATE TABLE IF NOT EXISTS \`equipment_bookings\` (
      \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
      \`uuid\` char(36) ${COLLATE} NOT NULL,
      \`equipment_id\` bigint unsigned NOT NULL,
      \`start_at\` datetime NOT NULL,
      \`end_at\` datetime NOT NULL,
      \`status\` enum('awaiting_email','pending','confirmed','rejected','cancelled','no_show') ${COLLATE} NOT NULL DEFAULT 'pending',
      \`source\` enum('member','public') ${COLLATE} NOT NULL DEFAULT 'member',
      \`user_id\` bigint unsigned DEFAULT NULL,
      \`guest_name\` varchar(120) ${COLLATE} DEFAULT NULL,
      \`guest_email\` varchar(190) ${COLLATE} DEFAULT NULL,
      \`guest_phone\` varchar(40) ${COLLATE} DEFAULT NULL,
      \`guest_institution\` varchar(160) ${COLLATE} DEFAULT NULL,
      \`guest_lang\` varchar(5) ${COLLATE} DEFAULT NULL,
      \`purpose\` varchar(500) ${COLLATE} DEFAULT NULL,
      \`project_note\` varchar(300) ${COLLATE} DEFAULT NULL,
      \`manage_token_hash\` char(64) ${COLLATE} DEFAULT NULL,
      \`hold_expires_at\` datetime DEFAULT NULL,
      \`created_ip\` varchar(64) ${COLLATE} DEFAULT NULL,
      \`decided_by\` bigint unsigned DEFAULT NULL,
      \`decided_at\` datetime DEFAULT NULL,
      \`decision_note\` varchar(300) ${COLLATE} DEFAULT NULL,
      \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_booking_uuid\` (\`uuid\`),
      UNIQUE KEY \`uq_booking_manage\` (\`manage_token_hash\`),
      KEY \`idx_booking_equipment\` (\`equipment_id\`,\`start_at\`,\`end_at\`),
      KEY \`idx_booking_user\` (\`user_id\`,\`start_at\`),
      KEY \`idx_booking_email\` (\`guest_email\`),
      CONSTRAINT \`fk_booking_equipment\` FOREIGN KEY (\`equipment_id\`) REFERENCES \`equipment\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],

  // ── Quadro (gestão do lab, estilo monday) ───────────────────────────────
  ['boards', `
    CREATE TABLE IF NOT EXISTS \`boards\` (
      \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
      \`uuid\` char(36) ${COLLATE} NOT NULL,
      \`community_id\` bigint unsigned NOT NULL,
      \`title\` varchar(150) ${COLLATE} NOT NULL,
      \`description\` text ${COLLATE},
      \`color\` varchar(16) ${COLLATE} DEFAULT NULL,
      \`edit_policy\` enum('staff','own','members') ${COLLATE} NOT NULL DEFAULT 'members',
      \`position\` int NOT NULL DEFAULT 0,
      \`next_seq\` int NOT NULL DEFAULT 1,
      \`rev\` int NOT NULL DEFAULT 1,
      \`created_by\` bigint unsigned DEFAULT NULL,
      \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_board_uuid\` (\`uuid\`),
      KEY \`idx_board_community\` (\`community_id\`,\`position\`),
      CONSTRAINT \`fk_board_community\` FOREIGN KEY (\`community_id\`) REFERENCES \`communities\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],

  ['board_groups', `
    CREATE TABLE IF NOT EXISTS \`board_groups\` (
      \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
      \`uuid\` char(36) ${COLLATE} NOT NULL,
      \`board_id\` bigint unsigned NOT NULL,
      \`title\` varchar(150) ${COLLATE} NOT NULL,
      \`color\` varchar(16) ${COLLATE} NOT NULL DEFAULT '#579bfc',
      \`position\` int NOT NULL DEFAULT 0,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_bgroup_uuid\` (\`uuid\`),
      KEY \`idx_bgroup_board\` (\`board_id\`,\`position\`),
      CONSTRAINT \`fk_bgroup_board\` FOREIGN KEY (\`board_id\`) REFERENCES \`boards\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],

  ['board_columns', `
    CREATE TABLE IF NOT EXISTS \`board_columns\` (
      \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
      \`uuid\` char(36) ${COLLATE} NOT NULL,
      \`board_id\` bigint unsigned NOT NULL,
      \`title\` varchar(100) ${COLLATE} NOT NULL,
      \`type\` varchar(20) ${COLLATE} NOT NULL,
      \`config\` json DEFAULT NULL,
      \`position\` int NOT NULL DEFAULT 0,
      \`width\` int NOT NULL DEFAULT 150,
      \`hidden\` tinyint(1) NOT NULL DEFAULT 0,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_bcol_uuid\` (\`uuid\`),
      KEY \`idx_bcol_board\` (\`board_id\`,\`position\`),
      CONSTRAINT \`fk_bcol_board\` FOREIGN KEY (\`board_id\`) REFERENCES \`boards\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],

  ['board_items', `
    CREATE TABLE IF NOT EXISTS \`board_items\` (
      \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
      \`uuid\` char(36) ${COLLATE} NOT NULL,
      \`board_id\` bigint unsigned NOT NULL,
      \`group_id\` bigint unsigned NOT NULL,
      \`seq\` int NOT NULL DEFAULT 0,
      \`title\` varchar(300) ${COLLATE} NOT NULL,
      \`cells\` json DEFAULT NULL,
      \`position\` double NOT NULL DEFAULT 0,
      \`created_by\` bigint unsigned DEFAULT NULL,
      \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_bitem_uuid\` (\`uuid\`),
      KEY \`idx_bitem_board\` (\`board_id\`,\`group_id\`,\`position\`),
      CONSTRAINT \`fk_bitem_board\` FOREIGN KEY (\`board_id\`) REFERENCES \`boards\` (\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`fk_bitem_group\` FOREIGN KEY (\`group_id\`) REFERENCES \`board_groups\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],

  ['board_item_people', `
    CREATE TABLE IF NOT EXISTS \`board_item_people\` (
      \`item_id\` bigint unsigned NOT NULL,
      \`column_id\` bigint unsigned NOT NULL,
      \`user_id\` bigint unsigned NOT NULL,
      PRIMARY KEY (\`item_id\`,\`column_id\`,\`user_id\`),
      KEY \`idx_bpeople_user\` (\`user_id\`),
      KEY \`idx_bpeople_col\` (\`column_id\`),
      CONSTRAINT \`fk_bpeople_item\` FOREIGN KEY (\`item_id\`) REFERENCES \`board_items\` (\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`fk_bpeople_col\` FOREIGN KEY (\`column_id\`) REFERENCES \`board_columns\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],

  ['board_comments', `
    CREATE TABLE IF NOT EXISTS \`board_comments\` (
      \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
      \`uuid\` char(36) ${COLLATE} NOT NULL,
      \`item_id\` bigint unsigned NOT NULL,
      \`user_id\` bigint unsigned DEFAULT NULL,
      \`body\` text ${COLLATE} NOT NULL,
      \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_bcomment_uuid\` (\`uuid\`),
      KEY \`idx_bcomment_item\` (\`item_id\`,\`created_at\`),
      CONSTRAINT \`fk_bcomment_item\` FOREIGN KEY (\`item_id\`) REFERENCES \`board_items\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],

  ['board_activity', `
    CREATE TABLE IF NOT EXISTS \`board_activity\` (
      \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
      \`board_id\` bigint unsigned NOT NULL,
      \`item_id\` bigint unsigned DEFAULT NULL,
      \`user_id\` bigint unsigned DEFAULT NULL,
      \`kind\` varchar(24) ${COLLATE} NOT NULL,
      \`column_id\` bigint unsigned DEFAULT NULL,
      \`data\` json DEFAULT NULL,
      \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`idx_bact_item\` (\`item_id\`,\`created_at\`),
      KEY \`idx_bact_board\` (\`board_id\`,\`created_at\`),
      CONSTRAINT \`fk_bact_board\` FOREIGN KEY (\`board_id\`) REFERENCES \`boards\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],

  ['quiz_questions', `
    CREATE TABLE IF NOT EXISTS \`quiz_questions\` (
      \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
      \`uuid\` char(36) ${COLLATE} NOT NULL,
      \`quiz_id\` bigint unsigned NOT NULL,
      \`position\` int NOT NULL DEFAULT 0,
      \`kind\` enum('tf','choice','text','dataset','workflow') ${COLLATE} NOT NULL,
      \`prompt\` text ${COLLATE} NOT NULL,
      \`points\` decimal(6,2) NOT NULL DEFAULT 1,
      \`config\` json DEFAULT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_question_uuid\` (\`uuid\`),
      KEY \`idx_question_quiz\` (\`quiz_id\`,\`position\`),
      CONSTRAINT \`fk_question_quiz\` FOREIGN KEY (\`quiz_id\`) REFERENCES \`quizzes\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],

  // dados/modelos que o professor entrega junto com a pergunta (ex.: o multiway X, um workflow-modelo)
  ['quiz_attachments', `
    CREATE TABLE IF NOT EXISTS \`quiz_attachments\` (
      \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
      \`question_id\` bigint unsigned NOT NULL,
      \`kind\` enum('dataset','workflow') ${COLLATE} NOT NULL,
      \`ref_id\` bigint unsigned NOT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_quiz_attachment\` (\`question_id\`,\`kind\`,\`ref_id\`),
      KEY \`idx_attachment_ref\` (\`kind\`,\`ref_id\`),
      CONSTRAINT \`fk_attachment_question\` FOREIGN KEY (\`question_id\`) REFERENCES \`quiz_questions\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],

  ['quiz_submissions', `
    CREATE TABLE IF NOT EXISTS \`quiz_submissions\` (
      \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
      \`uuid\` char(36) ${COLLATE} NOT NULL,
      \`quiz_id\` bigint unsigned NOT NULL,
      \`user_id\` bigint unsigned NOT NULL,
      \`attempt\` int NOT NULL DEFAULT 1,
      \`status\` enum('in_progress','submitted','graded') ${COLLATE} NOT NULL DEFAULT 'in_progress',
      \`score\` decimal(7,2) DEFAULT NULL,
      \`feedback\` text ${COLLATE},
      \`submitted_at\` datetime DEFAULT NULL,
      \`graded_by\` bigint unsigned DEFAULT NULL,
      \`graded_at\` datetime DEFAULT NULL,
      \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_submission_uuid\` (\`uuid\`),
      UNIQUE KEY \`uq_submission_attempt\` (\`quiz_id\`,\`user_id\`,\`attempt\`),
      CONSTRAINT \`fk_submission_quiz\` FOREIGN KEY (\`quiz_id\`) REFERENCES \`quizzes\` (\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`fk_submission_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],

  ['quiz_answers', `
    CREATE TABLE IF NOT EXISTS \`quiz_answers\` (
      \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
      \`submission_id\` bigint unsigned NOT NULL,
      \`question_id\` bigint unsigned NOT NULL,
      \`value\` json DEFAULT NULL,
      \`ref_type\` enum('workflow','dataset') ${COLLATE} DEFAULT NULL,
      \`ref_id\` bigint unsigned DEFAULT NULL,
      \`points\` decimal(6,2) DEFAULT NULL,
      \`feedback\` text ${COLLATE},
      \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_answer\` (\`submission_id\`,\`question_id\`),
      KEY \`idx_answer_ref\` (\`ref_type\`,\`ref_id\`),
      CONSTRAINT \`fk_answer_submission\` FOREIGN KEY (\`submission_id\`) REFERENCES \`quiz_submissions\` (\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`fk_answer_question\` FOREIGN KEY (\`question_id\`) REFERENCES \`quiz_questions\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],

  // ── Técnicas dentro de um projeto (favoritas / próprias) ────────────────
  ['project_techniques', `
    CREATE TABLE IF NOT EXISTS \`project_techniques\` (
      \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
      \`project_id\` bigint unsigned NOT NULL,
      \`technique_id\` bigint unsigned NOT NULL,
      \`kind\` enum('favorite','own') ${COLLATE} NOT NULL DEFAULT 'favorite',
      \`added_by\` bigint unsigned DEFAULT NULL,
      \`added_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_project_technique\` (\`project_id\`,\`technique_id\`),
      KEY \`idx_project_techniques_project\` (\`project_id\`),
      CONSTRAINT \`fk_project_techniques_project\` FOREIGN KEY (\`project_id\`) REFERENCES \`projects\` (\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`fk_project_techniques_technique\` FOREIGN KEY (\`technique_id\`) REFERENCES \`techniques\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`],
];

async function migrate() {
  // users.preferences: tema, idioma, privacidade e demais personalizações
  await addColumn('users', 'preferences', 'json DEFAULT NULL');

  // comunidades
  await addColumn('communities', 'cover_color', "varchar(100) NOT NULL DEFAULT 'gradient-primary'");
  await addColumn('community_members', 'can_link', 'tinyint(1) NOT NULL DEFAULT 0');
  await addColumn('community_projects', 'access', "enum('read','edit') NOT NULL DEFAULT 'read'");
  await addColumn('community_projects', 'section_id', 'bigint unsigned DEFAULT NULL');
  await addColumn('community_projects', 'position', 'int NOT NULL DEFAULT 0');

  // itens de comunidade: workflow / variável (dataset) do Workspace como material, e pré-visualização
  // (PPT/DOC/XLS convertidos em PDF) — o enum é ampliado só se ainda não tiver os novos tipos.
  if (await hasTable('community_items')) {
    const [[col]] = await db.query(
      `SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'community_items' AND COLUMN_NAME = 'type'`,
    );
    if (col && !String(col.t).includes("'workflow'")) {
      await db.query("ALTER TABLE `community_items` MODIFY `type` enum('link','file','text','workflow','dataset') NOT NULL DEFAULT 'link'");
      console.log('[migrate] community_items.type ampliado (workflow, dataset)');
    }
    await addColumn('community_items', 'ref_id', 'bigint unsigned DEFAULT NULL');
    await addColumn('community_items', 'access', "enum('read','edit') NOT NULL DEFAULT 'read'");
    await addColumn('community_items', 'preview_path', 'varchar(500) DEFAULT NULL');
    await addColumn('community_items', 'preview_status', "enum('none','pending','ready','failed') NOT NULL DEFAULT 'none'");
    // Conversões que ficaram "pending" por uma queda do servidor nunca terminariam
    await db.query("UPDATE community_items SET preview_status = 'failed' WHERE preview_status = 'pending'");
  }

  // O papel "owner" deriva de communities.owner_id; garante a linha de membro
  // (admin) do dono em comunidades antigas.
  if (await hasTable('communities') && await hasTable('community_members')) {
    await db.query(
      `INSERT IGNORE INTO community_members (community_id, user_id, role, joined_at, can_link)
         SELECT c.id, c.owner_id, 'admin', c.created_at, 1 FROM communities c`,
    );
  }

  await addColumn('community_sections', 'parent_id', 'bigint unsigned DEFAULT NULL');

  for (const [name, ddl] of TABLES) {
    if (!(await hasTable(name))) {
      await db.query(ddl);
      console.log(`[migrate] tabela ${name} criada`);
    }
  }


  // armazenamento: colunas de cota no usuário e planos iniciais (valores editáveis depois pelo admin)
  await addColumn('users', 'storage_plan_id', 'bigint unsigned DEFAULT NULL');
  await addColumn('users', 'storage_quota_bytes', 'bigint unsigned DEFAULT NULL');
  await addColumn('users', 'storage_used_bytes', 'bigint unsigned NOT NULL DEFAULT 0');
  await addColumn('users', 'storage_reserved_bytes', 'bigint unsigned NOT NULL DEFAULT 0');
  if (await hasTable('storage_plans')) {
    const MB = 1024 * 1024;
    await db.query(
      `INSERT IGNORE INTO storage_plans (code, name, quota_bytes, max_file_bytes, max_concurrent_jobs, is_default) VALUES
        ('beta',  'Beta',  ?, ?, 2, 1),
        ('staff', 'Equipe', ?, ?, 4, 0)`,
      [100 * MB, 20 * MB, 10 * 1024 * MB, 200 * MB],
    );
    await db.query(
      `UPDATE users SET storage_plan_id = (SELECT id FROM storage_plans WHERE is_default = 1 LIMIT 1) WHERE storage_plan_id IS NULL`,
    );
  }

  // consumo medido por job (worker → resultConsumer)
  await addColumn('jobs', 'cpu_seconds', 'decimal(12,3) DEFAULT NULL');
  await addColumn('jobs', 'wall_ms', 'bigint unsigned DEFAULT NULL');
  await addColumn('jobs', 'peak_rss_bytes', 'bigint unsigned DEFAULT NULL');
  await addColumn('jobs', 'mem_bytes', 'bigint unsigned DEFAULT NULL');
  await addColumn('jobs', 'input_bytes', 'bigint unsigned DEFAULT NULL');
  await addColumn('jobs', 'output_bytes', 'bigint unsigned DEFAULT NULL');
  if (await hasTable('storage_plans')) {
    // orçamento mensal de CPU por plano: valores iniciais (editáveis no painel); alimenta o teto da calculadora de custo
    await db.query("UPDATE storage_plans SET monthly_cpu_seconds = 10 * 3600 WHERE code = 'beta' AND monthly_cpu_seconds IS NULL");
    await db.query("UPDATE storage_plans SET monthly_cpu_seconds = 200 * 3600 WHERE code = 'staff' AND monthly_cpu_seconds IS NULL");
  }

  // quizzes: tentativas configuráveis (0 = ilimitadas) e política de nota
  await addColumn('quizzes', 'max_attempts', 'int NOT NULL DEFAULT 1');
  await addColumn('quizzes', 'grade_policy', "enum('highest','latest','first') NOT NULL DEFAULT 'highest'");
  await addColumn('quiz_submissions', 'attempt', 'int NOT NULL DEFAULT 1');
  if (await hasTable('quiz_submissions')) {
    const [idx] = await db.query(
      `SELECT INDEX_NAME FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'quiz_submissions' AND INDEX_NAME = 'uq_submission_user'`,
    );
    if (idx.length) {
      // o FK de quiz_id precisa de um índice próprio antes de largar o único antigo
      await db.query('ALTER TABLE `quiz_submissions` ADD UNIQUE KEY `uq_submission_attempt` (`quiz_id`,`user_id`,`attempt`), DROP INDEX `uq_submission_user`');
      console.log('[migrate] quiz_submissions: uma entrega por tentativa');
    }
  }
}

module.exports = { migrate };
