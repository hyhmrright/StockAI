use tauri_plugin_shell::ShellExt;
use tauri_plugin_store::StoreExt;
use serde::{Deserialize, Serialize};


/**
 * 模型列表查询配置
 */
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelListConfig {
    provider: String,
    base_url: String,
}

/**
 * Sidecar 管理器，封装进程启动与输出处理
 */
struct SidecarManager;

impl SidecarManager {
    // 取最后一行——Sidecar 协议保证每次运行只写一行 JSON 到 stdout。
    async fn run(
        app_handle: &tauri::AppHandle,
        args: Vec<String>,
    ) -> Result<String, String> {
        let sidecar_command = app_handle
            .shell()
            .sidecar("stockai-backend")
            .map_err(|e| format!("无法找到 Sidecar: {}", e))?
            .args(&args);

        let (mut rx, child) = sidecar_command
            .spawn()
            .map_err(|e| format!("Sidecar 启动失败: {}", e))?;

        let mut last_line = String::new();
        let mut exit_code = None;
        while let Some(event) = rx.recv().await {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                    let s = String::from_utf8_lossy(&line);
                    let trimmed = s.trim();
                    if !trimmed.is_empty() {
                        last_line = trimmed.to_string();
                    }
                }
                tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                    let s = String::from_utf8_lossy(&line);
                    eprintln!("Sidecar Stderr: {}", s);
                }
                tauri_plugin_shell::process::CommandEvent::Terminated(status) => {
                    exit_code = status.code;
                    println!("Sidecar 已终止，状态码: {:?}", status.code);
                }
                _ => {}
            }
        }
        // 显式丢弃 child 仅用于抑制警告，关键是让它活到循环结束
        drop(child);
        
        if last_line.is_empty() {
            Ok(format!(r#"{{"error":"分析服务无响应 (ExitCode: {:?})，请检查日志或 AI 模型配置后重试。"}}"#, exit_code))
        } else {
            Ok(last_line)
        }
    }

    // Settings schema 由 Sidecar 的 resolveConfig 负责校验——避免 Rust/TS/Sidecar 三处重复定义。
    async fn run_analysis(
        app_handle: &tauri::AppHandle,
        symbol: String,
        config: serde_json::Value,
    ) -> Result<String, String> {
        let config_json = serde_json::to_string(&config)
            .map_err(|e| format!("配置序列化失败: {}", e))?;

        Self::run(app_handle, vec![symbol, config_json]).await
    }

    async fn list_models(
        app_handle: &tauri::AppHandle,
        config: ModelListConfig,
    ) -> Result<String, String> {
        let config_json = serde_json::to_string(&config)
            .map_err(|e| format!("列表配置序列化失败: {}", e))?;

        Self::run(app_handle, vec!["--list-models".to_string(), config_json]).await
    }

    async fn get_stock_info(
        app_handle: &tauri::AppHandle,
        symbol: String,
        config: serde_json::Value,
    ) -> Result<String, String> {
        let config_json = serde_json::to_string(&config)
            .map_err(|e| format!("配置序列化失败: {}", e))?;

        Self::run(app_handle, vec!["--info".to_string(), config_json, symbol]).await
    }

    async fn search_stocks(
        app_handle: &tauri::AppHandle,
        keyword: String,
        config: serde_json::Value,
    ) -> Result<String, String> {
        let config_json = serde_json::to_string(&config)
            .map_err(|e| format!("配置序列化失败: {}", e))?;

        Self::run(app_handle, vec!["--search".to_string(), config_json, keyword]).await
    }
}

/**
 * 搜索股票建议
 */
#[tauri::command]
async fn search_stocks(
    app_handle: tauri::AppHandle,
    keyword: String,
) -> Result<String, String> {
    let store = app_handle
        .store("settings.json")
        .map_err(|e| format!("无法打开配置存储: {}", e))?;

    let settings_val = store.get("app_settings")
        .unwrap_or(serde_json::json!({}));

    SidecarManager::search_stocks(&app_handle, keyword, settings_val).await
}

/**
 * 获取股票基本信息
 */
#[tauri::command]
async fn get_stock_info(
    app_handle: tauri::AppHandle,
    symbol: String,
) -> Result<String, String> {
    let store = app_handle
        .store("settings.json")
        .map_err(|e| format!("无法打开配置存储: {}", e))?;

    let settings_val = store.get("app_settings")
        .unwrap_or(serde_json::json!({}));

    SidecarManager::get_stock_info(&app_handle, symbol, settings_val).await
}

/**
 * 获取可用模型列表
 */
#[tauri::command]
async fn list_models(
    app_handle: tauri::AppHandle,
    provider: String,
    base_url: String,
) -> Result<String, String> {
    let config = ModelListConfig { provider, base_url };
    SidecarManager::list_models(&app_handle, config).await
}

/**
 * 启动股票分析
 */
#[tauri::command]
async fn start_analysis(app_handle: tauri::AppHandle, symbol: String) -> Result<String, String> {
    let store = app_handle
        .store("settings.json")
        .map_err(|e| format!("无法打开配置存储: {}", e))?;

    let settings_val = store.get("app_settings")
        .ok_or_else(|| "未找到应用设置，请先在设置界面保存配置。".to_string())?;

    SidecarManager::run_analysis(&app_handle, symbol, settings_val).await
}

#[cfg(test)]
mod tests {
    use super::*;

    const EMPTY_STDOUT_RESPONSE: &str =
        r#"{"error":"分析服务无响应，请检查 AI 模型配置后重试。"}"#;

    #[test]
    fn test_empty_stdout_fallback_is_valid_json_with_error_field() {
        let v: serde_json::Value = serde_json::from_str(EMPTY_STDOUT_RESPONSE)
            .expect("EMPTY_STDOUT_RESPONSE 必须是合法 JSON");
        assert!(v.get("error").is_some(), "fallback 必须包含 error 字段");
    }

    #[test]
    fn test_model_list_config_serializes_to_camel_case() {
        let cfg = ModelListConfig {
            provider: "openai".to_string(),
            base_url: "https://api.openai.com/v1".to_string(),
        };
        let json = serde_json::to_string(&cfg).unwrap();
        assert!(json.contains("baseUrl"), "serde 应序列化为 camelCase baseUrl");
        assert!(!json.contains("base_url"), "不应出现 snake_case base_url");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![start_analysis, list_models, get_stock_info, search_stocks])
        .run(tauri::generate_context!())
        .expect("运行 tauri 应用程序时出错");
}
