use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_sql::{Migration, MigrationKind};
use tauri_plugin_store::StoreExt;

/**
 * argv 槽位哨兵——必须与 shared/actions.ts 的 CONFIG_SLOT / PAYLOAD_SLOT 保持一致。
 * Rust 层不认识任何具体 action，只负责把这两个哨兵替换成临时文件路径，
 * 因此新增 sidecar 能力时本文件无需改动（见 shared/actions.ts 顶部说明）。
 */
const CONFIG_SLOT: &str = "@config";
const PAYLOAD_SLOT: &str = "@payload";

/**
 * 收到完整 JSON 后，再等 Sidecar 自行退出的宽限期。
 *
 * 这是**兜底**，不是主修法：Sidecar 正常情况下写完那行 JSON 就 `exitAfterFlush` 主动退了
 * （见 sidecar/utils.ts）。但只要它因为任何缘故没退——历史上是浏览器清理超时后留下的孤儿
 * Chromium 吊住了 Bun 的事件循环——`rx.recv()` 就会一直等管道关闭，而答案其实早就收全了。
 * 那种情形下 IPC 调用永不返回，UI 无限转圈。
 *
 * 计时只在**已经拿到完整 JSON 之后**才起，所以不会误杀跑得慢的调用：深度分析要连打 15 次
 * LLM，几分钟不出声也属正常，那期间根本没进入宽限期。
 */
const POST_JSON_GRACE: std::time::Duration = std::time::Duration::from_secs(5);

/**
 * Rust 侧 `Err(String)` 的错误码。约定格式为 `ERR_XXX: 诊断`——前端 ipc.ts 按此前缀解析成
 * ServiceError，再由 src/lib/service-errors.ts 译成用户语言。
 *
 * 为什么必须带码：不带码的裸字符串在 UI 上只能降级成兜底文案，en / ja 用户因此看不到
 * 具体原因（比如「还没保存过配置」会显示成「操作失败，请稍后重试」）。冒号后的诊断只给
 * 开发者看，故一律用中立措辞（OS 报错原文），不进用户可见文案。
 *
 * 新增码必须同步 SERVICE_ERROR_KEYS，由 test_error_codes_registered_in_frontend 守住。
 */
const ERR_NO_SETTINGS: &str = "ERR_NO_SETTINGS";
const ERR_STORE: &str = "ERR_STORE";
const ERR_SIDECAR_SPAWN: &str = "ERR_SIDECAR_SPAWN";
const ERR_TEMP_FILE: &str = "ERR_TEMP_FILE";

fn coded(code: &str, detail: impl std::fmt::Display) -> String {
    format!("{}: {}", code, detail)
}

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
 * Sidecar 管理器，封装进程启动与输出处理
 */
struct SidecarManager;

impl SidecarManager {
    /// 取最后一行完整 JSON——Sidecar 协议保证每次运行只写一行 JSON 到 stdout。
    fn last_json_line(buffer: &str) -> Option<String> {
        buffer
            .lines()
            .rev()
            .map(|l| l.trim())
            .find(|l| l.starts_with('{') && l.ends_with('}'))
            .map(|l| l.to_string())
    }

    /**
     * Sidecar 的诊断日志落点，经 `STOCKAI_LOG_DIR` 传给子进程（见 sidecar/utils.ts）。
     *
     * 目录在这里建而不在 setup 里建：日志目录存在是「设置 → 打开日志目录」按钮的前提，
     * 而这里是唯一必然先于用户点它发生的位置。`create_dir_all` 幂等，多调几次无妨。
     * 取不到路径就返回 None——Sidecar 会自己退到临时目录，不该因为日志而让调用失败。
     */
    fn log_dir(app_handle: &tauri::AppHandle) -> Option<std::path::PathBuf> {
        let dir = app_handle.path().app_log_dir().ok()?;
        std::fs::create_dir_all(&dir).ok()?;
        Some(dir)
    }

