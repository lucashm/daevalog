//! overlay.json: the Linux overlay's settings file (overlay/Settings.qml), as
//! one JSON object both webviews read and write. Defaults live with the UI
//! (windows/ui/src/settings.ts); here it is only stored, bounded and read
//! for what Rust itself needs (the shortcuts, hiding the widgets).
use serde_json::{Map, Value};
use std::path::Path;

/// Generous for positions, layouts and names; small enough to copy on each change.
const MAX_BYTES: usize = 256 * 1024;

pub const DEFAULT_EDIT_KEY: &str = "CTRL + grave";
pub const DEFAULT_HIDE_KEY: &str = "ALT + grave";

pub fn validate(value: &Value) -> Result<(), String> {
    if !value.is_object() {
        return Err("Settings must be an object".into());
    }
    if serde_json::to_vec(value).map_or(usize::MAX, |b| b.len()) > MAX_BYTES {
        return Err("Settings are too large".into());
    }
    Ok(())
}

/// The file, or an empty object (all defaults) when it's missing or unreadable.
pub fn load(path: &Path) -> Value {
    std::fs::read(path)
        .ok()
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
        .filter(|v| validate(v).is_ok())
        .unwrap_or_else(|| Value::Object(Map::new()))
}

pub fn save(path: &Path, value: &Value) -> Result<(), String> {
    validate(value)?;
    let bytes = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    write_atomic(path, &bytes).map_err(|e| format!("Cannot save overlay settings: {e}"))
}

/// Written beside, then moved over: a crash mid-write leaves the old file.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, bytes)?;
    std::fs::rename(&temp, path)
}

/// A shortcut combo ("CTRL + grave"), the default when unset; "" means none.
pub fn shortcut(settings: &Value, key: &str, default: &str) -> String {
    match settings.get(key) {
        Some(Value::String(s)) => s.clone(),
        _ => default.to_string(),
    }
}

pub fn hide_widgets(settings: &Value) -> bool {
    settings.get("hideWidgets").and_then(Value::as_bool) == Some(true)
}

pub fn set_hide_widgets(settings: &mut Value, hide: bool) {
    if let Value::Object(map) = settings {
        map.insert("hideWidgets".into(), Value::Bool(hide));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn only_bounded_objects_are_stored() {
        assert!(validate(&json!({"scale":1.2})).is_ok());
        assert!(validate(&json!([1, 2])).is_err());
        assert!(validate(&json!({"x": "a".repeat(MAX_BYTES)})).is_err());
    }

    #[test]
    fn a_missing_or_broken_file_is_all_defaults() {
        let dir = std::env::temp_dir().join(format!("daevalog-settings-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("overlay.json");
        assert_eq!(load(&path), json!({}));
        std::fs::write(&path, "{not json").unwrap();
        assert_eq!(load(&path), json!({}));
        save(&path, &json!({"hideWidgets": true})).unwrap();
        assert!(hide_widgets(&load(&path)));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn shortcuts_default_until_set_and_can_be_cleared() {
        assert_eq!(
            shortcut(&json!({}), "shortcutEdit", DEFAULT_EDIT_KEY),
            "CTRL + grave"
        );
        assert_eq!(
            shortcut(
                &json!({"shortcutEdit": "ALT + Z"}),
                "shortcutEdit",
                DEFAULT_EDIT_KEY
            ),
            "ALT + Z"
        );
        assert_eq!(
            shortcut(
                &json!({"shortcutEdit": ""}),
                "shortcutEdit",
                DEFAULT_EDIT_KEY
            ),
            ""
        );
    }
}
