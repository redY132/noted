mod assets;
pub mod relations;
#[cfg(feature = "semantic")]
pub mod semantic;
pub mod store;

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

    pub fn run() {
        tauri::Builder::default()
            .plugin(tauri_plugin_opener::init())
            .setup(|app| {
                let root = match std::env::var_os("NOTED_WORKSPACE") {
                    Some(path) => std::path::PathBuf::from(path),
                    None => app.path().app_data_dir()?.join("workspace"),
                };
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
                app.manage(store);
                app.manage(graph);
                #[cfg(feature = "semantic")]
                app.manage(Arc::new(
                    crate::semantic::SemanticService::start(root).map_err(std::io::Error::other)?,
                ));
                Ok(())
            })
            .invoke_handler(tauri::generate_handler![
                list_notes,
                list_folders,
                create_folder,
                create_note,
                load_note,
                import_image,
                read_image,
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
