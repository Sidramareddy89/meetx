use serde::Serialize;
use tauri::Manager;

#[derive(Serialize)]
#[serde(rename_all = "kebab-case")]
enum ProtectionStatus {
    Protected,
    NotRequested,
    Unsupported,
    NotAvailable,
    Unknown,
}

#[derive(Serialize)]
struct ProtectionResult {
    status: ProtectionStatus,
    detail: String,
}

#[tauri::command]
fn set_assistant_content_protection(
    app: tauri::AppHandle,
    enabled: bool,
) -> Result<ProtectionResult, String> {
    let Some(window) = app.get_webview_window("assistant") else {
        return Ok(ProtectionResult {
            status: ProtectionStatus::NotAvailable,
            detail: "The native assistant window is unavailable, so no window protection state can be applied.".into(),
        });
    };

    if !enabled {
        return match window.set_content_protected(false) {
            Ok(()) => Ok(ProtectionResult {
                status: ProtectionStatus::NotRequested,
                detail: "Private Mode is off; normal assistant window behavior is active.".into(),
            }),
            Err(error) => Ok(ProtectionResult {
                status: ProtectionStatus::Unknown,
                detail: format!("The OS protection request could not be cleared: {error}"),
            }),
        };
    }

    #[cfg(target_os = "windows")]
    {
        if let Err(error) = window.set_content_protected(true) {
            return Ok(ProtectionResult {
                status: ProtectionStatus::Unsupported,
                detail: format!("Windows did not accept the content-protection request: {error}"),
            });
        }
        let hwnd = window.hwnd().map_err(|error| error.to_string())?;
        let mut affinity = 0u32;
        let read_result = unsafe {
            windows::Win32::UI::WindowsAndMessaging::GetWindowDisplayAffinity(hwnd, &mut affinity)
        };
        if read_result.is_ok()
            && affinity == windows::Win32::UI::WindowsAndMessaging::WDA_EXCLUDEFROMCAPTURE.0
        {
            return Ok(ProtectionResult {
                status: ProtectionStatus::Protected,
            detail: "Windows reports WDA_EXCLUDEFROMCAPTURE for the assistant window. Microsoft documents this for a specific set of public OS capture APIs when DWM composes the desktop; it is not a security boundary or recording-proof guarantee.".into(),
            });
        }
        return Ok(ProtectionResult {
            status: if read_result.is_err() {
                ProtectionStatus::Unknown
            } else {
                ProtectionStatus::Unsupported
            },
            detail: if read_result.is_err() {
                "Windows accepted the request, but MEETX could not verify the window display-affinity state; protection is unknown.".into()
            } else {
                "Windows did not report WDA_EXCLUDEFROMCAPTURE as active for this window.".into()
            },
        });
    }

    #[cfg(target_os = "macos")]
    {
        let _ = window;
        Ok(ProtectionResult {
            status: ProtectionStatus::NotAvailable,
            detail: "Tauri's window-content-protection request is not available as a reliable macOS capture-exclusion guarantee. ScreenCaptureKit capture apps can define their own content filters; MEETX cannot control filters used by other apps.".into(),
    })
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = window;
        Ok(ProtectionResult {
            status: ProtectionStatus::NotAvailable,
            detail: "OS content protection is unavailable on this platform.".into(),
        })
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![set_assistant_content_protection])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
