const voicevoxBaseUrl = process.env.VOICEVOX_BASE_URL || 'http://voicevox:50021';
const SYNTHESIS_TIMEOUT_MS = 20_000;
const SPEAKERS_TIMEOUT_MS = 3_000;
const SPEAKERS_CACHE_TTL_MS = 10 * 60 * 1_000;

type VoicevoxSpeaker = { name?: unknown; styles?: Array<{ id?: unknown; name?: unknown }> };
export type VoicevoxStyle = { id: number; speakerName: string; styleName: string };

let speakerStylesCache: VoicevoxStyle[] | undefined;
let speakerStylesCachedAt = 0;
let speakerStylesRequest: Promise<VoicevoxStyle[]> | undefined;

export async function waitForVoicevox(timeoutMs = 30_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${voicevoxBaseUrl}/speakers`, { signal: AbortSignal.timeout(3_000) });
      if (response.ok) return true;
    } catch {
      // エンジンの起動完了まで待機する。
    }
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
  return false;
}

export async function getVoicevoxSpeakerStyles(): Promise<VoicevoxStyle[]> {
  if (speakerStylesCache && Date.now() - speakerStylesCachedAt < SPEAKERS_CACHE_TTL_MS) return speakerStylesCache;
  if (!speakerStylesRequest) {
    speakerStylesRequest = (async () => {
      const response = await fetch(`${voicevoxBaseUrl}/speakers`, { signal: AbortSignal.timeout(SPEAKERS_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`VOICEVOX speakers failed: ${response.status}`);
      const speakers = await response.json() as VoicevoxSpeaker[];
      const styles = speakers.flatMap(speaker => {
        const speakerName = speaker.name;
        if (typeof speakerName !== 'string' || !Array.isArray(speaker.styles)) return [];
        return speaker.styles.flatMap(style => {
          const styleName = style.name;
          return typeof style.id === 'number' && typeof styleName === 'string'
            ? [{ id: style.id, speakerName, styleName }]
            : [];
        });
      });
      speakerStylesCache = styles;
      speakerStylesCachedAt = Date.now();
      return styles;
    })().finally(() => { speakerStylesRequest = undefined; });
  }
  return speakerStylesRequest!;
}

export async function hasVoicevoxSpeaker(speakerId: number): Promise<boolean> {
  const styles = await getVoicevoxSpeakerStyles();
  return styles.some(style => style.id === speakerId);
}

function createRequestController(parentSignal?: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (parentSignal?.aborted) {
    controller.abort();
  } else {
    parentSignal?.addEventListener('abort', abort, { once: true });
  }

  const timeout = setTimeout(() => controller.abort(), SYNTHESIS_TIMEOUT_MS);
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeout);
      parentSignal?.removeEventListener('abort', abort);
    },
  };
}

export async function synthesizeVoicevox(text: string, speakerId: number, speedScale: number, parentSignal?: AbortSignal): Promise<Buffer> {
  const queryRequest = createRequestController(parentSignal);
  let query: Record<string, unknown>;
  try {
    const queryResponse = await fetch(`${voicevoxBaseUrl}/audio_query?text=${encodeURIComponent(text)}&speaker=${speakerId}`, {
      method: 'POST',
      signal: queryRequest.signal,
    });
    if (!queryResponse.ok) throw new Error(`VOICEVOX audio_query failed: ${queryResponse.status}`);
    query = await queryResponse.json() as Record<string, unknown>;
  } finally {
    queryRequest.dispose();
  }

  query.speedScale = speedScale;
  const synthesisRequest = createRequestController(parentSignal);
  try {
    const synthesisResponse = await fetch(`${voicevoxBaseUrl}/synthesis?speaker=${speakerId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
      signal: synthesisRequest.signal,
    });
    if (!synthesisResponse.ok) throw new Error(`VOICEVOX synthesis failed: ${synthesisResponse.status}`);
    return Buffer.from(await synthesisResponse.arrayBuffer());
  } finally {
    synthesisRequest.dispose();
  }
}