    async fn run(app_handle: &tauri::AppHandle, args: Vec<String>) -> Result<String, String> {
        let mut sidecar_command = app_handle
            .shell()
            .sidecar("stockai-backend")
            .map_err(|e| coded(ERR_SIDECAR_SPAWN, format!("sidecar not found: {}", e)))?
            .args(&args);

        if let Some(dir) = Self::log_dir(app_handle) {
            sidecar_command = sidecar_command.env("STOCKAI_LOG_DIR", dir);
        }

        let (mut rx, child) = sidecar_command
            .spawn()
            .map_err(|e| coded(ERR_SIDECAR_SPAWN, format!("spawn failed: {}", e)))?;

        let mut stdout_buffer = String::new();
        let mut stderr_buffer = String::new();
        let mut exit_code = None;
        // 结果已收全但进程赖着不走，宽限期满后强制回收
        let mut abandoned = false;

        loop {
            // 拿到完整 JSON 之前无限期等——慢不等于卡死，深度分析几分钟不出声是正常的。
            // 拿到之后只再给 POST_JSON_GRACE，到点就不陪了。
            let event = if Self::last_json_line(&stdout_buffer).is_some() {
                match tokio::time::timeout(POST_JSON_GRACE, rx.recv()).await {
                    Ok(event) => event,
                    Err(_) => {
                        abandoned = true;
                        break;
                    }
                }
            } else {
                rx.recv().await
            };

            let Some(event) = event else { break };
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

        if abandoned {
            eprintln!(
                "Sidecar 已输出结果但 {:?} 内未退出，强制回收进程",
                POST_JSON_GRACE
            );
            // kill 失败无所谓：结果已经拿到，回收不掉最多留一个孤儿进程，不该因此让调用失败
            let _ = child.kill();
        } else {
            drop(child);
        }

        let last_json = Self::last_json_line(&stdout_buffer).unwrap_or_default();

        if last_json.is_empty() {
            // message 只放中立诊断（退出码 + stderr 原文）：前端会把它原样拼在本地化文案之后，
            // 这里写中文等于又给 en / ja 用户看中文（err_sidecar 的译文才是给用户读的那句）。
            let err_msg = if stderr_buffer.is_empty() {
                format!("exit code {:?}, no stderr", exit_code)
            } else {
                format!("exit code {:?}: {}", exit_code, stderr_buffer)
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
                .map_err(|e| coded(ERR_TEMP_FILE, format!("write {} failed: {}", label, e)))?;
        }
        #[cfg(not(unix))]
        {
            use std::io::Write;
            // 与 Unix 分支同样用 create_new：`fs::write` 会跟随并覆写已存在的同名文件/符号链接，
            // 而这里写的是含 apiKey 的配置。文件名虽带 pid+纳秒，抢占窗口仍不该留着。
            // share_mode(0) 让写入期间其他进程无法打开它（Windows 上 %TEMP% 按用户隔离，
            // 权限本身由目录 ACL 保证，这里补的是写入过程中的可见性）。
            let mut opts = std::fs::OpenOptions::new();
            opts.write(true).create_new(true);
            #[cfg(windows)]
            {
                use std::os::windows::fs::OpenOptionsExt;
                opts.share_mode(0);
            }
            opts.open(&temp_path)
                .and_then(|mut f| f.write_all(content.as_bytes()))
                .map_err(|e| coded(ERR_TEMP_FILE, format!("write {} failed: {}", label, e)))?;
        }
        Ok(TempFileGuard(temp_path))
    }

    fn write_temp_json(label: &str, value: &serde_json::Value) -> Result<TempFileGuard, String> {
        let json = serde_json::to_string(value)
            .map_err(|e| coded(ERR_TEMP_FILE, format!("serialize {} failed: {}", label, e)))?;
        Self::write_temp_file(label, &json)
    }
}

/**
 * 读取 settings.json 的 app_settings。缺失/为 null 时报错——所有需要 AI 凭证的能力
 * 都必须先有配置，与其让 Sidecar 收到空配置再报难懂的错，不如在此early return。
 * Settings schema 由 Sidecar 的 resolveConfig 负责校验，避免 Rust/TS/Sidecar 三处重复定义。
 */
fn required_settings(app_handle: &tauri::AppHandle) -> Result<serde_json::Value, String> {
    let store = app_handle
        .store("settings.json")
        .map_err(|e| coded(ERR_STORE, format!("open settings.json failed: {}", e)))?;

    store
        .get("app_settings")
        .filter(|v| !v.is_null())
        .ok_or_else(|| coded(ERR_NO_SETTINGS, "app_settings missing in settings.json"))
}

/**
 * 唯一的 Sidecar 调用入口：前端按 shared/actions.ts 的清单组装好 argv，此处只做两件事——
 *   1. `@config` → 写 0o600 临时配置文件，替换为 `@路径`（apiKey 永不进 argv，`ps` 不可见）
 *   2. `@payload` → 写临时 JSON 文件，替换为裸路径（规避 macOS ARG_MAX ~256KB）
 *
 * config_override 用于列模型这类「用表单当前编辑值而非已保存配置」的场景；
 * 缺省时取 settings.json 的 app_settings。
 */
#[tauri::command]
async fn invoke_sidecar(
    app_handle: tauri::AppHandle,
    args: Vec<String>,
    payload: Option<serde_json::Value>,
    config_override: Option<serde_json::Value>,
) -> Result<String, String> {
    // guards 必须活到 Sidecar 跑完：drop 时才删临时文件
    let mut guards: Vec<TempFileGuard> = Vec::new();
    let mut resolved: Vec<String> = Vec::with_capacity(args.len());

    for arg in args {
        match arg.as_str() {
            CONFIG_SLOT => {
                let config = match config_override.clone() {
                    Some(v) => v,
                    None => required_settings(&app_handle)?,
                };
                let guard = SidecarManager::write_temp_json("config", &config)?;
                resolved.push(format!("@{}", guard.path().to_string_lossy()));
                guards.push(guard);
            }
            PAYLOAD_SLOT => {
                let value = payload.clone().unwrap_or(serde_json::Value::Null);
                let guard = SidecarManager::write_temp_json("payload", &value)?;
                resolved.push(guard.path().to_string_lossy().into_owned());
                guards.push(guard);
            }
            _ => resolved.push(arg),
        }
    }

    SidecarManager::run(&app_handle, resolved).await
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
        Migration {
            version: 3,
            description: "create master_signals table for virtual master portfolio",
            sql: include_str!("../migrations/003_create_master_signals.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "create positions table for user portfolio",
            sql: include_str!("../migrations/004_create_positions.sql"),
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
        .invoke_handler(tauri::generate_handler![invoke_sidecar])
        .run(tauri::generate_context!())
        .expect("运行 tauri 应用程序时出错");
}

#[cfg(test)]
mod tests {
    use super::*;

    const EMPTY_STDOUT_RESPONSE: &str =
        r#"{"error":{"code":"ERR_SIDECAR","message":"exit code None, no stderr"}}"#;

    /**
     * `last_json_line` 决定何时启动 POST_JSON_GRACE 宽限期，误判两个方向都有代价：
     * 判早了（把半行当成完整 JSON）会在结果还没收全时就开始倒计时；判晚了则宽限期永不
     * 触发，退回「Sidecar 不退出就永远等」的原始故障。
     */
    #[test]
    fn test_last_json_line_only_matches_complete_lines() {
        // 结果还在流式写入、行尾未到 → 不能算数
        assert_eq!(
            SidecarManager::last_json_line(r#"{"partial":"no newline yet"#),
            None
        );
        assert_eq!(SidecarManager::last_json_line(""), None);
        // stderr 混进来的普通日志行不该被当成结果
        assert_eq!(
            SidecarManager::last_json_line("Sidecar 执行: action=--quote\n"),
            None
        );

        // 协议保证只写一行；真有多行时取最后一行完整的
        assert_eq!(
            SidecarManager::last_json_line("noise\n{\"ok\":true}\n"),
            Some(r#"{"ok":true}"#.to_string())
        );
        assert_eq!(
            SidecarManager::last_json_line("{\"first\":1}\n{\"second\":2}\n"),
            Some(r#"{"second":2}"#.to_string())
        );
    }

    #[test]
    fn test_empty_stdout_fallback_is_valid_json_with_error_field() {
        let v: serde_json::Value = serde_json::from_str(EMPTY_STDOUT_RESPONSE)
            .expect("EMPTY_STDOUT_RESPONSE 必须是合法 JSON");
        let err = v.get("error").expect("fallback 必须包含 error 字段");
        assert!(err.get("code").is_some(), "error 必须包含 code 字段");
        assert!(err.get("message").is_some(), "error 必须包含 message 字段");
    }

    // 回归保护：哨兵字面量必须与 shared/actions.ts 一致，改一边而忘另一边会让参数原样传给
    // Sidecar（apiKey 泄进 argv / payload 路径变成字面量 "@payload"）。
    #[test]
    fn test_slot_sentinels_match_shared_manifest() {
        let manifest = include_str!("../../shared/actions.ts");
        assert!(
            manifest.contains(&format!("CONFIG_SLOT = '{}'", CONFIG_SLOT)),
            "CONFIG_SLOT 与 shared/actions.ts 不一致"
        );
        assert!(
            manifest.contains(&format!("PAYLOAD_SLOT = '{}'", PAYLOAD_SLOT)),
            "PAYLOAD_SLOT 与 shared/actions.ts 不一致"
        );
    }

    // 回归保护：Rust 抛出的每个码都必须在前端码表里有译文，否则 UI 只能降级成兜底文案
    // （en / ja 用户看不到具体原因）。加码而忘登记不会有任何运行时报错，只有这条能拦。
    #[test]
    fn test_error_codes_registered_in_frontend() {
        let table = include_str!("../../src/lib/service-errors.ts");
        for code in [
            ERR_NO_SETTINGS,
            ERR_STORE,
            ERR_SIDECAR_SPAWN,
            ERR_TEMP_FILE,
            "ERR_SIDECAR", // 空 stdout 时由 SidecarManager::run 直接写进信封
        ] {
            assert!(
                table.contains(&format!("{}:", code)),
                "{} 未登记进 src/lib/service-errors.ts 的 SERVICE_ERROR_KEYS",
                code
            );
        }
    }

    // 回归保护：payload 走临时文件而非 argv，确保超过 macOS ARG_MAX (~256KB) 的大 payload
    // 也能安全转移。用 TempFileGuard 保证 assert 失败 panic 时文件也能清理。
    #[test]
    fn test_large_payload_roundtrips_via_temp_file() {
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

        let guard =
            SidecarManager::write_temp_json("payload", &large_news).expect("写入临时文件应成功");
        let read_back = std::fs::read_to_string(guard.path()).expect("读取临时文件应成功");
        assert_eq!(
            read_back, news_json,
            "临时文件应能完整 roundtrip 任意大小 payload"
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
