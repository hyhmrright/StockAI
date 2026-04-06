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
    model: Option<&str>,
    ollama_model: Option<&str>,
) -> AppConfig {
    let p = provider.unwrap_or("openai");
    let m = model.unwrap_or("gpt-4o");
    let om = ollama_model.unwrap_or("llama3");

    AppConfig {
        provider: p.to_string(),
        api_key: api_key.unwrap_or("").to_string(),
        base_url: base_url.unwrap_or("").to_string(),
        model_name: if p == "ollama" { om.to_string() } else { m.to_string() },
    }
}

/**
 * 启动股票分析 (调用 Sidecar 抓取新闻并进行 AI 分析)
 * @param app_handle Tauri App Handle
 * @param symbol 股票代码
 */
#[tauri::command]
async fn start_analysis(app_handle: tauri::AppHandle, symbol: String) -> Result<String, String> {
    use tauri_plugin_shell::ShellExt;
    use tauri_plugin_store::StoreExt;

    // 从 settings.json 读取配置
    let store = app_handle
        .store("settings.json")
        .map_err(|e| format!("无法打开配置存储: {}", e))?;

    // 获取所有权以延长生命周期
    let p_val = store.get("provider");
    let k_val = store.get("apiKey");
    let b_val = store.get("baseUrl");
    let m_val = store.get("model");
    let om_val = store.get("ollamaModel");

    let config = resolve_config(
        p_val.as_ref().and_then(|v| v.as_str()),
        k_val.as_ref().and_then(|v| v.as_str()),
        b_val.as_ref().and_then(|v| v.as_str()),
        m_val.as_ref().and_then(|v| v.as_str()),
        om_val.as_ref().and_then(|v| v.as_str()),
    );

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
        let config = resolve_config(None, None, None, None, None);
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
            None
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
            None,
            Some("llama2")
        );
        assert_eq!(config.provider, "ollama");
        assert_eq!(config.model_name, "llama2");
        assert_eq!(config.base_url, "http://127.0.0.1:11434");
    }
}
