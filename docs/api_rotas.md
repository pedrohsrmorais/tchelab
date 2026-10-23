# Rotas da API (geradas do código)

> **Não edite à mão.** Gerado por `backend_api/scripts/gen_routes_doc.js` a partir de `backend_api/src/routes/api.routes.js`
> (268 rotas). Para atualizar: `cd backend_api && node scripts/gen_routes_doc.js`.
> Descrição de cada área, regras e exemplos: [api.md](api.md) (núcleo), [apps_comunidade.md](apps_comunidade.md) (Quiz, Equipamentos, Quadro),
> [comunidades_perfil_i18n.md](comunidades_perfil_i18n.md) (perfil, comunidades, idiomas) e [armazenamento.md](armazenamento.md) (cota e consumo).

Convenções: prefixo `/api/v1`; respostas `{ data, meta, error }`; "acesso" é o que a rota exige no roteador (regras mais finas
— dono do recurso, papel, visibilidade — ficam no controller). Cota de armazenamento: **413** `STORAGE_QUOTA_EXCEEDED`/`FILE_TOO_LARGE`,
**503** `STORAGE_SERVER_FULL`; orçamento de CPU: **402** `CPU_BUDGET_EXCEEDED`.

## AUTH

| Método | Rota | Acesso | Handler |
|---|---|---|---|
| POST | `/api/v1/auth/register` | pública | `authCtrl.register` |
| POST | `/api/v1/auth/login` | pública | `authCtrl.login` |
| POST | `/api/v1/auth/logout` | login | `authCtrl.logout` |
| POST | `/api/v1/auth/refresh` | pública | `authCtrl.refresh` |
| POST | `/api/v1/auth/forgot-password` | pública | `authCtrl.forgotPassword` |
| POST | `/api/v1/auth/reset-password` | pública | `authCtrl.resetPassword` |
| POST | `/api/v1/auth/change-password` | login | `authCtrl.changePassword` |
| GET | `/api/v1/auth/me` | login | `authCtrl.me` |

## USERS

| Método | Rota | Acesso | Handler |
|---|---|---|---|
| GET | `/api/v1/users/:id` | login | `userCtrl.getUser` |
| PUT | `/api/v1/users/:id` | login | `userCtrl.updateUser` |
| POST | `/api/v1/users/:id/avatar` | login (próprio ou admin) | `userCtrl.uploadAvatar` |
| DELETE | `/api/v1/users/:id/avatar` | login (próprio ou admin) | `userCtrl.deleteAvatar` |
| GET | `/api/v1/users/:id/projects` | login | `userCtrl.listUserProjects` |
| GET | `/api/v1/users/:id/communities` | login | `userCtrl.listUserCommunities` |
| GET | `/api/v1/users/:id/stats` | login | `userCtrl.getStats` |
| DELETE | `/api/v1/users/:id` | login | `userCtrl.deleteUser` |

## COMMUNITIES

