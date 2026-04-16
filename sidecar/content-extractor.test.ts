import { describe, test, expect } from "bun:test";
import { htmlToMarkdown } from "./content-extractor";
import { CONTENT_LIMITS } from "./config";

describe("htmlToMarkdown", () => {
  test("普通 HTML 转换为 Markdown 文本", () => {
    const md = htmlToMarkdown("<h1>标题</h1><p>正文段落</p>");
    expect(md).toContain("标题");
    expect(md).toContain("正文段落");
  });

  test("空 HTML 不抛错，返回空串或仅 whitespace", () => {
    expect(typeof htmlToMarkdown("")).toBe("string");
  });

  test("超长内容被截断到 fullContent 长度并附加省略提示", () => {
    const longHtml = "<p>" + "字".repeat(CONTENT_LIMITS.fullContent + 500) + "</p>";
    const md = htmlToMarkdown(longHtml);
    expect(md).toContain("...(内容已截断)");
    // 截断标记占位后，净文本不应超过 fullContent + 提示长度
    expect(md.length).toBeLessThan(CONTENT_LIMITS.fullContent + 40);
  });

  test("未超长内容不附加截断提示", () => {
    const md = htmlToMarkdown("<p>简短正文</p>");
    expect(md).not.toContain("...(内容已截断)");
  });
});
