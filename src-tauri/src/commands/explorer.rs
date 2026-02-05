//! IPC commands for file explorer (directory listing).

use serde::Serialize;
use std::path::Path;

/// A single file or directory entry.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub is_symlink: bool,
    pub extension: Option<String>,
}

/// List the contents of a directory (one level, non-recursive).
///
/// Returns entries sorted directories-first, then alphabetically.
/// Hidden files (starting with `.`) are excluded.
#[tauri::command]
pub async fn read_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let canonical = crate::core::path_utils::normalize_path_buf(Path::new(&path));

    if !canonical.is_dir() {
        return Err(format!("Not a directory: {}", canonical.display()));
    }

    let mut entries = Vec::new();
    let mut read_dir = tokio::fs::read_dir(&canonical)
        .await
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    while let Some(entry) = read_dir
        .next_entry()
        .await
        .map_err(|e| format!("Failed to read entry: {}", e))?
    {
        let file_name = entry.file_name().to_string_lossy().into_owned();

        // Skip hidden files
        if file_name.starts_with('.') {
            continue;
        }

        let file_type = entry
            .file_type()
            .await
            .map_err(|e| format!("Failed to get file type: {}", e))?;

        let entry_path = entry.path();

        let extension = if file_type.is_file() {
            entry_path
                .extension()
                .map(|e| e.to_string_lossy().into_owned())
        } else {
            None
        };

        entries.push(FileEntry {
            name: file_name,
            path: entry_path.to_string_lossy().into_owned(),
            is_directory: file_type.is_dir(),
            is_symlink: file_type.is_symlink(),
            extension,
        });
    }

    // Sort: directories first, then alphabetical (case-insensitive)
    entries.sort_by(|a, b| match (a.is_directory, b.is_directory) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

/// Read the text content of a file.
#[tauri::command]
pub async fn read_file_content(path: String) -> Result<String, String> {
    let canonical = crate::core::path_utils::normalize_path_buf(Path::new(&path));

    tokio::fs::read_to_string(&canonical)
        .await
        .map_err(|e| format!("Failed to read file: {}", e))
}

/// Write text content to a file.
#[tauri::command]
pub async fn write_file_content(path: String, content: String) -> Result<(), String> {
    let canonical = crate::core::path_utils::normalize_path_buf(Path::new(&path));

    tokio::fs::write(&canonical, content)
        .await
        .map_err(|e| format!("Failed to write file: {}", e))
}