| Método | Rota | Acesso | Handler |
|---|---|---|---|
| GET | `/api/v1/communities` | login | `communityCtrl.listMyCommunities` |
| GET | `/api/v1/communities/public` | login | `communityCtrl.listPublicCommunities` |
| POST | `/api/v1/communities` | login | `communityCtrl.createCommunity` |
| POST | `/api/v1/communities/join` | login | `communityCtrl.joinWithCode` |
| GET | `/api/v1/communities/invite/:code` | login | `communityCtrl.previewInvite` |
| GET | `/api/v1/communities/:id` | login + papel visible+ na comunidade | `communityCtrl.getCommunity` |
| PUT | `/api/v1/communities/:id` | login + papel admin+ na comunidade | `communityCtrl.updateCommunity` |
| DELETE | `/api/v1/communities/:id` | login + papel owner+ na comunidade | `communityCtrl.deleteCommunity` |
| POST | `/api/v1/communities/:id/join` | login | `communityCtrl.joinPublic` |
| POST | `/api/v1/communities/:id/leave` | login + papel member+ na comunidade | `communityCtrl.leaveCommunity` |
| POST | `/api/v1/communities/:id/transfer` | login + papel owner+ na comunidade | `communityCtrl.transferOwnership` |
| GET | `/api/v1/communities/:id/invites` | login + papel moderator+ na comunidade | `communityCtrl.listInvites` |
| POST | `/api/v1/communities/:id/invites` | login + papel moderator+ na comunidade | `communityCtrl.createInvite` |
| DELETE | `/api/v1/communities/:id/invites/:iid` | login + papel moderator+ na comunidade | `communityCtrl.revokeInvite` |
| GET | `/api/v1/communities/:id/members` | login + papel member+ na comunidade | `communityCtrl.listMembers` |
| PUT | `/api/v1/communities/:id/members/:uid` | login + papel admin+ na comunidade | `communityCtrl.updateMember` |
| DELETE | `/api/v1/communities/:id/members/:uid` | login + papel moderator+ na comunidade | `communityCtrl.removeMember` |
| GET | `/api/v1/communities/:id/bans` | login + papel admin+ na comunidade | `communityCtrl.listBans` |
| DELETE | `/api/v1/communities/:id/bans/:uid` | login + papel admin+ na comunidade | `communityCtrl.removeBan` |
| GET | `/api/v1/communities/:id/projects` | login + papel visible+ na comunidade | `communityCtrl.listCommunityProjects` |
| POST | `/api/v1/communities/:id/projects` | login + papel member+ na comunidade | `communityCtrl.linkProject` |
| PUT | `/api/v1/communities/:id/projects/:pid` | login + papel member+ na comunidade | `communityCtrl.updateProjectLink` |
| DELETE | `/api/v1/communities/:id/projects/:pid` | login + papel member+ na comunidade | `communityCtrl.unlinkProject` |
| GET | `/api/v1/communities/:id/datasets` | login + papel member+ na comunidade | `communityCtrl.listCommunityDatasets` |
| POST | `/api/v1/communities/:id/datasets` | login + papel member+ na comunidade | `communityCtrl.shareDataset` |
| DELETE | `/api/v1/communities/:id/datasets/:did` | login + papel member+ na comunidade | `communityCtrl.removeDatasetShare` |
| GET | `/api/v1/communities/:id/workflows` | login + papel member+ na comunidade | `communityCtrl.listCommunityWorkflows` |
| POST | `/api/v1/communities/:id/workflows` | login + papel member+ na comunidade | `communityCtrl.shareWorkflow` |
| DELETE | `/api/v1/communities/:id/workflows/:wid` | login + papel member+ na comunidade | `communityCtrl.removeWorkflowShare` |
| GET | `/api/v1/communities/:id/content` | login + papel member+ na comunidade | `communityCtrl.getContent` |
| POST | `/api/v1/communities/:id/sections` | login + papel moderator+ na comunidade | `communityCtrl.createSection` |
| PUT | `/api/v1/communities/:id/sections-order` | login + papel moderator+ na comunidade | `communityCtrl.reorderSections` |
| PUT | `/api/v1/communities/:id/sections/:sid` | login + papel moderator+ na comunidade | `communityCtrl.updateSection` |
| DELETE | `/api/v1/communities/:id/sections/:sid` | login + papel moderator+ na comunidade | `communityCtrl.deleteSection` |
| POST | `/api/v1/communities/:id/items` | login + papel moderator+ na comunidade | `communityCtrl.createItem` |
| PUT | `/api/v1/communities/:id/items-order` | login + papel moderator+ na comunidade | `communityCtrl.reorderItems` |
| PUT | `/api/v1/communities/:id/items/:iid` | login + papel moderator+ na comunidade | `communityCtrl.updateItem` |
| DELETE | `/api/v1/communities/:id/items/:iid` | login + papel moderator+ na comunidade | `communityCtrl.deleteItem` |
| GET | `/api/v1/communities/:id/items/:iid/file` | login + papel member+ na comunidade | `communityCtrl.downloadItemFile` |
| GET | `/api/v1/communities/:id/quizzes` | login + papel member+ na comunidade | `quizCtrl.listQuizzes` |
| POST | `/api/v1/communities/:id/quizzes` | login + papel moderator+ na comunidade | `quizCtrl.createQuiz` |
| GET | `/api/v1/communities/:id/quizzes/:qid` | login + papel member+ na comunidade | `quizCtrl.getQuiz` |
| PUT | `/api/v1/communities/:id/quizzes/:qid` | login + papel moderator+ na comunidade | `quizCtrl.updateQuiz` |
| DELETE | `/api/v1/communities/:id/quizzes/:qid` | login + papel moderator+ na comunidade | `quizCtrl.deleteQuiz` |
| PUT | `/api/v1/communities/:id/quizzes/:qid/questions` | login + papel moderator+ na comunidade | `quizCtrl.saveQuestions` |
| POST | `/api/v1/communities/:id/quizzes/:qid/start` | login + papel member+ na comunidade | `quizCtrl.startQuiz` |
| PUT | `/api/v1/communities/:id/quizzes/:qid/answers/:question` | login + papel member+ na comunidade | `quizCtrl.saveAnswer` |
| POST | `/api/v1/communities/:id/quizzes/:qid/submit` | login + papel member+ na comunidade | `quizCtrl.submitQuiz` |
| GET | `/api/v1/communities/:id/quizzes/:qid/submissions` | login + papel moderator+ na comunidade | `quizCtrl.listSubmissions` |
| GET | `/api/v1/communities/:id/quizzes/:qid/submissions/:sid` | login + papel moderator+ na comunidade | `quizCtrl.getSubmission` |
| PUT | `/api/v1/communities/:id/quizzes/:qid/submissions/:sid/grade` | login + papel moderator+ na comunidade | `quizCtrl.gradeSubmission` |
| POST | `/api/v1/communities/:id/quizzes/:qid/submissions/:sid/reopen` | login + papel moderator+ na comunidade | `quizCtrl.reopenSubmission` |

