use serde::{Deserialize, Serialize};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_sql::{Migration, MigrationKind};
use tauri_plugin_store::StoreExt;

/**
 * RAII 临时文件守卫：drop 时自动删文件，覆盖 panic / async cancel / 提前 return 等所有退出路径。
 * 不依赖外部 crate，避免引入 tempfile / scopeguard 仅为此一处用。
 */
struct TempFileGuard(std::path::PathBuf);

impl TempFileGuard {
    fn path(&self) -> &std::path::Path {
        &self.0
    }
}

impl Drop for TempFileGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
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
    // 取最后一行——Sidecar 协议保证每次运行只写一行 JSON 到 stdout。
    async fn run(app_handle: &tauri::AppHandle, args: Vec<String>) -> Result<String, String> {
        let sidecar_command = app_handle
            .shell()
            .sidecar("stockai-backend")
            .map_err(|e| format!("无法找到 Sidecar: {}", e))?
            .args(&args);

        let (mut rx, child) = sidecar_command
            .spawn()
            .map_err(|e| format!("Sidecar 启动失败: {}", e))?;

        let mut stdout_buffer = String::new();
        let mut stderr_buffer = String::new();
        let mut exit_code = None;

        while let Some(event) = rx.recv().await {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                    let s = String::from_utf8_lossy(&line);
                    stdout_buffer.push_str(&s);
                }
                tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                    let s = String::from_utf8_lossy(&line);
                    stderr_buffer.push_str(&s);
                    eprintln!("Sidecar Stderr: {}", s);
                }
                tauri_plugin_shell::process::CommandEvent::Terminated(status) => {
                    exit_code = status.code;
                }
                _ => {}
            }
        }
        drop(child);

        // 查找最后一个完整的 JSON 对象
        let last_json = stdout_buffer
            .lines()
            .rev()
            .map(|l| l.trim())
            .find(|l| l.starts_with('{') && l.ends_with('}'))
            .unwrap_or("")
            .to_string();

        if last_json.is_empty() {
            let err_msg = if stderr_buffer.is_empty() {
                format!(
                    "分析服务无响应 (ExitCode: {:?})。请尝试重新构建 Sidecar。",
                    exit_code
                )
            } else {
                format!(
                    "分析服务异常 (ExitCode: {:?})。详情: {}",
                    exit_code, stderr_buffer
                )
            };

            // 使用 serde_json 安全序列化，防止特殊字符破坏 JSON 结构
            let err_json = serde_json::json!({
                "error": {
                    "code": "ERR_SIDECAR",
                    "message": err_msg
                }
            });
            Ok(err_json.to_string())
        } else {
            Ok(last_json)
        }
    }

    // Settings schema 由 Sidecar 的 resolveConfig 负责校验——避免 Rust/TS/Sidecar 三处重复定义。
    async fn run_analysis(
        app_handle: &tauri::AppHandle,
        symbol: String,
        config: serde_json::Value,
    ) -> Result<String, String> {
        let guard = Self::write_temp_config(&config)?;
        let config_arg = format!("@{}", guard.path().to_string_lossy());
        Self::run(app_handle, vec![symbol, config_arg]).await
    }

    async fn list_models(
        app_handle: &tauri::AppHandle,
        config: ModelListConfig,
    ) -> Result<String, String> {
        let config_json =
            serde_json::to_string(&config).map_err(|e| format!("列表配置序列化失败: {}", e))?;

        Self::run(app_handle, vec!["--list-models".to_string(), config_json]).await
    }

    async fn get_stock_info(
        app_handle: &tauri::AppHandle,
        symbol: String,
        _config: serde_json::Value,
    ) -> Result<String, String> {
        Self::run(
            app_handle,
            vec!["--info".to_string(), "{}".to_string(), symbol],
        )
        .await
    }

    async fn search_stocks(
        app_handle: &tauri::AppHandle,
        keyword: String,
        _config: serde_json::Value,
    ) -> Result<String, String> {
        Self::run(
            app_handle,
            vec!["--search".to_string(), "{}".to_string(), keyword],
        )
        .await
    }

    async fn fetch_kline(
        app_handle: &tauri::AppHandle,
        request: serde_json::Value,
    ) -> Result<String, String> {
        let request_json =
            serde_json::to_string(&request).map_err(|e| format!("K 线参数序列化失败: {}", e))?;
        Self::run(app_handle, vec!["--kline".to_string(), request_json]).await
    }

    async fn fetch_quote(app_handle: &tauri::AppHandle, symbol: String) -> Result<String, String> {
        Self::run(app_handle, vec!["--quote".to_string(), symbol]).await
    }

    async fn fetch_quant_bundle(
        app_handle: &tauri::AppHandle,
        symbol: String,
    ) -> Result<String, String> {
        Self::run(app_handle, vec!["--quant".to_string(), symbol]).await
    }

    async fn fetch_market_bundle(
        app_handle: &tauri::AppHandle,
        symbol: String,
        config: serde_json::Value,
    ) -> Result<String, String> {
        let guard = Self::write_temp_config(&config)?;
        let config_arg = format!("@{}", guard.path().to_string_lossy());
        Self::run(app_handle, vec!["--bundle".to_string(), config_arg, symbol]).await
    }

    // 安全写入临时文件（Unix 下 0o600 权限，仅所有者可读写），返回 TempFileGuard（drop 时自动清理）。
    // 文件名含 pid + 纳秒时间戳，跨进程并发不冲突。
    fn write_temp_file(label: &str, content: &str) -> Result<TempFileGuard, String> {
        let temp_path = std::env::temp_dir().join(format!(
            "stockai-{}-{}-{}.json",
            label,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        #[cfg(unix)]
        {
            use std::io::Write;
            use std::os::unix::fs::OpenOptionsExt;
            std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .mode(0o600)
                .open(&temp_path)
                .and_then(|mut f| f.write_all(content.as_bytes()))
                .map_err(|e| format!("无法写入临时{}文件: {}", label, e))?;
        }
        #[cfg(not(unix))]
        {
            std::fs::write(&temp_path, content)
                .map_err(|e| format!("无法写入临时{}文件: {}", label, e))?;
        }
        Ok(TempFileGuard(temp_path))
    }

    fn write_temp_news(news: &serde_json::Value) -> Result<TempFileGuard, String> {
        let news_json =
            serde_json::to_string(news).map_err(|e| format!("新闻序列化失败: {}", e))?;
        Self::write_temp_file("news", &news_json)
    }

    fn write_temp_config(config: &serde_json::Value) -> Result<TempFileGuard, String> {
        let config_json =
            serde_json::to_string(config).map_err(|e| format!("配置序列化失败: {}", e))?;
        Self::write_temp_file("config", &config_json)
    }

    async fn analyze_news(
        app_handle: &tauri::AppHandle,
        symbol: String,
        news: serde_json::Value,
        config: serde_json::Value,
        quant: Option<String>,
    ) -> Result<String, String> {
        let config_guard = Self::write_temp_config(&config)?;
        let config_arg = format!("@{}", config_guard.path().to_string_lossy());
        let news_guard = Self::write_temp_news(&news)?;
        let news_arg = news_guard.path().to_string_lossy().into_owned();
        let mut args = vec!["--analyze-only".to_string(), config_arg, symbol, news_arg];
        if let Some(q) = quant {
            args.push(q);
        }
        Self::run(app_handle, args).await
    }

    async fn deep_analyze(
        app_handle: &tauri::AppHandle,
        symbol: String,
        news: serde_json::Value,
        config: serde_json::Value,
        quant: Option<String>,
    ) -> Result<String, String> {
        let config_guard = Self::write_temp_config(&config)?;
        let config_arg = format!("@{}", config_guard.path().to_string_lossy());
        let news_guard = Self::write_temp_news(&news)?;
        let news_arg = news_guard.path().to_string_lossy().into_owned();
        let mut args = vec!["--deep-analysis".to_string(), config_arg, symbol, news_arg];
        if let Some(q) = quant {
            args.push(q);
        }
        Self::run(app_handle, args).await
    }
}

/**
 * 搜索股票建议
 */
#[tauri::command]
async fn search_stocks(app_handle: tauri::AppHandle, keyword: String) -> Result<String, String> {
    let store = app_handle
        .store("settings.json")
        .map_err(|e| format!("无法打开配置存储: {}", e))?;

    let settings_val = store.get("app_settings").unwrap_or(serde_json::json!({}));

    SidecarManager::search_stocks(&app_handle, keyword, settings_val).await
}

/**
 * 获取股票基本信息
 */
#[tauri::command]
async fn get_stock_info(app_handle: tauri::AppHandle, symbol: String) -> Result<String, String> {
    let store = app_handle
        .store("settings.json")
        .map_err(|e| format!("无法打开配置存储: {}", e))?;

    let settings_val = store.get("app_settings").unwrap_or(serde_json::json!({}));

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
 * 拉取 K 线
 */
#[tauri::command]
async fn fetch_kline(
    app_handle: tauri::AppHandle,
    request: serde_json::Value,
) -> Result<String, String> {
    SidecarManager::fetch_kline(&app_handle, request).await
}

/**
 * 拉取实时报价
 */
#[tauri::command]
async fn fetch_realtime_quote(
    app_handle: tauri::AppHandle,
    symbol: String,
) -> Result<String, String> {
    SidecarManager::fetch_quote(&app_handle, symbol).await
}

/**
 * 启动股票分析（向后兼容；新交互流程走 fetch_market_bundle + analyze_news）
 */
#[tauri::command]
async fn start_analysis(app_handle: tauri::AppHandle, symbol: String) -> Result<String, String> {
    let store = app_handle
        .store("settings.json")
        .map_err(|e| format!("无法打开配置存储: {}", e))?;

    let settings_val = store
        .get("app_settings")
        .filter(|v| !v.is_null())
        .ok_or_else(|| "未找到应用设置，请先在设置界面保存配置。".to_string())?;

    SidecarManager::run_analysis(&app_handle, symbol, settings_val).await
}

/**
 * 仅抓数据（StockInfo + News）— 新交互流程第一步
 */
#[tauri::command]
async fn fetch_market_bundle(
    app_handle: tauri::AppHandle,
    symbol: String,
) -> Result<String, String> {
    let store = app_handle
        .store("settings.json")
        .map_err(|e| format!("无法打开配置存储: {}", e))?;

    let settings_val = store
        .get("app_settings")
        .filter(|v| !v.is_null())
        .ok_or_else(|| "未找到应用设置，请先在设置界面保存配置。".to_string())?;

    SidecarManager::fetch_market_bundle(&app_handle, symbol, settings_val).await
}

/**
 * 仅调 LLM 分析已抓到的新闻 — 新交互流程第二步（用户显式触发）
 */
#[tauri::command]
async fn analyze_news(
    app_handle: tauri::AppHandle,
    symbol: String,
    news: serde_json::Value,
    quant: Option<String>,
) -> Result<String, String> {
    let store = app_handle
        .store("settings.json")
        .map_err(|e| format!("无法打开配置存储: {}", e))?;

    let settings_val = store
        .get("app_settings")
        .filter(|v| !v.is_null())
        .ok_or_else(|| "未找到应用设置，请先在设置界面保存配置。".to_string())?;

    SidecarManager::analyze_news(&app_handle, symbol, news, settings_val, quant).await
}

/**
 * 深度多智能体分析 — 调用 Sidecar --deep-analysis 流程
 */
#[tauri::command]
async fn deep_analyze(
    app_handle: tauri::AppHandle,
    symbol: String,
    news: serde_json::Value,
    quant: Option<String>,
) -> Result<String, String> {
    let store = app_handle
        .store("settings.json")
        .map_err(|e| format!("无法打开配置存储: {}", e))?;

    let settings_val = store
        .get("app_settings")
        .filter(|v| !v.is_null())
        .ok_or_else(|| "未找到应用设置，请先在设置界面保存配置。".to_string())?;

    SidecarManager::deep_analyze(&app_handle, symbol, news, settings_val, quant).await
}

#[tauri::command]
async fn fetch_quant_bundle(
    app_handle: tauri::AppHandle,
    symbol: String,
) -> Result<String, String> {
    SidecarManager::fetch_quant_bundle(&app_handle, symbol).await
}

/**
 * 运行量化回测
 */
#[tauri::command]
async fn run_backtest(app_handle: tauri::AppHandle, symbol: String) -> Result<String, String> {
    SidecarManager::run(&app_handle, vec!["--backtest".to_string(), symbol]).await
}

#[cfg(test)]
mod tests {
    use super::*;

    const EMPTY_STDOUT_RESPONSE: &str = r#"{"error":{"code":"ERR_SIDECAR","message":"分析服务无响应 (ExitCode: None)。请尝试重新构建 Sidecar。"}}"#;

    #[test]
    fn test_empty_stdout_fallback_is_valid_json_with_error_field() {
        let v: serde_json::Value = serde_json::from_str(EMPTY_STDOUT_RESPONSE)
            .expect("EMPTY_STDOUT_RESPONSE 必须是合法 JSON");
        let err = v.get("error").expect("fallback 必须包含 error 字段");
        assert!(err.get("code").is_some(), "error 必须包含 code 字段");
        assert!(err.get("message").is_some(), "error 必须包含 message 字段");
    }

    #[test]
    fn test_model_list_config_serializes_to_camel_case() {
        let cfg = ModelListConfig {
            provider: "openai".to_string(),
            base_url: "https://api.openai.com/v1".to_string(),
        };
        let json = serde_json::to_string(&cfg).unwrap();
        assert!(
            json.contains("baseUrl"),
            "serde 应序列化为 camelCase baseUrl"
        );
        assert!(!json.contains("base_url"), "不应出现 snake_case base_url");
    }

    // 回归保护：news payload 走临时文件而非 argv，确保超过 macOS ARG_MAX (~256KB) 的大 payload
    // 也能安全转移。用 TempFileGuard 保证 assert 失败 panic 时文件也能清理。
    #[test]
    fn test_large_news_payload_roundtrips_via_temp_file() {
        let large_news = serde_json::json!([{
            "title": "stress",
            "source": "test",
            "date": "2026-05-23",
            "content": "x".repeat(400_000),
            "url": "https://example.com"
        }]);
        let news_json = serde_json::to_string(&large_news).unwrap();
        assert!(
            news_json.len() > 300_000,
            "构造样本必须超过 ARG_MAX 阈值才有意义"
        );

        let temp_path = std::env::temp_dir().join(format!(
            "stockai-news-roundtrip-{}-{}.json",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::write(&temp_path, &news_json).expect("写入临时新闻文件应成功");
        let guard = TempFileGuard(temp_path);
        let read_back = std::fs::read_to_string(guard.path()).expect("读取临时新闻文件应成功");
        assert_eq!(
            read_back, news_json,
            "临时文件应能完整 roundtrip 任意大小 news payload"
        );
        // guard.drop() here cleans up；上面 assert 失败也照样清理
    }

    #[test]
    fn test_temp_file_guard_removes_file_on_drop() {
        let p = std::env::temp_dir().join(format!(
            "stockai-guard-test-{}-{}.txt",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::write(&p, b"x").unwrap();
        assert!(p.exists(), "前置：文件应存在");
        {
            let _g = TempFileGuard(p.clone());
        } // guard drops here
        assert!(!p.exists(), "Drop 后文件应被删除");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create analysis_records table",
            sql: include_str!("../migrations/001_create_history.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "drop type CHECK constraint for extensibility",
            sql: include_str!("../migrations/002_drop_type_check.sql"),
            kind: MigrationKind::Up,
        },
    ];

    let mut builder = tauri::Builder::default();

    // 自动更新器仅桌面端可用，移动端不编译该插件
    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init());
    }

    builder
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:history.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            start_analysis,
            fetch_market_bundle,
            analyze_news,
            deep_analyze,
            list_models,
            get_stock_info,
            search_stocks,
            fetch_kline,
            fetch_realtime_quote,
            fetch_quant_bundle,
            run_backtest
        ])
        .run(tauri::generate_context!())
        .expect("运行 tauri 应用程序时出错");
}
