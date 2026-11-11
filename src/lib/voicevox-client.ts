const voicevoxBaseUrl = process.env.VOICEVOX_BASE_URL || 'http://voicevox:50021';
const SYNTHESIS_TIMEOUT_MS = 20_000;

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

export async function synthesizeVoicevox(text: string, speakerId: number): Promise<Buffer> {
  const queryResponse = await fetch(`${voicevoxBaseUrl}/audio_query?text=${encodeURIComponent(text)}&speaker=${speakerId}`, {
    method: 'POST',
    signal: AbortSignal.timeout(SYNTHESIS_TIMEOUT_MS),
  });
  if (!queryResponse.ok) throw new Error(`VOICEVOX audio_query failed: ${queryResponse.status}`);
  const query = await queryResponse.json();
  const synthesisResponse = await fetch(`${voicevoxBaseUrl}/synthesis?speaker=${speakerId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
    signal: AbortSignal.timeout(SYNTHESIS_TIMEOUT_MS),
  });
  if (!synthesisResponse.ok) throw new Error(`VOICEVOX synthesis failed: ${synthesisResponse.status}`);
  return Buffer.from(await synthesisResponse.arrayBuffer());
}