## Equipamentos (agendador)

| Método | Rota | Acesso | Handler |
|---|---|---|---|
| GET | `/api/v1/communities/:id/boards` | login + papel member+ na comunidade | `boardCtrl.listBoards` |
| POST | `/api/v1/communities/:id/boards` | login + papel moderator+ na comunidade | `boardCtrl.createBoard` |
| GET | `/api/v1/communities/:id/boards/my-items` | login + papel member+ na comunidade | `boardCtrl.myItems` |
| POST | `/api/v1/communities/:id/boards/reorder` | login + papel moderator+ na comunidade | `boardCtrl.reorderBoards` |
| GET | `/api/v1/communities/:id/boards/:bid` | login + papel member+ na comunidade | `boardCtrl.getBoard` |
| PUT | `/api/v1/communities/:id/boards/:bid` | login + papel moderator+ na comunidade | `boardCtrl.updateBoard` |
| DELETE | `/api/v1/communities/:id/boards/:bid` | login + papel moderator+ na comunidade | `boardCtrl.deleteBoard` |
| POST | `/api/v1/communities/:id/boards/:bid/groups` | login + papel moderator+ na comunidade | `boardCtrl.createGroup` |
| POST | `/api/v1/communities/:id/boards/:bid/groups/reorder` | login + papel moderator+ na comunidade | `boardCtrl.reorderGroups` |
| PUT | `/api/v1/communities/:id/boards/:bid/groups/:gid` | login + papel moderator+ na comunidade | `boardCtrl.updateGroup` |
| DELETE | `/api/v1/communities/:id/boards/:bid/groups/:gid` | login + papel moderator+ na comunidade | `boardCtrl.deleteGroup` |
| POST | `/api/v1/communities/:id/boards/:bid/columns` | login + papel moderator+ na comunidade | `boardCtrl.createColumn` |
| POST | `/api/v1/communities/:id/boards/:bid/columns/reorder` | login + papel moderator+ na comunidade | `boardCtrl.reorderColumns` |
| PUT | `/api/v1/communities/:id/boards/:bid/columns/:cid` | login + papel moderator+ na comunidade | `boardCtrl.updateColumn` |
| DELETE | `/api/v1/communities/:id/boards/:bid/columns/:cid` | login + papel moderator+ na comunidade | `boardCtrl.deleteColumn` |
| POST | `/api/v1/communities/:id/boards/:bid/items` | login + papel member+ na comunidade | `boardCtrl.createItem` |
| POST | `/api/v1/communities/:id/boards/:bid/items/bulk` | login + papel member+ na comunidade | `boardCtrl.bulkItems` |
| GET | `/api/v1/communities/:id/boards/:bid/items/:iid` | login + papel member+ na comunidade | `boardCtrl.getItem` |
| PUT | `/api/v1/communities/:id/boards/:bid/items/:iid` | login + papel member+ na comunidade | `boardCtrl.updateItem` |
| DELETE | `/api/v1/communities/:id/boards/:bid/items/:iid` | login + papel member+ na comunidade | `boardCtrl.deleteItem` |
| POST | `/api/v1/communities/:id/boards/:bid/items/:iid/move` | login + papel member+ na comunidade | `boardCtrl.moveItem` |
| POST | `/api/v1/communities/:id/boards/:bid/items/:iid/duplicate` | login + papel member+ na comunidade | `boardCtrl.duplicateItem` |
| PUT | `/api/v1/communities/:id/boards/:bid/items/:iid/cells/:cid` | login + papel member+ na comunidade | `boardCtrl.setCell` |
| POST | `/api/v1/communities/:id/boards/:bid/items/:iid/comments` | login + papel member+ na comunidade | `boardCtrl.createComment` |
| DELETE | `/api/v1/communities/:id/boards/:bid/items/:iid/comments/:cmid` | login + papel member+ na comunidade | `boardCtrl.deleteComment` |
| GET | `/api/v1/communities/:id/equipment` | login + papel member+ na comunidade | `equipmentCtrl.listEquipment` |
| POST | `/api/v1/communities/:id/equipment` | login + papel moderator+ na comunidade | `equipmentCtrl.createEquipment` |
| GET | `/api/v1/communities/:id/equipment/bookings/mine` | login + papel member+ na comunidade | `equipmentCtrl.myBookings` |
| GET | `/api/v1/communities/:id/equipment/:eid` | login + papel member+ na comunidade | `equipmentCtrl.getEquipment` |
| PUT | `/api/v1/communities/:id/equipment/:eid` | login + papel moderator+ na comunidade | `equipmentCtrl.updateEquipment` |
| DELETE | `/api/v1/communities/:id/equipment/:eid` | login + papel moderator+ na comunidade | `equipmentCtrl.deleteEquipment` |
| POST | `/api/v1/communities/:id/equipment/:eid/public-token` | login + papel moderator+ na comunidade | `equipmentCtrl.rotateToken` |
| GET | `/api/v1/communities/:id/equipment/:eid/image` | login + papel member+ na comunidade | `equipmentCtrl.getImage` |
| POST | `/api/v1/communities/:id/equipment/:eid/image` | login + papel moderator+ na comunidade | `equipmentCtrl.uploadImage` |
| DELETE | `/api/v1/communities/:id/equipment/:eid/image` | login + papel moderator+ na comunidade | `equipmentCtrl.deleteImage` |
| PUT | `/api/v1/communities/:id/equipment/:eid/windows` | login + papel moderator+ na comunidade | `equipmentCtrl.saveWindows` |
| GET | `/api/v1/communities/:id/equipment/:eid/blocks` | login + papel moderator+ na comunidade | `equipmentCtrl.listBlocks` |
| POST | `/api/v1/communities/:id/equipment/:eid/blocks` | login + papel moderator+ na comunidade | `equipmentCtrl.createBlock` |
| DELETE | `/api/v1/communities/:id/equipment/:eid/blocks/:bid` | login + papel moderator+ na comunidade | `equipmentCtrl.deleteBlock` |
| GET | `/api/v1/communities/:id/equipment/:eid/availability` | login + papel member+ na comunidade | `equipmentCtrl.availability` |
| GET | `/api/v1/communities/:id/equipment/:eid/bookings` | login + papel member+ na comunidade | `equipmentCtrl.listBookings` |
| POST | `/api/v1/communities/:id/equipment/:eid/bookings` | login + papel member+ na comunidade | `equipmentCtrl.createBooking` |
| POST | `/api/v1/communities/:id/equipment/:eid/bookings/:bid/:action` | login + papel member+ na comunidade | `equipmentCtrl.bookingAction` |
| GET | `/api/v1/public/equipment/:token` | pública | `publicEquipmentCtrl.getPublic` |
| GET | `/api/v1/public/equipment/:token/image` | pública | `publicEquipmentCtrl.getImage` |
| GET | `/api/v1/public/equipment/:token/availability` | pública | `publicEquipmentCtrl.availability` |
| POST | `/api/v1/public/equipment/:token/bookings` | pública | `publicEquipmentCtrl.createGuestBooking` |
| GET | `/api/v1/public/bookings/:mt` | pública | `publicEquipmentCtrl.getManaged` |
| POST | `/api/v1/public/bookings/:mt/confirm` | pública | `publicEquipmentCtrl.confirmManaged` |
| POST | `/api/v1/public/bookings/:mt/cancel` | pública | `publicEquipmentCtrl.cancelManaged` |
| GET | `/api/v1/communities/:id/messages` | login + papel member+ na comunidade | `communityCtrl.listMessages` |
| POST | `/api/v1/communities/:id/messages` | login + papel member+ na comunidade | `communityCtrl.sendMessage` |
| DELETE | `/api/v1/communities/:id/messages/:mid` | login + papel member+ na comunidade | `communityCtrl.deleteMessage` |

