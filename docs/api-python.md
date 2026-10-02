api/
│
├── app.js                   # Express app, registra routers
├── server.js                # listen, porta, env
│
├── config/
│   ├── database.js          # conexão MySQL (mysql2 ou Sequelize)
│   └── queue.js             # conexão com fila (Redis + Bull ou similar)
│
├── middleware/
│   ├── auth.js              # verificação de JWT
│   ├── errorHandler.js      # handler global de erros
│   └── validate.js          # validação de body (Zod ou Joi)
│
├── routes/
│   ├── index.js             # agrega todos os routers
│   ├── auth.routes.js
│   ├── user.routes.js
│   ├── dataset.routes.js
│   ├── workflow.routes.js
│   ├── technique.routes.js
│   └── execution.routes.js  # os 6 essenciais para o MVP
│
└── controllers/
    ├── auth.controller.js
    ├── user.controller.js
    ├── dataset.controller.js
    ├── workflow.controller.js
    ├── technique.controller.js
    └── execution.controller.js