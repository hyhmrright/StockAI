import { describe, expect, test } from 'bun:test';
import * as cjs from 'chromium-bidi/lib/cjs/protocol-parser/protocol-parser.js';
import * as esm from 'chromium-bidi/protocol-parser/protocol-parser.js';

// chromium-bidi 仍锁在 Playwright 编译所需的 15.x；同时验证 Zod 4 覆盖后的两种入口。
for (const [name, parser] of Object.entries({ cjs, esm })) {
  describe(`chromium-bidi + Zod 4 (${name})`, () => {
    test('有效树查询和导航参数保持可解析', () => {
      expect(parser.BrowsingContext.parseGetTreeParams({})).toEqual({});
      const navigate = { context: 'tab-1', url: 'https://example.com', wait: 'complete' };
      expect(parser.BrowsingContext.parseNavigateParams(navigate)).toEqual(navigate);
    });

    test('无效参数返回协议错误及字段路径，不抛出 TypeError', () => {
      try {
        parser.BrowsingContext.parseGetTreeParams({ maxDepth: -1 });
        throw new Error('Expected invalid argument');
      } catch (error) {
        expect(error).not.toBeInstanceOf(TypeError);
        expect(error).toHaveProperty('error', 'invalid argument');
        expect((error as Error).message).toContain('maxDepth');
      }
    });
  });
}