## PROJECTS

| Método | Rota | Acesso | Handler |
|---|---|---|---|
| GET | `/api/v1/projects` | login | `projectCtrl.listProjects` |
| POST | `/api/v1/projects` | login | `projectCtrl.createProject` |
| GET | `/api/v1/projects/:id` | login | `projectCtrl.getProject` |
| PUT | `/api/v1/projects/:id` | login | `projectCtrl.updateProject` |
| DELETE | `/api/v1/projects/:id` | login | `projectCtrl.deleteProject` |
| GET | `/api/v1/projects/:id/members` | login | `projectCtrl.listProjectMembers` |
| POST | `/api/v1/projects/:id/members` | login | `projectCtrl.addProjectMember` |
| PUT | `/api/v1/projects/:id/members/:uid` | login | `projectCtrl.updateProjectMemberRole` |
| DELETE | `/api/v1/projects/:id/members/:uid` | login | `projectCtrl.removeProjectMember` |
| GET | `/api/v1/projects/:id/datasets` | login | `projectCtrl.listProjectDatasets` |
| POST | `/api/v1/projects/:id/datasets` | login | `projectCtrl.addDatasetToProject` |
| PUT | `/api/v1/projects/:id/datasets/:did` | login | `projectCtrl.updateDatasetPurpose` |
| DELETE | `/api/v1/projects/:id/datasets/:did` | login | `projectCtrl.removeDatasetFromProject` |
| GET | `/api/v1/projects/:id/workflows` | login | `projectCtrl.listProjectWorkflows` |
| POST | `/api/v1/projects/:id/workflows` | login | `projectCtrl.addWorkflowToProject` |
| DELETE | `/api/v1/projects/:id/workflows/:wid` | login | `projectCtrl.removeWorkflowFromProject` |
| GET | `/api/v1/projects/:id/articles` | login | `projectCtrl.listProjectArticles` |
| POST | `/api/v1/projects/:id/articles` | login | `projectCtrl.addArticleToProject` |
| DELETE | `/api/v1/projects/:id/articles/:aid` | login | `projectCtrl.removeArticleFromProject` |
| GET | `/api/v1/projects/:id/techniques` | login | `projectCtrl.listProjectTechniques` |
| POST | `/api/v1/projects/:id/techniques` | login | `projectCtrl.addProjectTechnique` |
| DELETE | `/api/v1/projects/:id/techniques/:tid` | login | `projectCtrl.removeProjectTechnique` |
| GET | `/api/v1/projects/:id/communities` | login | `projectCtrl.listProjectCommunities` |
| GET | `/api/v1/projects/:id/history` | login | `projectCtrl.getProjectHistory` |

