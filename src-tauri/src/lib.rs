use tauri_plugin_shell::ShellExt;
use tauri_plugin_store::StoreExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/**
 * AI 服务提供商配置
 */
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProviderConfig {
    api_key: String,
    base_url: String,
    model: String,
}

/**
 * 全局设置结构体（与前端共享的 Settings 接口一致）
 */
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    #[serde(rename = "_version")]
    version: String,
    active_provider: String,
    provider_configs: HashMap<String, ProviderConfig>,
    auto_analyze: bool,
    deep_mode: bool,
}

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
    /**
     * 运行 Sidecar 分析任务
     */
    async fn run_analysis(
        app_handle: &tauri::AppHandle,
        symbol: String,
        config: AppSettings,
    ) -> Result<String, String> {
        let config_json = serde_json::to_string(&config)
            .map_err(|e| format!("配置序列化失败: {}", e))?;

        let sidecar_command = app_handle
            .shell()
            .sidecar("stockai-backend")
            .map_err(|e| format!("无法找到 Sidecar: {}", e))?
            .args(&[symbol, config_json]);

        // 运行并捕获输出
        let (mut rx, _child) = sidecar_command
            .spawn()
            .map_err(|e| format!("Sidecar 启动失败: {}", e))?;

        let mut last_line = String::new();
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
                    eprintln!("Sidecar Stderr: {}", String::from_utf8_lossy(&line));
                }
                tauri_plugin_shell::process::CommandEvent::Terminated(status) => {
                    println!("Sidecar 已终止，状态码: {:?}", status.code);
                }
                _ => {}
            }
        }
        if last_line.is_empty() {
            Ok(r#"{"error":"分析服务无响应，请检查 AI 模型配置后重试。"}"#.to_string())
        } else {
            Ok(last_line)
        }
    }

    /**
     * 运行 Sidecar 列表任务
     */
    async fn list_models(
        app_handle: &tauri::AppHandle,
        config: ModelListConfig,
    ) -> Result<String, String> {
        let config_json = serde_json::to_string(&config)
            .map_err(|e| format!("列表配置序列化失败: {}", e))?;

        let sidecar_command = app_handle
            .shell()
            .sidecar("stockai-backend")
            .map_err(|e| format!("无法找到 Sidecar: {}", e))?
            .args(&["--list-models".to_string(), config_json]);

        let (mut rx, _child) = sidecar_command
            .spawn()
            .map_err(|e| format!("Sidecar 启动失败: {}", e))?;

        let mut last_line = String::new();
        while let Some(event) = rx.recv().await {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                    let s = String::from_utf8_lossy(&line);
                    let trimmed = s.trim();
                    if !trimmed.is_empty() {
                        last_line = trimmed.to_string();
                    }
                }
                _ => {}
            }
        }
        Ok(last_line)
    }
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

    // 在 Rust 层解析配置，确保其符合架构定义的 Schema
    let settings: AppSettings = serde_json::from_value(settings_val)
        .map_err(|e| format!("应用配置格式不正确: {}。请在设置界面重新保存。", e))?;

    SidecarManager::run_analysis(&app_handle, symbol, settings).await
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_greet() {
        assert_eq!(greet("Tauri"), "Hello, Tauri! You've been greeted from Rust!");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, start_analysis, list_models])
        .run(tauri::generate_context!())
        .expect("运行 tauri 应用程序时出错");
}
