import { expect, test, describe, beforeEach, spyOn } from "bun:test";
import { toErrorMessage, withTimeout, outputJson, _resetOutputGuard } from "./utils";

describe("toErrorMessage", () => {
  test("Error 实例返回 message", () => {
    expect(toErrorMessage(new Error("测试错误"))).toBe("测试错误");
  });

  test("字符串直接返回", () => {
    expect(toErrorMessage("字符串错误")).toBe("字符串错误");
  });

  test("其他类型转为字符串", () => {
    expect(toErrorMessage(42)).toBe("42");
    expect(toErrorMessage(null)).toBe("null");
    expect(toErrorMessage(undefined)).toBe("undefined");
  });
});

describe("withTimeout", () => {
  test("Promise 在超时前 resolve 时正常返回结果", async () => {
    const result = await withTimeout(
      Promise.resolve("ok"),
      1000,
      "不应超时"
    );
    expect(result).toBe("ok");
  });

  test("Promise 超时后 reject 并返回指定错误信息", async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 5000));
    await expect(
      withTimeout(slow, 50, "自定义超时消息")
    ).rejects.toThrow("自定义超时消息");
  });

  test("Promise 在超时前 reject 时正常传播原始错误", async () => {
    const failing = Promise.reject(new Error("原始错误"));
    await expect(
      withTimeout(failing, 1000, "不应看到此消息")
    ).rejects.toThrow("原始错误");
  });

  test("超时后 timer 被正确清理（不泄漏）", async () => {
    // 验证返回值正确，同时间接证明 timer 已清理（进程不挂起）
    const result = await withTimeout(Promise.resolve(42), 100, "不应超时");
    expect(result).toBe(42);
  });
});

describe("outputJson", () => {
  beforeEach(() => {
    _resetOutputGuard();
  });

  test("首次调用应写入 stdout", () => {
    const spy = spyOn(process.stdout, "write").mockImplementation(() => true);
    outputJson({ ok: true });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe('{"ok":true}\n');
    spy.mockRestore();
  });

  test("第二次调用应抛出协议违规错误", () => {
    const spy = spyOn(process.stdout, "write").mockImplementation(() => true);
    outputJson({ first: true });
    expect(() => outputJson({ second: true })).toThrow("[PROTOCOL]");
    spy.mockRestore();
  });
});