## SPECTRA

| Método | Rota | Acesso | Handler |
|---|---|---|---|
| GET | `/api/v1/spectra` | login | `spectrumCtrl.listSpectra` |
| POST | `/api/v1/spectra` | login | `spectrumCtrl.createSpectrum` |
| POST | `/api/v1/spectra/batch` | login | `spectrumCtrl.batchImport` |
| GET | `/api/v1/spectra/:id` | login | `spectrumCtrl.getSpectrum` |
| PUT | `/api/v1/spectra/:id` | login | `spectrumCtrl.updateSpectrum` |
| DELETE | `/api/v1/spectra/:id` | login | `spectrumCtrl.deleteSpectrum` |
| GET | `/api/v1/spectra/:id/plot` | login | `spectrumCtrl.getPlotData` |

## COLLECTIONS

| Método | Rota | Acesso | Handler |
|---|---|---|---|
| GET | `/api/v1/collections` | login | `collectionCtrl.listCollections` |
| POST | `/api/v1/collections` | login | `collectionCtrl.createCollection` |
| GET | `/api/v1/collections/:id` | login | `collectionCtrl.getCollection` |
| PUT | `/api/v1/collections/:id` | login | `collectionCtrl.updateCollection` |
| DELETE | `/api/v1/collections/:id` | login | `collectionCtrl.deleteCollection` |
| GET | `/api/v1/collections/:id/spectra` | login | `collectionCtrl.listCollectionSpectra` |
| POST | `/api/v1/collections/:id/spectra` | login | `collectionCtrl.addSpectraToCollection` |
| DELETE | `/api/v1/collections/:id/spectra/:sid` | login | `collectionCtrl.removeSpectrumFromCollection` |

