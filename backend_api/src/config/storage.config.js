'use strict';

const path = require('path');

const BASE = process.env.STORAGE_PATH || path.join(__dirname, '../../storage');

module.exports = {
  base: BASE,
  tmp: path.join(BASE, 'tmp'),
  datasets: path.join(BASE, 'datasets'),
  models: path.join(BASE, 'models'),
  outputs: path.join(BASE, 'outputs'),
  articles: path.join(BASE, 'articles'),
  avatars: path.join(BASE, 'avatars'),
};
