import { describe, it, expect, mock } from 'bun:test';
import { createHandlers, fetchProviderModels } from './index';

describe('handleListModels', () => {
  it('有端点的云端 provider 真打 API，输出拉到的模型列表', async () => {
    const mockOut = mock(() => {});
    const mockFetch = mock(async () => ['gpt-4o', 'o3', 'gpt-4.1']);
    const handlers = createHandlers({ _out: mockOut, _listModelsFetch: mockFetch });

    await handlers.handleListModels({
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-x',
    });

    expect(mockFetch).toHaveBeenCalledWith('openai', 'https://api.openai.com/v1', 'sk-x');
    const call = mockOut.mock.calls[0][0] as { data: { models: string[] } };
    expect(call.data.models).toEqual(['gpt-4o', 'o3', 'gpt-4.1']);
  });

  it('真实列表为空时回退到静态目录', async () => {
    const mockOut = mock(() => {});
    const mockFetch = mock(async () => [] as string[]);
    const handlers = createHandlers({ _out: mockOut, _listModelsFetch: mockFetch });

    await handlers.handleListModels({ provider: 'openai', apiKey: 'sk-x' });

    const call = mockOut.mock.calls[0][0] as { data: { models: string[] } };
    expect(call.data.models.length).toBeGreaterThan(0);
  });

  it('拉取失败（鉴权错误）映射到稳定错误码', async () => {
    const mockOut = mock(() => {});
    const mockFetch = mock(async () => {
      const err = new Error('Unauthorized') as Error & { status?: number };
      err.status = 401;
      throw err;
    });
    const handlers = createHandlers({ _out: mockOut, _listModelsFetch: mockFetch });

    await handlers.handleListModels({ provider: 'deepseek', apiKey: 'bad' });

    expect(mockOut).toHaveBeenCalledWith({
      error: expect.objectContaining({ code: 'ERR_LIST_MODELS_AUTH' }),
    });
  });

  it('glm 也有列模型端点（智谱 /models），真打 API 输出拉到的模型', async () => {
    const mockOut = mock(() => {});
    const mockFetch = mock(async () => ['glm-4.6', 'glm-4-flash']);
    const handlers = createHandlers({ _out: mockOut, _listModelsFetch: mockFetch });

    await handlers.handleListModels({
      provider: 'glm',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      apiKey: 'sk-x',
    });

    expect(mockFetch).toHaveBeenCalledWith('glm', 'https://open.bigmodel.cn/api/paas/v4', 'sk-x');
    const call = mockOut.mock.calls[0][0] as { data: { models: string[] } };
    expect(call.data.models).toEqual(['glm-4.6', 'glm-4-flash']);
  });
});

// 直接覆盖真实解析路径（handleListModels 测试都 mock 掉了 _listModelsFetch，解析逻辑此前无覆盖）
describe('fetchProviderModels（真实响应解析）', () => {
  it('解析智谱 /models 的 OpenAI 形状 {data:[{id}]}，并拼对 URL 与 bearer 头', async () => {
    const captured: { url?: string; auth?: string } = {};
    const fakeFetch = (async (url: string, init: { headers: Record<string, string> }) => {
      captured.url = url;
      captured.auth = init.headers.Authorization;
      // data 里混入 embedding 等非对话模型——与其它 provider 一样如实返回、不过滤
      return new Response(
        JSON.stringify({
          data: [
            { id: 'glm-4.6', created: 3 },
            { id: 'glm-5.1', created: 2 },
            { id: 'embedding-3', created: 1 },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const models = await fetchProviderModels(
      'glm',
      'https://open.bigmodel.cn/api/paas/v4',
      'sk-real',
      fakeFetch,
    );

    expect(captured.url).toBe('https://open.bigmodel.cn/api/paas/v4/models');
    expect(captured.auth).toBe('Bearer sk-real');
    expect(models).toEqual(['glm-4.6', 'glm-5.1', 'embedding-3']);
  });

  it('非 2xx 响应抛出带 status 的错误，供 classifyListModelsError 归类', async () => {
    const fakeFetch = (async () =>
      new Response('unauthorized', { status: 401 })) as unknown as typeof fetch;
    await expect(
      fetchProviderModels('glm', 'https://open.bigmodel.cn/api/paas/v4', 'bad', fakeFetch),
    ).rejects.toMatchObject({ status: 401 });
  });
});