## DATASETS

| Método | Rota | Acesso | Handler |
|---|---|---|---|
| GET | `/api/v1/datasets` | login | `datasetCtrl.listDatasets` |
| POST | `/api/v1/datasets` | login | `datasetCtrl.createDataset` |
| POST | `/api/v1/datasets/import` | login | `datasetCtrl.smartImport` |
| GET | `/api/v1/datasets/:id` | login | `datasetCtrl.getDataset` |
| POST | `/api/v1/datasets/:id/copy` | login | `datasetCtrl.copyDataset` |
| PUT | `/api/v1/datasets/:id` | login | `datasetCtrl.updateDataset` |
| DELETE | `/api/v1/datasets/:id` | login | `datasetCtrl.deleteDataset` |
| GET | `/api/v1/datasets/:id/lineage` | login | `datasetCtrl.getLineage` |
| GET | `/api/v1/datasets/:id/slice` | login | `datasetCtrl.getSlice` |
| GET | `/api/v1/datasets/:id/preview` | login | `datasetCtrl.getPreview` |
| POST | `/api/v1/datasets/:id/spectra` | login | `datasetCtrl.addSpectraToDataset` |
| GET | `/api/v1/datasets/:id/spectra` | login | `datasetCtrl.listDatasetSpectra` |
| POST | `/api/v1/datasets/:id/operations` | login | `datasetOperationCtrl.createQuickOperation` |
| GET | `/api/v1/datasets/:id/operations` | login | `datasetOperationCtrl.listOperations` |
| GET | `/api/v1/operations/:id` | login | `datasetOperationCtrl.getOperation` |

## ARTICLES

| Método | Rota | Acesso | Handler |
|---|---|---|---|
| GET | `/api/v1/articles` | login | `articleCtrl.listArticles` |
| POST | `/api/v1/articles` | login | `articleCtrl.createArticle` |
| POST | `/api/v1/articles/upload` | login | `articleCtrl.uploadPDF` |
| GET | `/api/v1/articles/:id` | login | `articleCtrl.getArticle` |
| PUT | `/api/v1/articles/:id` | login | `articleCtrl.updateArticle` |
| DELETE | `/api/v1/articles/:id` | login | `articleCtrl.deleteArticle` |
| POST | `/api/v1/articles/:id/analyze` | login | `articleCtrl.analyzeArticle` |

## ARTICLE ANALYSES

| Método | Rota | Acesso | Handler |
|---|---|---|---|
| GET | `/api/v1/article-analyses` | login | `articleAnalysisCtrl.listAnalyses` |
| GET | `/api/v1/article-analyses/:id` | login | `articleAnalysisCtrl.getAnalysis` |
| GET | `/api/v1/article-analyses/:id/techniques` | login | `articleAnalysisCtrl.getTechniques` |
| POST | `/api/v1/article-analyses/:id/generate-workflow` | login | `articleAnalysisCtrl.generateWorkflow` |
| DELETE | `/api/v1/article-analyses/:id` | login | `articleAnalysisCtrl.deleteAnalysis` |

## TECHNIQUES

| Método | Rota | Acesso | Handler |
|---|---|---|---|
| GET | `/api/v1/techniques` | login | `techniqueCtrl.listTechniques` |
| GET | `/api/v1/techniques/categories` | login | `techniqueCtrl.listCategories` |
| GET | `/api/v1/techniques/:id` | login | `techniqueCtrl.getTechnique` |
| GET | `/api/v1/techniques/:id/compatibilities` | login | `techniqueCtrl.getCompatibilities` |
| POST | `/api/v1/techniques` | login | `techniqueCtrl.createCustomTechnique` |
| PUT | `/api/v1/techniques/:id` | login | `techniqueCtrl.updateCustomTechnique` |
| DELETE | `/api/v1/techniques/:id` | login | `techniqueCtrl.deleteCustomTechnique` |

## WORKFLOWS

