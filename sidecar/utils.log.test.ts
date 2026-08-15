import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { logToFile, logger } from './utils';

/**
 * 诊断日志是打包后应用**唯一**的一手证据——GUI 启动没有终端，stderr 无处可去。
 * 所以这一层的回归代价特别隐蔽：没有任何测试会红，只是线上从此再也查不出问题。
 * 下面钉住的都是「悄悄退回失明」的那几条路。
 */

const LOG_FILE = 'sidecar.log';

let dir: string;
let prevEnv: string | undefined;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stockai-log-'));
  prevEnv = process.env.STOCKAI_LOG_DIR;
  process.env.STOCKAI_LOG_DIR = dir;
});

afterEach(() => {
  if (prevEnv === undefined) delete process.env.STOCKAI_LOG_DIR;
  else process.env.STOCKAI_LOG_DIR = prevEnv;
  fs.rmSync(dir, { recursive: true, force: true });
});

const readLog = () => fs.readFileSync(path.join(dir, LOG_FILE), 'utf8');

describe('logToFile 落点', () => {
  it('写进 STOCKAI_LOG_DIR 指定的目录', () => {
    logToFile('hello');
    expect(readLog()).toContain('hello');
  });

  it('目录不存在时自己建出来——Rust 建目录失败不该让日志一起消失', () => {
    process.env.STOCKAI_LOG_DIR = path.join(dir, 'nested', 'deep');
    logToFile('hello');
    expect(fs.readFileSync(path.join(dir, 'nested', 'deep', LOG_FILE), 'utf8')).toContain('hello');
  });

  it('落点不可用时静默吞掉，不能把主流程带崩', () => {
    // 拿一个已存在的**文件**当目录，mkdir 与 append 都会失败
    const file = path.join(dir, 'not-a-dir');
    fs.writeFileSync(file, '');
    process.env.STOCKAI_LOG_DIR = file;
    expect(() => logToFile('hello')).not.toThrow();
  });
});

describe('logger 落盘口径', () => {
  it('warn 落盘：数据源回退、策略失败只在这一级留痕，丢了就等于没有监控', () => {
    logger.warn('腾讯 K线拉取失败，尝试下一数据源');
    expect(readLog()).toContain('WARN: 腾讯 K线拉取失败');
  });

  it('error 落盘', () => {
    logger.error('boom');
    expect(readLog()).toContain('ERROR: boom');
  });

  it.each(['info', 'debug'] as const)('%s 不落盘——流水账会把上面两级的信号淹掉', (level) => {
    logger[level]('噪音');
    expect(fs.existsSync(path.join(dir, LOG_FILE))).toBe(false);
  });
});

describe('脱敏', () => {
  it.each([
    ['OpenAI 风格 401 原文', 'API error: Incorrect API key provided: sk-abc123DEF456ghi', 'sk-***'],
    ['Anthropic 同族前缀', 'auth failed for sk-ant-api03-XyZ_987', 'sk-***'],
    ['Authorization 头被打进错误里', 'req failed {Bearer eyJhbGciOi.J9xx}', 'Bearer ***'],
    ['URL 查询串携带鉴权', 'GET https://api.x.com/v1/m?api_key=SECRET123&n=1 失败', 'api_key=***'],
  ])('%s', (_label, raw, masked) => {
    logToFile(raw);
    const written = readLog();
    expect(written).toContain(masked);
    // 只断「掩码出现了」会漏掉「原文也还在」的实现错误，两侧都要看
    expect(written).not.toMatch(/sk-abc123DEF456ghi|XyZ_987|eyJhbGciOi\.J9xx|SECRET123/);
  });

  it('不误伤正常日志——报错原文本身是诊断价值所在', () => {
    const normal = '腾讯 报价拉取失败，尝试下一数据源：HTTP 502 https://qt.gtimg.cn/q=usAAPL';
    logToFile(normal);
    expect(readLog()).toContain(normal);
  });
});

describe('轮转', () => {
  it('超过上限即转为 .old，新内容照常写入当前文件', () => {
    const file = path.join(dir, LOG_FILE);
    // 直接把文件撑到上限（512KB）之上，省去几十万次 logToFile
    fs.writeFileSync(file, `${'x'.repeat(512 * 1024)}\n`);

    logToFile('轮转后的第一行');

    expect(fs.readFileSync(`${file}.old`, 'utf8')).toContain('x');
    const current = readLog();
    expect(current).toContain('轮转后的第一行');
    expect(current).not.toContain('x'); // 当前文件是新的，不是追加在旧内容后面
  });

  it('第二次轮转覆盖上一份 .old——磁盘占用封顶两个文件', () => {
    const file = path.join(dir, LOG_FILE);
    const oversized = `${'x'.repeat(512 * 1024)}\n`;

    fs.writeFileSync(file, `第一代\n${oversized}`);
    logToFile('第二代');
    fs.appendFileSync(file, oversized);
    logToFile('第三代');

    expect(fs.readFileSync(`${file}.old`, 'utf8')).toContain('第二代');
    expect(fs.readFileSync(`${file}.old`, 'utf8')).not.toContain('第一代');
    expect(fs.readdirSync(dir).filter((f) => f.startsWith(LOG_FILE))).toHaveLength(2);
  });
});
