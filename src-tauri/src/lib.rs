mod assets;
pub mod store;

#[cfg(feature = "desktop")]
mod desktop {
    use crate::store::{Folder, Note, NoteSummary, Store, WorkspaceStatus};
    use std::sync::{Arc, Mutex};
    use tauri::{Manager, State};

    type SharedStore = Arc<Mutex<Store>>;

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
        title: String,
        folder_id: Option<String>,
    ) -> Result<Note, String> {
        work(state, move |s| s.create_note(title, folder_id)).await
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
        note: Note,
        expected_revision: u64,
    ) -> Result<Note, String> {
        work(state, move |s| s.save_note(note, expected_revision)).await
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
            s.rebuild_index()?;
            Ok(s.status())
        })
        .await
    }

    pub fn run() {
        tauri::Builder::default()
            .setup(|app| {
                let root = match std::env::var_os("NOTED_WORKSPACE") {
                    Some(path) => std::path::PathBuf::from(path),
                    None => app.path().app_data_dir()?.join("workspace"),
                };
                let store = Store::open(root).map_err(std::io::Error::other)?;
                app.manage(Arc::new(Mutex::new(store)));
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
                rebuild_index
            ])
            .run(tauri::generate_context!())
            .expect("Noted could not start its local workspace");
    }
}

#[cfg(feature = "desktop")]
pub use desktop::run;
