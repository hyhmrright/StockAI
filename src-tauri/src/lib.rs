use tauri_plugin_shell::ShellExt;
use tauri_plugin_store::StoreExt;

// 可以在 https://tauri.app/develop/calling-rust/ 了解更多关于 Tauri 命令的信息
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
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
        config_json: String,
    ) -> Result<String, String> {
        let sidecar_command = app_handle
            .shell()
            .sidecar("stockai-backend")
            .map_err(|e| format!("无法找到 Sidecar: {}", e))?
            .args(&[symbol, config_json]);

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
                }
                _ => {}
            }
        }
        Ok(output)
    }

    /**
     * 运行 Sidecar 列表任务
     */
    async fn list_models(
        app_handle: &tauri::AppHandle,
        provider: String,
        base_url: String,
    ) -> Result<String, String> {
        // list-models 也使用 JSON 传递参数
        let config_json = serde_json::json!({
            "provider": provider,
            "baseUrl": base_url
        }).to_string();

        let sidecar_command = app_handle
            .shell()
            .sidecar("stockai-backend")
            .map_err(|e| format!("无法找到 Sidecar: {}", e))?
            .args(&["--list-models".to_string(), config_json]);

        let (mut rx, _child) = sidecar_command
            .spawn()
            .map_err(|e| format!("Sidecar 启动失败: {}", e))?;

        let mut output = String::new();
        while let Some(event) = rx.recv().await {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                    output.push_str(&String::from_utf8_lossy(&line));
                }
                _ => {}
            }
        }
        Ok(output)
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
    SidecarManager::list_models(&app_handle, provider, base_url).await
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

    // 前端将设置存储在 "app_settings" 键下，直接获取并传给 Sidecar
    let settings_val = store.get("app_settings");
    let config_json = match settings_val {
        Some(v) => v.to_string(),
        None => "{}".to_string(),
    };

    SidecarManager::run_analysis(&app_handle, symbol, config_json).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_greet() {
        assert_eq!(greet("Tauri"), "Hello, Tauri! You've been greeted from Rust!");
    }

    // 注意：start_analysis 依赖 tauri::AppHandle 和 Store，通常需要集成测试或 Mock
    // 但我们可以验证其核心逻辑的鲁棒性
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
