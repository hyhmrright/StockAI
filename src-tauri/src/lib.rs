// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
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

    let provider = store
        .get("provider")
        .and_then(|v| v.as_str())
        .unwrap_or("openai")
        .to_string();
    let api_key = store
        .get("apiKey")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let base_url = store
        .get("baseUrl")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let model = store
        .get("model")
        .and_then(|v| v.as_str())
        .unwrap_or("gpt-4o")
        .to_string();
    let ollama_model = store
        .get("ollamaModel")
        .and_then(|v| v.as_str())
        .unwrap_or("llama3")
        .to_string();

    // 根据提供者选择模型名称
    let model_name = if provider == "ollama" {
        ollama_model
    } else {
        model
    };

    // 获取 sidecar 命令并注入配置参数
    // 参数顺序: [symbol, provider, apiKey, baseUrl, modelName]
    let sidecar_command = app_handle
        .shell()
        .sidecar("stockai-backend")
        .map_err(|e| format!("无法找到 Sidecar: {}", e))?
        .args(&[
            symbol,
            provider,
            api_key,
            base_url,
            model_name,
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