| Método | Rota | Acesso | Handler |
|---|---|---|---|
| GET | `/api/v1/workflows` | login | `workflowCtrl.listWorkflows` |
| GET | `/api/v1/workflows/templates` | login | `workflowCtrl.listTemplates` |
| POST | `/api/v1/workflows` | login | `workflowCtrl.createWorkflow` |
| GET | `/api/v1/workflows/:id` | login | `workflowCtrl.getWorkflow` |
| PUT | `/api/v1/workflows/:id` | login | `workflowCtrl.updateWorkflow` |
| DELETE | `/api/v1/workflows/:id` | login | `workflowCtrl.deleteWorkflow` |
| POST | `/api/v1/workflows/:id/fork` | login | `workflowCtrl.forkWorkflow` |
| POST | `/api/v1/workflows/:id/snapshot` | login | `workflowCtrl.saveSnapshot` |
| GET | `/api/v1/workflows/:id/versions` | login | `workflowCtrl.listVersions` |
| GET | `/api/v1/workflows/:id/versions/:vid` | login | `workflowCtrl.getVersion` |
| POST | `/api/v1/workflows/:id/versions/:vid/restore` | login | `workflowCtrl.restoreVersion` |
| PUT | `/api/v1/workflows/:id/template` | login | `workflowCtrl.setTemplate` |
| GET | `/api/v1/workflows/:wid/nodes` | login | `workflowNodeCtrl.listNodes` |
| POST | `/api/v1/workflows/:wid/nodes` | login | `workflowNodeCtrl.addNode` |
| GET | `/api/v1/workflows/:wid/nodes/:nid` | login | `workflowNodeCtrl.getNode` |
| PUT | `/api/v1/workflows/:wid/nodes/:nid` | login | `workflowNodeCtrl.updateNode` |
| DELETE | `/api/v1/workflows/:wid/nodes/:nid` | login | `workflowNodeCtrl.deleteNode` |
| GET | `/api/v1/workflows/:wid/edges` | login | `workflowEdgeCtrl.listEdges` |
| POST | `/api/v1/workflows/:wid/edges` | login | `workflowEdgeCtrl.createEdge` |
| DELETE | `/api/v1/workflows/:wid/edges/:eid` | login | `workflowEdgeCtrl.deleteEdge` |
| POST | `/api/v1/workflows/:wid/validate` | login | `workflowEdgeCtrl.validateWorkflow` |
| GET | `/api/v1/workflows/:wid/executions` | login | `executionCtrl.listExecutions` |
| POST | `/api/v1/workflows/:wid/executions` | login | `executionCtrl.dispatchExecution` |

## EXECUTIONS

| Método | Rota | Acesso | Handler |
|---|---|---|---|
| GET | `/api/v1/executions/:id` | login | `executionCtrl.getExecution` |
| DELETE | `/api/v1/executions/:id` | login | `executionCtrl.deleteExecution` |
| POST | `/api/v1/executions/:id/cancel` | login | `executionCtrl.cancelExecution` |
| GET | `/api/v1/executions/:id/nodes` | login | `executionCtrl.listExecutionNodes` |
| GET | `/api/v1/executions/:id/nodes/:nid` | login | `executionCtrl.getExecutionNode` |
| POST | `/api/v1/executions/:id/nodes/:nid/outputs/:port` | login | `executionCtrl.saveNodeOutputAsDataset` |
| GET | `/api/v1/executions/:id/logs` | login | `executionCtrl.getExecutionLogs` |
| GET | `/api/v1/executions/:id/metrics` | login | `metricCtrl.getExecutionMetrics` |
| GET | `/api/v1/executions/:id/nodes/:nid/metrics` | login | `metricCtrl.getNodeMetrics` |

## MODELS

| Método | Rota | Acesso | Handler |
|---|---|---|---|
| GET | `/api/v1/models` | login | `modelCtrl.listModels` |
| GET | `/api/v1/models/:id` | login | `modelCtrl.getModel` |
| PUT | `/api/v1/models/:id` | login | `modelCtrl.updateModel` |
| DELETE | `/api/v1/models/:id` | login | `modelCtrl.deleteModel` |
| GET | `/api/v1/models/:id/metrics` | login | `modelCtrl.getModelMetrics` |
| POST | `/api/v1/models/:id/export` | login | `modelCtrl.exportModel` |

## PREDICTIONS

