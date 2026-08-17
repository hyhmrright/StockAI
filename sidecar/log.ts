import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';

/**
 * 诊断日志：落盘位置、轮转、脱敏与分级。
 *
 * 从 `utils.ts` 拆出——那里同时住着协议信封与进程原语，改日志口径会牵动 41 个 importer
 * 重编译重测。本模块只因「日志怎么记」而改变。
 */

const LOG_FILENAME = 'sidecar.log';
/** 单个日志文件的体积上限，超过即轮转；连同 `.old` 一份，磁盘占用封顶 2 倍 */
const LOG_MAX_BYTES = 512 * 1024;

/**
 * 日志文件路径。
 *
 * 落点由 Rust 在 spawn 时经 `STOCKAI_LOG_DIR` 注入（Tauri 的 app log dir——跨平台标准
 * 位置、必然可写、用户能在设置里一键打开）。没有该变量说明是开发期直接跑 sidecar，
 * 退到临时目录即可。
 *
 * **刻意不再用可执行文件目录**：打包后那是 `.app/Contents/MacOS` 与 `Program Files`，
 * 装在系统目录时根本不可写；侥幸写成了也会被下一次应用更新连同旧二进制一起抹掉，
 * 而「更新后才复现的故障」恰恰最需要更新前的那段日志。
 */
function logFilePath(): string {
  const dir = process.env.STOCKAI_LOG_DIR ?? tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, LOG_FILENAME);
  } catch {
    // 注入的目录建不出来（权限/路径非法）时不能放弃落盘，退回临时目录
    return path.join(tmpdir(), LOG_FILENAME);
  }
}

/** 超过上限就把当前文件顶成 `.old`（覆盖上一份），无需扫目录也不会无限增长 */
function rotateIfOversized(file: string): void {
  const stat = fs.statSync(file, { throwIfNoEntry: false }); // 文件还不存在时给 undefined 而非抛
  if (!stat || stat.size < LOG_MAX_BYTES) return;
  fs.renameSync(file, `${file}.old`);
}

/**
 * 落盘前抹掉疑似凭据。
 *
 * 这份日志是**给用户当报障附件往 issue 里贴的**（设置里的「打开日志目录」就是这么引导的），
 * 所以「日志里碰巧没有 key」这种当下成立的巧合当不了保证：provider 的 401 原文常带半截
 * key，URL 携带鉴权的更是整串明文。抹在这里而不是各调用点，是因为这是所有落盘文本的唯一
 * 出口——将来新增的 `logger` 调用不必各自记得脱敏。
 *
 * **不追求穷尽**：只挡已知会出现在本项目 provider 报错里的几种形状。GLM 的 `{id}.{secret}`
 * 不单列——那个形状与域名、版本号无法区分，规则写宽了会把正常日志抹成马赛克；它经
 * Authorization 头发出，由下面的 Bearer 规则覆盖。
 */
const SECRET_PATTERNS: [RegExp, string][] = [
  [/\bsk-[A-Za-z0-9_-]{8,}/g, 'sk-***'], // OpenAI / DeepSeek / Anthropic(sk-ant-) 同族
  [/\bBearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer ***'],
  [/([?&](?:api[-_]?key|key|token|access[-_]?token)=)[^&\s]+/gi, '$1***'], // URL 查询串里的鉴权
];

function redactSecrets(msg: string): string {
  return SECRET_PATTERNS.reduce((acc, [pattern, mask]) => acc.replace(pattern, mask), msg);
}

/**
 * 诊断日志落盘。
 *
 * 为什么非落盘不可：打包后的应用由 Finder / 开始菜单启动，stderr 没有终端可去——
 * sidecar 里几十处 `logger` 调用在生产环境等于全部丢弃，用户报障时手上一点证据都没有。
 */
export function logToFile(msg: string) {
  try {
    const file = logFilePath();
    rotateIfOversized(file);
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${redactSecrets(msg)}\n`);
  } catch {
    // 写日志失败不该影响主流程，一律吞掉
  }
}

/**
 * 标准化日志输出类。
 *
 * **warn / error 落盘，info / debug 只进 stderr**：warn 记的是「降级发生了」——数据源
 * 回退、抓取策略失败、缓存写不进去，正是事后排障唯一能用的线索（K 线回退到不复权的
 * 中文源、三个新闻策略全挂被报成「请确认代码是否正确」，都只在这一级留痕）。info 是
 * 流水账，量大且绝大多数时候没有诊断价值，落盘只会把信号淹掉。
 */
export const logger = {
  info(msg: string) {
    console.error(`[SIDE-INFO] ${msg}`);
  },
  debug(msg: string) {
    console.error(`[SIDE-DEBUG] ${msg}`);
  },
  warn(msg: string) {
    console.error(`[SIDE-WARN] ${msg}`);
    logToFile(`WARN: ${msg}`);
  },
  error(msg: string) {
    console.error(`[SIDE-ERROR] ${msg}`);
    logToFile(`ERROR: ${msg}`);
  },
};
