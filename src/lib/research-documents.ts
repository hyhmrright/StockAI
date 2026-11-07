import type { ReportChunk, ResearchDocument } from '../../shared/types';
/** 文档内容作为不可信证据；页码跟随切片，保留原文而不改写数字。 */
export function documentChunks(
  text: string,
  title: string,
  date: string,
  url?: string,
): ReportChunk[] {
  const pages = text.split(/\f|\n\s*---\s*\n/);
  return pages.flatMap((page, p) => {
    const chunks: ReportChunk[] = [];
    for (let start = 0; start < page.length; start += 1800) {
      const content = page.slice(start, start + 2000).trim();
      if (content)
        chunks.push({
          text: content,
          docTitle: title,
          docDate: date,
          url,
          position: `p.${p + 1} · ${Math.floor(start / 1800) + 1}`,
        });
    }
    return chunks;
  });
}
export function retrieveLocalDocuments(
  docs: ResearchDocument[],
  symbol: string,
  question: string,
): ReportChunk[] {
  const terms = question.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]/g) ?? [];
  const ranked = docs
    .filter((d) => d.symbol === symbol)
    .flatMap((d) => d.chunks)
    .map((chunk) => ({
      chunk,
      score: terms.reduce(
        (sum, term) => sum + (chunk.text.toLowerCase().includes(term) ? 1 : 0),
        0,
      ),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked.slice(0, 6).map((x) => x.chunk);
}
export async function extractPdf(file: File): Promise<string> {
  if (file.size > 40 * 1024 * 1024) throw new Error('PDF exceeds 40 MB');
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await task.promise;
  try {
    if (pdf.numPages > 1000) throw new Error('PDF exceeds 1000 pages');
    const pages: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((item) => ('str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : ''))
          .join(''),
      );
      page.cleanup();
    }
    const text = pages.join('\f');
    if (!text.trim()) throw new Error('PDF contains no extractable text; OCR required');
    return text;
  } finally {
    await task.destroy();
  }
}
