-- TcheLab — Registro da técnica "kennard_stone" na tabela `techniques`.
--
-- Por quê este arquivo existe: o repositório não tem nenhum sistema de
-- migração (sem Knex/Sequelize/db-migrate, sem schema.sql versionado — ver
-- `docs/database.md` para o DDL completo, que também não está commitado como
-- .sql). O catálogo Python (worker_api/catalog/) se auto-registra sozinho
-- via ScriptFactory, mas a tabela `techniques` do MySQL — de onde o editor
-- de workflow, o ShapeValidatorService e a listagem /techniques leem os
-- schemas de porta — precisa ser populada manualmente.
--
-- Como aplicar: rode este arquivo contra o banco do ambiente
-- (ex: `mysql -u tchelab -p tchelab < backend_api/sql/seed_kennard_stone.sql`).
-- É seguro rodar mais de uma vez: na primeira vez insere a técnica, nas
-- seguintes apenas atualiza os campos (ON DUPLICATE KEY UPDATE pela `slug`,
-- que é UNIQUE) em vez de pular silenciosamente — então reaplicar também
-- conserta a linha caso ela precise de correção (foi exatamente o caso do
-- `SET NAMES utf8mb4` abaixo: sem ele, rodar este arquivo num cliente mysql
-- com locale não-UTF8 — comum em servidores com LANG=C/POSIX — gravava
-- "Separação" como "SeparaÃ§Ã£o", um double-encoding silencioso só visível
-- consultando com `mysql --default-character-set=utf8mb4`; a primeira versão
-- deste arquivo não tinha essa linha e usava WHERE NOT EXISTS, então uma
-- linha já corrompida nunca seria reescrita por um reaplique).
SET NAMES utf8mb4;

INSERT INTO techniques (
  uuid, slug, name, category, subcategory, family, description,
  input_type, output_type, input_schema, output_schema, parameter_schema,
  min_order, max_order, requires_sample_axis, tags, version,
  is_beta, is_custom, implementation, documentation, active,
  created_at, updated_at
) VALUES (
  UUID(),
  'kennard_stone',
  'Separação Kennard-Stone',
  'validation',
  'sample_split',
  '01_dados',
  'Divide as amostras em calibração (treino), teste e, opcionalmente, validação, selecionando iterativamente a amostra mais distante (distância Euclidiana) das já escolhidas — maximiza a cobertura da variabilidade multivariada em vez de uma divisão aleatória. Determinístico: a mesma entrada sempre produz a mesma divisão.',
  'Matrix',
  'Matrix',
  JSON_OBJECT(
    'X', JSON_OBJECT('type', 'matrix', 'description', 'Amostras × variáveis (sample_axis configurável, aceita N-way)')
  ),
  JSON_OBJECT(
    'train', JSON_OBJECT('type', 'matrix', 'description', 'Subconjunto de calibração/treino'),
    'test', JSON_OBJECT('type', 'matrix', 'description', 'Subconjunto de teste'),
    'validation', JSON_OBJECT('type', 'matrix', 'description', 'Subconjunto de validação (presente apenas quando n_validation/validation_size > 0)'),
    'train_indices', JSON_OBJECT('type', 'vector', 'description', 'Índices originais (em X) do conjunto de treino'),
    'test_indices', JSON_OBJECT('type', 'vector', 'description', 'Índices originais (em X) do conjunto de teste'),
    'validation_indices', JSON_OBJECT('type', 'vector', 'description', 'Índices originais (em X) do conjunto de validação')
  ),
  JSON_OBJECT(
    'sample_axis', JSON_OBJECT('type', 'integer', 'default', 0, 'description', 'Eixo de amostras'),
    'n_train', JSON_OBJECT('type', 'integer', 'description', 'Tamanho absoluto do conjunto de treino (prioridade sobre train_size)'),
    'train_size', JSON_OBJECT('type', 'number', 'default', 0.7, 'range', JSON_ARRAY(0, 1), 'description', 'Fração do total para treino, usada quando n_train não é informado'),
    'n_validation', JSON_OBJECT('type', 'integer', 'description', 'Tamanho absoluto do conjunto de validação (opcional)'),
    'validation_size', JSON_OBJECT('type', 'number', 'default', 0, 'range', JSON_ARRAY(0, 1), 'description', 'Fração do total para validação, usada quando n_validation não é informado')
  ),
  1,
  NULL,
  1,
  JSON_ARRAY('kennard-stone', 'split', 'train-test', 'calibração', 'amostragem', 'validação'),
  '1.0',
  0,
  0,
  'worker_api/catalog/familia_01_dados/scripts.py:KennardStone',
  'Ver docs/catalogo_scripts.md#kennard_stone para o algoritmo completo e exemplos.',
  1,
  NOW(),
  NOW()
)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  category = VALUES(category),
  subcategory = VALUES(subcategory),
  family = VALUES(family),
  description = VALUES(description),
  input_type = VALUES(input_type),
  output_type = VALUES(output_type),
  input_schema = VALUES(input_schema),
  output_schema = VALUES(output_schema),
  parameter_schema = VALUES(parameter_schema),
  min_order = VALUES(min_order),
  max_order = VALUES(max_order),
  requires_sample_axis = VALUES(requires_sample_axis),
  tags = VALUES(tags),
  implementation = VALUES(implementation),
  documentation = VALUES(documentation),
  active = VALUES(active),
  updated_at = NOW();
