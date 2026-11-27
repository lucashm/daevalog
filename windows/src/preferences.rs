//! Windows-only capture settings (companion.json): the adapter and whether
//! capture starts with the app. The overlay's own settings are overlay.json,
//! as on Linux (see `settings`).
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Unknown fields are ignored: files from older versions held the overlay layout too.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Preferences {
    /// The Npcap adapter to capture on; empty for the one with the default route.
    pub iface: String,
    pub auto_start: bool,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            iface: String::new(),
            auto_start: true,
        }
    }
}

impl Preferences {
    pub fn validate(&self) -> Result<(), String> {
        if self.iface.len() > 1024 {
            return Err("Invalid capture settings".into());
        }
        Ok(())
    }

    pub fn load(path: &Path) -> Result<Self, String> {
        match std::fs::read(path) {
            Ok(bytes) => {
                let prefs: Self = serde_json::from_slice(&bytes)
                    .map_err(|e| format!("Cannot read capture settings: {e}"))?;
                prefs.validate()?;
                Ok(prefs)
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        self.validate()?;
        let bytes = serde_json::to_vec_pretty(self).map_err(|e| e.to_string())?;
        crate::settings::write_atomic(path, &bytes)
            .map_err(|e| format!("Cannot save capture settings: {e}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_file_from_the_previous_companion_still_loads() {
        let dir = std::env::temp_dir().join(format!("daevalog-prefs-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("companion.json");
        std::fs::write(
            &path,
            r#"{"iface":"\\Device\\NPF_{X}","autoStart":false,"overlayVisible":true,"widgets":[{"id":"meter"}]}"#,
        )
        .unwrap();
        let prefs = Preferences::load(&path).unwrap();
        assert_eq!(prefs.iface, r"\Device\NPF_{X}");
        assert!(!prefs.auto_start);
        let _ = std::fs::remove_dir_all(dir);
    }
}
