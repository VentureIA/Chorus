//! Path normalization utilities that avoid filesystem access.
//!
//! On macOS, `std::fs::canonicalize()` calls `realpath()` which triggers
//! TCC (Transparency, Consent, and Control) permission dialogs when the
//! path is inside a protected folder (Desktop, Documents, Downloads, etc.).
//!
//! These functions normalize paths purely in-memory without touching the
//! filesystem, avoiding TCC prompts entirely.

use std::path::{Component, Path, PathBuf};

/// Normalizes a path string without touching the filesystem.
///
/// - Resolves `.` and `..` components
/// - Strips trailing slashes
/// - Converts relative paths to absolute using the current directory
/// - Does NOT follow symlinks or call `stat()`/`realpath()`
pub fn normalize_path(path: &str) -> String {
    normalize_path_buf(Path::new(path))
        .to_string_lossy()
        .into_owned()
}

/// Normalizes a `Path` without touching the filesystem.
///
/// Same as [`normalize_path`] but accepts and returns `PathBuf`.
pub fn normalize_path_buf(path: &Path) -> PathBuf {
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("/"))
            .join(path)
    };

    let mut components: Vec<Component> = Vec::new();
    for component in absolute.components() {
        match component {
            Component::ParentDir => {
                // Pop last component unless we're at the root
                if let Some(last) = components.last() {
                    if !matches!(last, Component::RootDir | Component::Prefix(_)) {
                        components.pop();
                    }
                }
            }
            Component::CurDir => {} // skip "."
            other => components.push(other),
        }
    }

    if components.is_empty() {
        PathBuf::from("/")
    } else {
        components.iter().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn absolute_path_unchanged() {
        assert_eq!(normalize_path("/Users/foo/project"), "/Users/foo/project");
    }

    #[test]
    fn resolves_dot_dot() {
        assert_eq!(
            normalize_path("/Users/foo/bar/../project"),
            "/Users/foo/project"
        );
    }

    #[test]
    fn resolves_dot() {
        assert_eq!(
            normalize_path("/Users/foo/./project"),
            "/Users/foo/project"
        );
    }

    #[test]
    fn parent_at_root_stays_at_root() {
        assert_eq!(normalize_path("/../../foo"), "/foo");
    }

    #[test]
    fn normalize_path_buf_works() {
        let result = normalize_path_buf(Path::new("/a/b/../c"));
        assert_eq!(result, PathBuf::from("/a/c"));
    }
}
