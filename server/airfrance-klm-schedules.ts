import {
  AFKL_OFFERS_URL,
  buildAfklAvailableOffersRequest,
  buildAfklHeaders,
  normalizeAfklAvailableOffers,
  type AfklNormalizedDay,
  type AfklScheduleQuery,
} from '../src/lib/rtw/official-airfrance-klm.ts';

const MAX_RESPONSE_BYTES = 3_000_000;

export interface AfklGatewayOptions {
  readonly apiKey?: string;
  readonly fetchImpl?: typeof fetch;
}

async function boundedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw new Error('AFKL response too large');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('AFKL response body missing');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error('AFKL response too large'); }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function createAfklOfficialScheduleGateway(options: AfklGatewayOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiKey = options.apiKey?.trim();
  return {
    configured: Boolean(apiKey),
    async queryDay(query: AfklScheduleQuery): Promise<AfklNormalizedDay> {
      if (!apiKey) throw new Error('AFKL official schedule gateway is not configured');
      const response = await fetchImpl(AFKL_OFFERS_URL, {
        method: 'POST',
        headers: buildAfklHeaders(apiKey, query),
        body: JSON.stringify(buildAfklAvailableOffersRequest(query)),
        redirect: 'error',
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error(`AFKL official API returned HTTP ${response.status}`);
      return normalizeAfklAvailableOffers(await boundedJson(response), query);
    },
  };
}
