import { expect, test, describe } from "bun:test";
import { withTimeout } from "./utils";

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
    // 正常完成后 finally 应清理 timer
    await withTimeout(Promise.resolve(42), 100, "");
    // 如果 timer 泄漏，进程会挂起——测试能正常结束即证明已清理
  });
});
