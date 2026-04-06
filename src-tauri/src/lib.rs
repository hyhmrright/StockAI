use tauri_plugin_shell::ShellExt;
use tauri_plugin_store::StoreExt;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/**
 * 股票分析配置结构体
 */
#[derive(Debug, PartialEq)]
struct AppConfig {
    provider: String,
    api_key: String,
    base_url: String,
    model_name: String,
}

/**
 * 解析并生成最终配置逻辑 (可测试的纯函数)
 */
fn resolve_config(
    provider: Option<&str>,
    api_key: Option<&str>,
    base_url: Option<&str>,
    ai_model: Option<&str>,
) -> AppConfig {
    let p = provider.unwrap_or("openai");
    // 统一使用 ai_model 字段，如果缺失则根据 provider 提供默认值
    let default_model = if p == "ollama" { "llama3" } else { "gpt-4o" };
    let m = ai_model.unwrap_or(default_model);

    AppConfig {
        provider: p.to_string(),
        api_key: api_key.unwrap_or("").to_string(),
        base_url: base_url.unwrap_or("").to_string(),
        model_name: m.to_string(),
    }
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
        config: AppConfig,
    ) -> Result<String, String> {
        // 获取 sidecar 命令并注入配置参数
        // 参数顺序: [symbol, provider, apiKey, baseUrl, modelName]
        let sidecar_command = app_handle
            .shell()
            .sidecar("stockai-backend")
            .map_err(|e| format!("无法找到 Sidecar: {}", e))?
            .args(&[
                symbol,
                config.provider,
                config.api_key,
                config.base_url,
                config.model_name,
            ]);

        // 运行并捕获输出
        let (mut rx, _child) = sidecar_command
            .spawn()
            .map_err(|e| format!("Sidecar 启动失败: {}", e))?;

        let mut output = String::new();
        while let Some(event) = rx.recv().await {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                    output.push_str(&String::from_utf8_lossy(&line));
                }
                tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                    eprintln!("Sidecar Stderr: {}", String::from_utf8_lossy(&line));
                }
                tauri_plugin_shell::process::CommandEvent::Terminated(status) => {
                    println!("Sidecar 已终止，状态码: {:?}", status.code);
                    break;
                }
                _ => {}
            }
        }
        Ok(output)
    }
}

/**
 * 启动股票分析 (调用 Sidecar 抓取新闻并进行 AI 分析)
 * @param app_handle Tauri App Handle
 * @param symbol 股票代码
 */
#[tauri::command]
async fn start_analysis(app_handle: tauri::AppHandle, symbol: String) -> Result<String, String> {
    // 从 settings.json 读取配置
    let store = app_handle
        .store("settings.json")
        .map_err(|e| format!("无法打开配置存储: {}", e))?;

    // 注意：前端将设置存储在 "app_settings" 键下
    let settings_val = store.get("app_settings");
    let settings = settings_val.as_ref().and_then(|v| v.as_object());

    let config = match settings {
        Some(s) => resolve_config(
            s.get("model").and_then(|v| v.as_str()), // 前端用 model 表示 provider
            s.get("apiKey").and_then(|v| v.as_str()),
            s.get("baseUrl").and_then(|v| v.as_str()),
            s.get("aiModel").and_then(|v| v.as_str()), // 统一后的模型名称字段
        ),
        None => resolve_config(None, None, None, None),
    };

    SidecarManager::run_analysis(&app_handle, symbol, config).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, start_analysis])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_config_defaults() {
        let config = resolve_config(None, None, None, None);
        assert_eq!(config.provider, "openai");
        assert_eq!(config.model_name, "gpt-4o");
        assert_eq!(config.api_key, "");
    }

    #[test]
    fn test_resolve_config_openai_custom() {
        let config = resolve_config(
            Some("openai"),
            Some("sk-test"),
            Some("https://api.proxy.com"),
            Some("gpt-3.5-turbo"),
        );
        assert_eq!(config.provider, "openai");
        assert_eq!(config.api_key, "sk-test");
        assert_eq!(config.base_url, "https://api.proxy.com");
        assert_eq!(config.model_name, "gpt-3.5-turbo");
    }

    #[test]
    fn test_resolve_config_ollama() {
        let config = resolve_config(
            Some("ollama"),
            None,
            Some("http://127.0.0.1:11434"),
            Some("llama2"),
        );
        assert_eq!(config.provider, "ollama");
        assert_eq!(config.model_name, "llama2");
        assert_eq!(config.base_url, "http://127.0.0.1:11434");
    }
}
