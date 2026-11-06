pub mod agent;
pub mod agent_status;
pub mod ai_privacy;
mod assets;
pub mod backup;
pub mod component_ai;
mod definitions;
pub mod document;
pub mod library;
pub mod links;
pub mod migration;
pub mod private_import;
pub mod relations;
pub mod schema_ai;
#[cfg(feature = "semantic")]
pub mod semantic;
pub mod store;
pub mod subscription;

#[cfg(feature = "desktop")]
mod desktop {
    use crate::store::{Folder, Note, NoteSummary, Store, WorkspaceStatus};
    use std::sync::{Arc, Mutex};
    use tauri::{Manager, State};

    type SharedStore = Arc<Mutex<Store>>;
    type SharedGraph = Arc<Mutex<crate::store::ReadView>>;

    async fn read_work<T: Send + 'static>(
        state: State<'_, SharedGraph>,
        f: impl FnOnce(&Store) -> Result<T, String> + Send + 'static,
    ) -> Result<T, String> {
        let state = state.inner().clone();
        tauri::async_runtime::spawn_blocking(move || {
            let reader = state
                .lock()
                .map_err(|_| "Graph reader lock failed".to_string())?;
            f(&reader)
        })
        .await
        .map_err(|e| e.to_string())?
    }

    async fn work<T: Send + 'static>(
        state: State<'_, SharedStore>,
        f: impl FnOnce(&mut Store) -> Result<T, String> + Send + 'static,
    ) -> Result<T, String> {
        let state = state.inner().clone();
        tauri::async_runtime::spawn_blocking(move || {
            let mut store = state
                .lock()
                .map_err(|_| "Workspace lock failed".to_string())?;
            f(&mut store)
        })
        .await
        .map_err(|e| e.to_string())?
    }

    #[tauri::command]
    pub async fn list_notes(state: State<'_, SharedStore>) -> Result<Vec<NoteSummary>, String> {
        work(state, |s| s.list_notes()).await
    }
    #[tauri::command]
    pub async fn list_folders(state: State<'_, SharedStore>) -> Result<Vec<Folder>, String> {
        work(state, |s| s.list_folders()).await
    }
    #[tauri::command]
    pub async fn create_folder(
        state: State<'_, SharedStore>,
        name: String,
        parent_id: Option<String>,
    ) -> Result<Folder, String> {
        work(state, move |s| s.create_folder(name, parent_id)).await
    }
    #[tauri::command]
    pub async fn create_note(
        state: State<'_, SharedStore>,
        semantic: State<'_, Arc<crate::semantic::SemanticService>>,
        title: String,
        folder_id: Option<String>,
    ) -> Result<Note, String> {
        let result = work(state, move |s| s.create_note(title, folder_id)).await;
        if result.is_ok() {
            semantic.invalidate_scope();
        }
        result
    }
    #[tauri::command]
    pub async fn load_note(state: State<'_, SharedStore>, id: String) -> Result<Note, String> {
        work(state, move |s| s.load_note(&id)).await
    }
    #[tauri::command]
    pub async fn previous_note(
        state: State<'_, SharedStore>,
        id: String,
    ) -> Result<Option<Note>, String> {
        work(state, move |s| s.previous_note(&id)).await
    }
    #[tauri::command]
    pub async fn import_image(
        state: State<'_, SharedStore>,
        note_id: String,
        bytes: Vec<u8>,
        mime: String,
    ) -> Result<crate::assets::ImageInfo, String> {
        work(state, move |s| s.import_image(&note_id, &bytes, &mime)).await
    }
    #[tauri::command]
    pub async fn read_image(
        state: State<'_, SharedStore>,
        note_id: String,
        asset_id: String,
    ) -> Result<crate::assets::ImageData, String> {
        work(state, move |s| s.read_image(&note_id, &asset_id)).await
    }
    #[tauri::command]
    pub async fn copy_image(
        state: State<'_, SharedStore>,
        source_note_id: String,
        target_note_id: String,
        asset_id: String,
    ) -> Result<crate::assets::ImageInfo, String> {
        work(state, move |s| {
            s.copy_image(&source_note_id, &target_note_id, &asset_id)
        })
        .await
    }
    #[tauri::command]
    pub async fn list_document_definitions(
        state: State<'_, SharedStore>,
        kind: String,
    ) -> Result<Vec<serde_json::Value>, String> {
        work(state, move |s| s.list_document_definitions(&kind)).await
    }
    #[tauri::command]
    pub async fn save_document_definition(
        state: State<'_, SharedStore>,
        kind: String,
        definition: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        work(state, move |s| {
            s.save_document_definition(&kind, &definition)
        })
        .await
    }
    #[tauri::command]
    pub async fn authorize_document_operations(
        state: State<'_, SharedStore>,
        id: String,
        scopes: Vec<crate::document::Permission>,
    ) -> Result<String, String> {
        work(state, move |s| s.authorize_document_operations(&id, scopes)).await
    }
    #[tauri::command]
    pub async fn preview_document_operations(
        state: State<'_, SharedStore>,
        id: String,
        expected_revision: u64,
        revision_token: String,
        operations: Vec<crate::document::Operation>,
        grant_id: String,
    ) -> Result<crate::document::Preview, String> {
        work(state, move |s| {
            s.preview_document_operations(
                &id,
                expected_revision,
                &revision_token,
                &operations,
                &grant_id,
            )
        })
        .await
    }
    #[tauri::command]
    pub async fn apply_document_operations(
        state: State<'_, SharedStore>,
        semantic: State<'_, Arc<crate::semantic::SemanticService>>,
        id: String,
        expected_revision: u64,
        revision_token: String,
        operations: Vec<crate::document::Operation>,
        grant_id: String,
        render_token: String,
    ) -> Result<Note, String> {
        let result = work(state, move |s| {
            s.apply_document_operations(
                &id,
                expected_revision,
                &revision_token,
                &operations,
                &grant_id,
                Some(&render_token),
            )
        })
        .await;
        if result.is_ok() {
            semantic.invalidate_scope();
        }
        result
    }
    #[tauri::command]
    pub async fn save_note(
        state: State<'_, SharedStore>,
        semantic: State<'_, Arc<crate::semantic::SemanticService>>,
        note: Note,
        expected_revision: u64,
    ) -> Result<Note, String> {
        let result = work(state, move |s| s.save_note(note, expected_revision)).await;
        if result.is_ok() {
            semantic.invalidate_scope();
        }
        result
    }
    #[tauri::command]
    pub async fn search_notes(
        state: State<'_, SharedStore>,
        query: String,
    ) -> Result<Vec<NoteSummary>, String> {
        work(state, move |s| s.search_notes(&query)).await
    }
    #[tauri::command]
    pub async fn workspace_status(
        state: State<'_, SharedStore>,
    ) -> Result<WorkspaceStatus, String> {
        work(state, |s| Ok(s.status())).await
    }
    #[tauri::command]
    pub async fn rebuild_index(state: State<'_, SharedStore>) -> Result<WorkspaceStatus, String> {
        work(state, |s| {
            s.start_reconcile()?;
            Ok(s.status())
        })
        .await
    }

    #[tauri::command]
    pub async fn set_relation(
        state: State<'_, SharedStore>,
        semantic: State<'_, Arc<crate::semantic::SemanticService>>,
        a: String,
        b: String,
        connected: Option<bool>,
        dismissed: Option<bool>,
        expected_revision: Option<u64>,
        strength: Option<u8>,
    ) -> Result<crate::relations::PairMutation, String> {
        let result = work(state, move |s| {
            s.set_relation_strength(&a, &b, connected, dismissed, expected_revision, strength)
        })
        .await;
        if result
            .as_ref()
            .is_ok_and(|m| m.previous.connected != m.state.connected)
        {
            semantic.invalidate_scope();
        }
        result
    }
    #[tauri::command]
    pub async fn connection_edges(
        state: State<'_, SharedGraph>,
        note_ids: Vec<String>,
        source_id: Option<String>,
    ) -> Result<Vec<crate::relations::PairState>, String> {
        read_work(state, move |s| {
            s.connection_edges_for(note_ids, source_id.as_deref())
        })
        .await
    }
    #[tauri::command]
    pub async fn connection_search(
        state: State<'_, SharedGraph>,
        service: State<'_, Arc<crate::semantic::SemanticService>>,
        source_id: String,
        query: String,
        scope: String,
        cursor: Option<usize>,
        limit: Option<usize>,
        semantic: Option<bool>,
    ) -> Result<crate::relations::ConnectionSearchPage, String> {
        let connected_only = match scope.as_str() {
            "connected" => true,
            "workspace" => false,
            _ => return Err("Search scope must be connected or workspace".into()),
        };
        crate::store::valid_id(&source_id)?;
        if query.len() > 2048 {
            return Err("Search query is too long".into());
        }
        // Inference is queued on the semantic worker without acquiring Store.
        let (matches, pending, available, generation) =
            if semantic.unwrap_or(false) && !query.trim().is_empty() {
                let service = service.inner().clone();
                let id = source_id.clone();
                let q = query.clone();
                match tauri::async_runtime::spawn_blocking(move || {
                    service.search(id, q, connected_only)
                })
                .await
                .map_err(|e| e.to_string())?
                {
                    Ok(result) => (
                        result
                            .matches
                            .into_iter()
                            .map(|m| (m.note_id, m.score as f64))
                            .collect(),
                        result.pending,
                        result.available,
                        result.generation,
                    ),
                    Err(_) => (Vec::new(), false, false, 0),
                }
            } else {
                (Vec::new(), false, false, 0)
            };
        read_work(state, move |s| {
            let page = s.search_connections(
                &source_id,
                &query,
                connected_only,
                cursor.unwrap_or(0),
                limit.unwrap_or(40),
                matches,
            )?;
            Ok(crate::relations::ConnectionSearchPage {
                items: page.items,
                next_cursor: page.next_cursor,
                total: page.total,
                semantic_pending: pending,
                semantic_available: available,
                generation,
            })
        })
        .await
    }
    #[tauri::command]
    pub async fn list_connections(
        state: State<'_, SharedGraph>,
        note_id: String,
        cursor: Option<usize>,
        limit: Option<usize>,
    ) -> Result<crate::relations::Page<crate::relations::ConnectionEntry>, String> {
        read_work(state, move |s| {
            s.list_connections(&note_id, cursor.unwrap_or(0), limit.unwrap_or(40))
        })
        .await
    }
    #[tauri::command]
    pub async fn list_references(
        state: State<'_, SharedGraph>,
        note_id: String,
        cursor: Option<usize>,
        limit: Option<usize>,
    ) -> Result<crate::relations::Page<crate::relations::ReferenceEntry>, String> {
        read_work(state, move |s| {
            s.list_references(&note_id, cursor.unwrap_or(0), limit.unwrap_or(40))
        })
        .await
    }
    #[tauri::command]
    pub async fn picker_notes(
        state: State<'_, SharedStore>,
        source_id: String,
        query: String,
        cursor: Option<usize>,
        limit: Option<usize>,
    ) -> Result<crate::relations::Page<crate::relations::PickerEntry>, String> {
        work(state, move |s| {
            s.picker_notes(&source_id, &query, cursor.unwrap_or(0), limit.unwrap_or(40))
        })
        .await
    }
    #[tauri::command]
    pub async fn list_notes_page(
        state: State<'_, SharedStore>,
        query: String,
        folder_id: Option<String>,
        cursor: Option<usize>,
        limit: Option<usize>,
    ) -> Result<crate::relations::Page<NoteSummary>, String> {
        work(state, move |s| {
            s.list_notes_page(
                &query,
                folder_id.as_deref(),
                cursor.unwrap_or(0),
                limit.unwrap_or(80),
            )
        })
        .await
    }
    #[tauri::command]
    pub async fn related_notes(
        state: State<'_, SharedGraph>,
        semantic: State<'_, Arc<crate::semantic::SemanticService>>,
        note_id: String,
        cursor: Option<usize>,
        limit: Option<usize>,
    ) -> Result<crate::relations::Page<crate::relations::RelatedEntry>, String> {
        let service = semantic.inner().clone();
        let id = note_id.clone();
        let candidates = tauri::async_runtime::spawn_blocking(move || service.related(id))
            .await
            .map_err(|e| e.to_string())?
            .unwrap_or_default()
            .into_iter()
            .map(|m| (m.note_id, m.score as f64))
            .collect();
        read_work(state, move |s| {
            s.related_with_semantic(
                &note_id,
                candidates,
                cursor.unwrap_or(0),
                limit.unwrap_or(8),
            )
        })
        .await
    }
    #[tauri::command]
    pub async fn restore_dismissed(
        state: State<'_, SharedStore>,
        note_id: String,
    ) -> Result<usize, String> {
        let result = work(state, move |s| s.restore_dismissed(&note_id)).await;
        // Dismissals affect suggestion filtering, not the confirmed membership
        // used by typed search. Keep expensive scoped ANN caches reusable.
        result
    }

    #[tauri::command]
    pub async fn semantic_status(
        state: State<'_, Arc<crate::semantic::SemanticService>>,
    ) -> Result<crate::semantic::SemanticStatus, String> {
        Ok(state.status())
    }
    #[tauri::command]
    pub async fn semantic_settings(
        state: State<'_, Arc<crate::semantic::SemanticService>>,
        settings: crate::semantic::SemanticSettings,
    ) -> Result<crate::semantic::SemanticStatus, String> {
        state.settings(settings)
    }
    #[tauri::command]
    pub async fn semantic_activity(
        state: State<'_, Arc<crate::semantic::SemanticService>>,
        note_id: Option<String>,
        typing: bool,
    ) -> Result<(), String> {
        state.activity(note_id, typing)
    }
    #[tauri::command]
    pub async fn semantic_download_model(
        state: State<'_, Arc<crate::semantic::SemanticService>>,
    ) -> Result<crate::semantic::SemanticStatus, String> {
        let service = state.inner().clone();
        tauri::async_runtime::spawn_blocking(move || service.download())
            .await
            .map_err(|e| e.to_string())?
    }
    #[tauri::command]
    pub async fn semantic_install_pack(
        state: State<'_, Arc<crate::semantic::SemanticService>>,
        path: String,
    ) -> Result<crate::semantic::SemanticStatus, String> {
        let service = state.inner().clone();
        tauri::async_runtime::spawn_blocking(move || service.install_pack(path))
            .await
            .map_err(|e| e.to_string())?
    }
    #[tauri::command]
    pub async fn semantic_remove_data(
        state: State<'_, Arc<crate::semantic::SemanticService>>,
    ) -> Result<crate::semantic::SemanticStatus, String> {
        let service = state.inner().clone();
        tauri::async_runtime::spawn_blocking(move || service.remove_data())
            .await
            .map_err(|e| e.to_string())?
    }
    #[tauri::command]
    pub async fn semantic_related(
        state: State<'_, Arc<crate::semantic::SemanticService>>,
        note_id: String,
    ) -> Result<Vec<crate::semantic::SemanticMatch>, String> {
        let service = state.inner().clone();
        tauri::async_runtime::spawn_blocking(move || service.related(note_id))
            .await
            .map_err(|e| e.to_string())?
    }

    #[tauri::command]
    pub async fn export_relations(
        state: State<'_, SharedStore>,
    ) -> Result<serde_json::Value, String> {
        work(state, |s| s.export_relations()).await
    }

    #[tauri::command]
    pub async fn approve_document_render(
        state: State<'_, SharedStore>,
        grant_id: String,
        digest: String,
        report: serde_json::Value,
    ) -> Result<String, String> {
        work(state, move |s| {
            s.approve_document_render(&grant_id, &digest, &report)
        })
        .await
    }

    #[tauri::command]
    pub async fn backup_defaults(
        state: State<'_, SharedStore>,
    ) -> Result<serde_json::Value, String> {
        work(state,|s|{let parent=s.root.parent().ok_or("Workspace parent is missing")?;let folder=parent.join("Backups");std::fs::create_dir_all(&folder).map_err(|e|e.to_string())?;if folder.canonicalize().map_err(|e|e.to_string())?!=folder{return Err("Backup folder cannot be redirected".into());}let stamp=chrono::Utc::now().format("%Y%m%d-%H%M%S");let suffix=uuid::Uuid::new_v4().to_string();Ok(serde_json::json!({"backupPath":crate::backup::display_path(&folder.join(format!("Noted-{stamp}-{}.noted-backup",&suffix[..8]))),"restorePath":crate::backup::display_path(&parent.join(format!("Restored-Noted-{stamp}-{}",&suffix[..8])))}))}).await
    }
    #[tauri::command]
    pub async fn create_workspace_backup(
        state: State<'_, SharedStore>,
        path: String,
    ) -> Result<crate::backup::Summary, String> {
        work(state, move |s| s.create_backup(std::path::Path::new(&path))).await
    }
    #[tauri::command]
    pub async fn inspect_workspace_backup(path: String) -> Result<crate::backup::Summary, String> {
        tauri::async_runtime::spawn_blocking(move || {
            crate::backup::inspect_backup(std::path::Path::new(&path))
        })
        .await
        .map_err(|e| e.to_string())?
    }
    #[tauri::command]
    pub async fn restore_workspace_backup(
        state: State<'_, SharedStore>,
        path: String,
        target: String,
        digest: String,
    ) -> Result<crate::backup::Summary, String> {
        let active = work(state, |s| Ok(s.root.clone())).await?;
        tauri::async_runtime::spawn_blocking(move || {
            if std::path::Path::new(&target)
                .parent()
                .ok_or("Restore parent is missing")?
                .canonicalize()
                .map_err(|e| e.to_string())?
                .starts_with(active)
            {
                return Err("Restore outside the active workspace".into());
            }
            crate::backup::restore_backup(
                std::path::Path::new(&path),
                std::path::Path::new(&target),
                &digest,
            )
        })
        .await
        .map_err(|e| e.to_string())?
    }
    #[tauri::command]
    pub fn reveal_workspace_backup(path: String) -> Result<(), String> {
        let path = std::path::Path::new(&path);
        if path.extension().and_then(|s| s.to_str()) != Some("noted-backup") || !path.is_file() {
            return Err("Choose a saved Noted backup".into());
        }
        tauri_plugin_opener::reveal_item_in_dir(path).map_err(|e| e.to_string())
    }
    #[tauri::command]
    pub async fn open_restored_workspace(
        app: tauri::AppHandle,
        path: String,
    ) -> Result<(), String> {
        let profile = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("restored-profiles")
            .join(uuid::Uuid::new_v4().to_string());
        tauri::async_runtime::spawn_blocking(move || {
            let target = std::path::Path::new(&path)
                .canonicalize()
                .map_err(|e| e.to_string())?;
            if !target.join("notes").is_dir() || !target.join("relations.sqlite3").is_file() {
                return Err("Choose a complete restored workspace".into());
            }
            drop(Store::open_cached(&target)?);
            std::fs::create_dir_all(&profile).map_err(|e| e.to_string())?;
            std::process::Command::new(std::env::current_exe().map_err(|e| e.to_string())?)
                .env("NOTED_WORKSPACE", target)
                .env("WEBVIEW2_USER_DATA_FOLDER", profile)
                .env_remove("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS")
                .spawn()
                .map_err(|e| e.to_string())?;
            Ok(())
        })
        .await
        .map_err(|e| e.to_string())?
    }

    #[tauri::command]
    pub async fn update_folder(
        state: State<'_, SharedStore>,
        folder: Folder,
        expected: Folder,
    ) -> Result<Folder, String> {
        work(state, move |s| s.update_folder(folder, expected)).await
    }
    #[tauri::command]
    pub async fn list_trash(state: State<'_, SharedStore>) -> Result<Vec<NoteSummary>, String> {
        work(state, |s| s.list_trash()).await
    }
    #[tauri::command]
    pub async fn trash_note(
        state: State<'_, SharedStore>,
        semantic: State<'_, Arc<crate::semantic::SemanticService>>,
        id: String,
        revision: u64,
        token: String,
    ) -> Result<(), String> {
        let r = work(state, move |s| s.trash_note(&id, revision, &token)).await;
        if r.is_ok() {
            semantic.invalidate_scope();
        }
        r
    }
    #[tauri::command]
    pub async fn restore_note(
        state: State<'_, SharedStore>,
        semantic: State<'_, Arc<crate::semantic::SemanticService>>,
        id: String,
    ) -> Result<Note, String> {
        let r = work(state, move |s| s.restore_note(&id)).await;
        if r.is_ok() {
            semantic.invalidate_scope();
        }
        r
    }
    #[tauri::command]
    pub async fn recover_draft(
        state: State<'_, SharedStore>,
        semantic: State<'_, Arc<crate::semantic::SemanticService>>,
        draft: Note,
    ) -> Result<Note, String> {
        let r = work(state, move |s| s.recover_draft(draft)).await;
        if r.is_ok() {
            semantic.invalidate_scope();
        }
        r
    }
    #[tauri::command]
    pub async fn review_feed(
        state: State<'_, SharedStore>,
        folder_id: Option<String>,
        tag: String,
        include_hidden: bool,
    ) -> Result<Vec<crate::library::ReviewItem>, String> {
        work(state, move |s| {
            s.review_feed(folder_id, tag, include_hidden)
        })
        .await
    }
    #[tauri::command]
    pub async fn review_action(
        state: State<'_, SharedStore>,
        id: String,
        action: String,
    ) -> Result<(), String> {
        work(state, move |s| s.review_action(&id, &action)).await
    }

    #[tauri::command]
    pub async fn publish_private_import(
        state: State<'_, SharedStore>,
        semantic: State<'_, Arc<crate::semantic::SemanticService>>,
        path: String,
    ) -> Result<crate::private_import::Summary, String> {
        let result = work(state, move |s| {
            s.import_private_bundle(std::path::Path::new(&path))
        })
        .await;
        if result.is_ok() {
            semantic.invalidate_scope();
        }
        result
    }
    #[tauri::command]
    pub async fn note_ai_allowed(
        state: State<'_, SharedStore>,
        id: String,
    ) -> Result<bool, String> {
        work(state, move |s| {
            crate::ai_privacy::Gate::load(&s.root)?.allows_note(&id)
        })
        .await
    }
    #[tauri::command]
    pub async fn agent_access(
        state: State<'_, SharedStore>,
    ) -> Result<crate::agent::Access, String> {
        work(state, |s| s.agent_access()).await
    }
    #[tauri::command]
    pub async fn set_agent_access(
        state: State<'_, SharedStore>,
        access: crate::agent::Access,
    ) -> Result<crate::agent::Access, String> {
        work(state, move |s| s.set_agent_access(access)).await
    }
    #[tauri::command]
    pub async fn create_formatting_request(
        state: State<'_, SharedStore>,
        id: String,
        prompt: String,
        schema: Option<serde_json::Value>,
        include_guidance: Option<bool>,
    ) -> Result<crate::agent::Request, String> {
        let schema = crate::schema_ai::context(schema, include_guidance.unwrap_or(false))?;
        work(state, move |s| {
            if !s.agent_access()?.enabled {
                return Err("Enable the local agent bridge first".into());
            }
            s.create_request_with_schema(&id, prompt, schema)
        })
        .await
    }
    #[tauri::command]
    pub async fn formatting_reply(
        state: State<'_, SharedStore>,
        id: String,
    ) -> Result<Option<serde_json::Value>, String> {
        work(state, move |s| s.formatting_reply(&id)).await
    }
    #[tauri::command]
    pub async fn cancel_formatting_request(
        state: State<'_, SharedStore>,
        id: String,
    ) -> Result<(), String> {
        work(state, move |s| s.cancel_formatting_request(&id)).await
    }
    #[tauri::command]
    pub async fn hosted_agent_launch(
        state: State<'_, SharedStore>,
    ) -> Result<serde_json::Value, String> {
        work(state,|s|{let exe=std::env::current_exe().map_err(|e|e.to_string())?.with_file_name("noted-agent.exe");let program=crate::backup::display_path(&exe);let workspace=crate::backup::display_path(&s.root);let command_line=format!("\"{}\" --workspace \"{}\" --audience hosted",program,workspace);Ok(serde_json::json!({"program":program,"arguments":["--workspace",workspace,"--audience","hosted"],"commandLine":command_line,"liveConnectionVerified":false}))}).await
    }
    #[tauri::command]
    pub async fn agent_configuration(state: State<'_, SharedStore>) -> Result<String, String> {
        work(state, |s| {
            let exe = std::env::current_exe()
                .map_err(|e| e.to_string())?
                .with_file_name("noted-agent.exe");
            Ok(format!(
                "[mcp_servers.noted]\ncommand = {}\nargs = [\"--workspace\", {}]\n",
                serde_json::to_string(&crate::backup::display_path(&exe)).unwrap(),
                serde_json::to_string(&crate::backup::display_path(&s.root)).unwrap()
            ))
        })
        .await
    }

    #[tauri::command]
    pub async fn formatting_requests(
        state: State<'_, SharedStore>,
        note_id: String,
    ) -> Result<Vec<crate::agent::RequestInfo>, String> {
        work(state, move |s| s.formatting_requests(&note_id)).await
    }

    #[tauri::command]
    pub async fn preview_migration(
        service: State<'_, Arc<crate::migration::Service>>,
        source: String,
        profile: String,
    ) -> Result<crate::migration::Report, String> {
        let service = service.inner().clone();
        tauri::async_runtime::spawn_blocking(move || {
            service.preview(std::path::Path::new(&source), &profile)
        })
        .await
        .map_err(|e| e.to_string())?
    }
    #[tauri::command]
    pub async fn cancel_migration(
        service: State<'_, Arc<crate::migration::Service>>,
        id: String,
    ) -> Result<(), String> {
        let service = service.inner().clone();
        tauri::async_runtime::spawn_blocking(move || service.cancel(&id))
            .await
            .map_err(|e| e.to_string())?
    }
    #[tauri::command]
    pub async fn publish_migration(
        state: State<'_, SharedStore>,
        service: State<'_, Arc<crate::migration::Service>>,
        id: String,
        target: String,
        digest: String,
        accept_warnings: bool,
    ) -> Result<crate::migration::Report, String> {
        let root = work(state, |s| Ok(s.root.clone())).await?;
        let service = service.inner().clone();
        tauri::async_runtime::spawn_blocking(move || {
            service.publish(
                &id,
                std::path::Path::new(&target),
                &digest,
                accept_warnings,
                &root,
            )
        })
        .await
        .map_err(|e| e.to_string())?
    }
    #[tauri::command]
    pub async fn migration_reports(
        state: State<'_, SharedStore>,
    ) -> Result<Vec<crate::migration::Report>, String> {
        work(state, |s| s.migration_reports()).await
    }
    #[tauri::command]
    pub async fn export_migration_sources(
        state: State<'_, SharedStore>,
        batch: String,
        target: String,
    ) -> Result<usize, String> {
        work(state, move |s| {
            s.export_migration_sources(&batch, std::path::Path::new(&target))
        })
        .await
    }

    #[tauri::command]
    pub async fn agent_connection_status(
        state: State<'_, SharedStore>,
    ) -> Result<crate::agent_status::Status, String> {
        work(state, |s| Ok(crate::agent_status::status(&s.root))).await
    }

    #[tauri::command]
    pub async fn subscription_status() -> Result<crate::subscription::AccountStatus, String> {
        tauri::async_runtime::spawn_blocking(crate::subscription::account_status)
            .await
            .map_err(|e| e.to_string())
    }
    #[tauri::command]
    pub fn schema_guidance_capabilities() -> serde_json::Value {
        serde_json::json!({"formattingProtocol":crate::agent::FORMATTING_PROTOCOL,"perRequestGuidanceConsent":true,"componentSuggestions":true})
    }
    #[tauri::command]
    pub async fn start_subscription_formatting(
        state: State<'_, SharedStore>,
        service: State<'_, Arc<crate::subscription::Service>>,
        id: String,
        revision: u64,
        token: String,
        prompt: String,
        schema: Option<serde_json::Value>,
        include_guidance: Option<bool>,
        kind: Option<String>,
    ) -> Result<crate::subscription::JobInfo, String> {
        let schema = crate::schema_ai::context(schema, include_guidance.unwrap_or(false))?;
        let (note,request,root)=work(state.clone(),move|s|{let n=s.load_note(&id)?;if n.revision!=revision||n.revision_token!=token{return Err("The note changed before consent was submitted. Review and send the current saved note.".into());}crate::subscription::validate_snapshot(&n)?;let request=s.create_ai_request(&id,prompt,schema,kind)?;Ok((n,request,s.root.clone()))}).await?;
        let bridge = std::env::current_exe()
            .map_err(|e| e.to_string())?
            .with_file_name("noted-agent.exe");
        let cached = work(state, {
            let id = request.id.clone();
            move |s| s.formatting_reply(&id)
        })
        .await?;
        if cached.is_some() {
            return Ok(crate::subscription::JobInfo {
                id: request.id.clone(),
                note_id: note.id,
                request_id: request.id,
                phase: "completed".into(),
                message: "Existing proposal is ready to review. No new model job was started."
                    .into(),
            });
        }
        let bridge = tauri::async_runtime::spawn_blocking(move || {
            crate::subscription::prepare_bridge(&bridge)
        })
        .await
        .map_err(|e| e.to_string())??;
        let exe = tauri::async_runtime::spawn_blocking(crate::subscription::prepare_cli)
            .await
            .map_err(|e| e.to_string())??;
        service.start(note, request, root, exe, bridge)
    }
    #[tauri::command]
    pub fn subscription_job(
        service: State<'_, Arc<crate::subscription::Service>>,
        id: String,
    ) -> Result<crate::subscription::JobInfo, String> {
        service.status(&id)
    }
    #[tauri::command]
    pub fn cancel_subscription_job(
        service: State<'_, Arc<crate::subscription::Service>>,
        id: Option<String>,
    ) -> Result<(), String> {
        service.cancel(id.as_deref())
    }

    pub fn run() {
        tauri::Builder::default()
            .plugin(tauri_plugin_opener::init())
            .setup(|app| {
                let root = match std::env::var_os("NOTED_WORKSPACE") {
                    Some(path) => std::path::PathBuf::from(path),
                    None => app.path().app_data_dir()?.join("workspace"),
                };
                if std::env::var_os("NOTED_WORKSPACE").is_some() {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.set_title(&format!(
                            "Noted — {}",
                            root.file_name().unwrap_or_default().to_string_lossy()
                        ));
                    }
                }
                let store = Store::open_cached(root.clone()).map_err(std::io::Error::other)?;
                let graph = Arc::new(Mutex::new(
                    store.read_view().map_err(std::io::Error::other)?,
                ));
                let store = Arc::new(Mutex::new(store));
                {
                    let mut guard = store
                        .lock()
                        .map_err(|_| std::io::Error::other("Workspace lock failed"))?;
                    guard.start_reconcile().map_err(std::io::Error::other)?;
                }
                let background = store.clone();
                std::thread::spawn(move || loop {
                    std::thread::sleep(std::time::Duration::from_millis(50));
                    if let Ok(mut s) = background.lock() {
                        let _ = s.reconcile_batch(4);
                    }
                });
                app.manage(Arc::new(crate::migration::Service::default()));
                app.manage(Arc::new(crate::subscription::Service::default()));
                app.manage(store);
                app.manage(graph);
                #[cfg(feature = "semantic")]
                app.manage(Arc::new(
                    crate::semantic::SemanticService::start(root).map_err(std::io::Error::other)?,
                ));
                Ok(())
            })
            .invoke_handler(tauri::generate_handler![
                update_folder,
                list_trash,
                trash_note,
                restore_note,
                recover_draft,
                review_feed,
                review_action,
                formatting_requests,
                preview_migration,
                cancel_migration,
                publish_migration,
                migration_reports,
                export_migration_sources,
                subscription_status,
                start_subscription_formatting,
                schema_guidance_capabilities,
                subscription_job,
                cancel_subscription_job,
                agent_connection_status,
                publish_private_import,
                note_ai_allowed,
                agent_access,
                set_agent_access,
                create_formatting_request,
                formatting_reply,
                cancel_formatting_request,
                agent_configuration,
                hosted_agent_launch,
                backup_defaults,
                create_workspace_backup,
                inspect_workspace_backup,
                restore_workspace_backup,
                reveal_workspace_backup,
                open_restored_workspace,
                list_notes,
                list_folders,
                create_folder,
                create_note,
                load_note,
                previous_note,
                import_image,
                read_image,
                copy_image,
                list_document_definitions,
                save_document_definition,
                authorize_document_operations,
                preview_document_operations,
                apply_document_operations,
                approve_document_render,
                save_note,
                search_notes,
                workspace_status,
                semantic_status,
                semantic_settings,
                semantic_activity,
                semantic_download_model,
                semantic_install_pack,
                semantic_remove_data,
                semantic_related,
                rebuild_index,
                set_relation,
                list_connections,
                connection_edges,
                connection_search,
                list_references,
                picker_notes,
                list_notes_page,
                related_notes,
                export_relations,
                restore_dismissed
            ])
            .run(tauri::generate_context!())
            .expect("Noted could not start its local workspace");
    }
}

#[cfg(feature = "desktop")]
pub use desktop::run;
