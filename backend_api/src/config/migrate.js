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
      \`status\` enum('in_progress','submitted','graded') ${COLLATE} NOT NULL DEFAULT 'in_progress',
      \`score\` decimal(7,2) DEFAULT NULL,
      \`feedback\` text ${COLLATE},
      \`submitted_at\` datetime DEFAULT NULL,
      \`graded_by\` bigint unsigned DEFAULT NULL,
      \`graded_at\` datetime DEFAULT NULL,
      \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_submission_uuid\` (\`uuid\`),
      UNIQUE KEY \`uq_submission_user\` (\`quiz_id\`,\`user_id\`),
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
}

module.exports = { migrate };
