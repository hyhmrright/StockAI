// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/**
 * 启动股票分析 (调用 Sidecar 抓取新闻)
 * @param app_handle Tauri App Handle
 * @param symbol 股票代码
 */
#[tauri::command]
async fn start_analysis(app_handle: tauri::AppHandle, symbol: String) -> Result<String, String> {
    use tauri_plugin_shell::ShellExt;

    // 获取 sidecar 命令
    let sidecar_command = app_handle
        .shell()
        .sidecar("stockai-backend")
        .map_err(|e| format!("无法找到 Sidecar: {}", e))?
        .args(&[symbol]);

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