| Método | Rota | Acesso | Handler |
|---|---|---|---|
| GET | `/api/v1/predictions` | login | `predictionCtrl.listPredictions` |
| POST | `/api/v1/predictions` | login | `predictionCtrl.createPrediction` |
| GET | `/api/v1/predictions/:id` | login | `predictionCtrl.getPrediction` |
| GET | `/api/v1/predictions/:id/results` | login | `predictionCtrl.getPredictionResults` |
| DELETE | `/api/v1/predictions/:id` | login | `predictionCtrl.deletePrediction` |

## METRICS (comparação cruzada)

| Método | Rota | Acesso | Handler |
|---|---|---|---|
| POST | `/api/v1/metrics/compare` | login | `metricCtrl.compareMetrics` |

## EXECUTION COMPARISONS

| Método | Rota | Acesso | Handler |
|---|---|---|---|
| GET | `/api/v1/execution-comparisons` | login | `comparisonCtrl.listComparisons` |
| POST | `/api/v1/execution-comparisons` | login | `comparisonCtrl.createComparison` |
| GET | `/api/v1/execution-comparisons/:id` | login | `comparisonCtrl.getComparison` |
| DELETE | `/api/v1/execution-comparisons/:id` | login | `comparisonCtrl.deleteComparison` |

## SYNTHETIC DATASETS

| Método | Rota | Acesso | Handler |
|---|---|---|---|
| GET | `/api/v1/synthetic-datasets` | login | `syntheticCtrl.listSyntheticDatasets` |
| POST | `/api/v1/synthetic-datasets` | login | `syntheticCtrl.createSyntheticDataset` |
| GET | `/api/v1/synthetic-datasets/:id` | login | `syntheticCtrl.getSyntheticDataset` |
| DELETE | `/api/v1/synthetic-datasets/:id` | login | `syntheticCtrl.deleteSyntheticDataset` |

## JOBS

| Método | Rota | Acesso | Handler |
|---|---|---|---|
| GET | `/api/v1/jobs` | login | `jobCtrl.listJobs` |
| GET | `/api/v1/jobs/admin` | login | `jobCtrl.listAllJobs` |
| GET | `/api/v1/jobs/:id` | login | `jobCtrl.getJob` |
| POST | `/api/v1/jobs/:id/cancel` | login | `jobCtrl.cancelJob` |
| POST | `/api/v1/jobs/:id/retry` | login | `jobCtrl.retryJob` |

## AI INTERACTIONS

| Método | Rota | Acesso | Handler |
|---|---|---|---|
| GET | `/api/v1/ai-interactions` | login | `aiCtrl.listInteractions` |
| POST | `/api/v1/ai-interactions` | login | `aiCtrl.createInteraction` |
| GET | `/api/v1/ai-interactions/:id` | login | `aiCtrl.getInteraction` |
| POST | `/api/v1/ai-interactions/:id/feedback` | login | `aiCtrl.submitFeedback` |
| DELETE | `/api/v1/ai-interactions/:id` | login | `aiCtrl.deleteInteraction` |

## AUDIT & ADMIN

| Método | Rota | Acesso | Handler |
|---|---|---|---|
| GET | `/api/v1/audit-logs` | login | `auditCtrl.listAuditLogs` |
| GET | `/api/v1/audit-logs/:id` | login | `auditCtrl.getAuditLog` |
| GET | `/api/v1/audit-logs/resource/:type/:uuid` | login | `auditCtrl.getResourceAuditLogs` |
| GET | `/api/v1/storage/usage` | login | `storageCtrl.myUsage` |
| GET | `/api/v1/usage/compute` | login | `storageCtrl.myCompute` |
| GET | `/api/v1/admin/storage/costs` | login + admin | `storageCtrl.costs` |
| PUT | `/api/v1/admin/storage/prices` | login + admin | `storageCtrl.updatePrices` |
| GET | `/api/v1/admin/storage` | login + admin | `storageCtrl.adminOverview` |
| GET | `/api/v1/admin/storage/plans` | login + admin | `storageCtrl.listPlans` |
| PUT | `/api/v1/admin/storage/plans/:code` | login + admin | `storageCtrl.updatePlan` |
| PUT | `/api/v1/admin/storage/users/:uuid` | login + admin | `storageCtrl.updateUserQuota` |
| GET | `/api/v1/admin/stats` | login + admin | `auditCtrl.getAdminStats` |

