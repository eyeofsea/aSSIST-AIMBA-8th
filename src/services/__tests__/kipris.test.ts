import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { DOMParser as NodeDOMParser } from '@xmldom/xmldom';

import { fetchKiprisData, parseKiprisQuery } from '../kipris';

describe('parseKiprisQuery', () => {
  it('converts Gemini-formatted query strings into URL search parameters', () => {
    const params = parseKiprisQuery('ipcNumber=G06K9/62* AND inventionTitle=(이미지 AND 인식)');

    expect(params.get('ipcNumber')).toBe('G06K9/62*');
    expect(params.get('inventionTitle')).toBe('(이미지 AND 인식)');
  });

  it('retains repeated keys in the resulting search params', () => {
    const params = parseKiprisQuery('applicantName=Samsung AND applicantName=LG');

    expect(params.getAll('applicantName')).toEqual(['Samsung', 'LG']);
  });
});

describe('fetchKiprisData', () => {
  const originalConsoleError = console.error;

  beforeEach(() => {
    vi.stubGlobal('DOMParser', NodeDOMParser as unknown as typeof DOMParser);
    vi.stubGlobal('fetch', vi.fn());
    console.error = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    console.error = originalConsoleError;
  });

  it('parses XML results into KiprisSearchResult objects', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <response>
        <items>
          <item>
            <applicantName>Some Company</applicantName>
            <inventionTitle>Innovative Device</inventionTitle>
            <applicationNumber>12345</applicationNumber>
            <applicationDate>20240101</applicationDate>
          </item>
        </items>
      </response>`;

    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => xml,
    });

    const results = await fetchKiprisData('getAdvancedSearch', 'applicantName=Some Company');

    expect(results).toEqual([
      {
        company: 'Some Company',
        patentTitle: 'Innovative Device',
        applicationNumber: '12345',
        date: '20240101',
      },
    ]);

    const requestUrl = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const proxiedUrl = new URL(requestUrl);
    const originalUrl = new URL(proxiedUrl.searchParams.get('url') ?? '');
    expect(originalUrl.searchParams.get('numOfRows')).toBe('10');
  });

  it('throws a descriptive error when the API responds with an error payload', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <response>
        <error>
          <errorCode>999</errorCode>
          <errorMessage>Unknown issue</errorMessage>
        </error>
      </response>`;

    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => xml,
    });

    await expect(() => fetchKiprisData('getAdvancedSearch', 'ipcNumber=G06K9/62*')).rejects.toThrow(
      'KIPRIS API Error: [999] Unknown issue',
    );
  });

  it('converts fetch failures into localized network errors', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Failed to fetch'));

    await expect(() => fetchKiprisData('getAdvancedSearch', 'ipcNumber=G06K9/62*')).rejects.toThrow(
      '네트워크 오류가 발생했습니다. API 서버에 연결할 수 없습니다. CORS 정책 또는 네트워크 연결을 확인해주세요.',
    );
  });
});
