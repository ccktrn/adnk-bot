import {
  VoiceConnection,
  VoiceConnectionState,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import { logger } from './logger';

const RECONNECT_DELAY_MS = 1_000;
const RECONNECT_READY_TIMEOUT_MS = 10_000;
const MAX_REJOIN_ATTEMPTS = 3;

const monitoredConnections = new WeakSet<VoiceConnection>();
const pendingReconnects = new WeakSet<VoiceConnection>();

export function isReadyForChannel(connection: VoiceConnection | undefined, channelId: string): boolean {
  return connection?.joinConfig.channelId === channelId
    && connection.state.status === VoiceConnectionStatus.Ready;
}

function disconnectDetail(state: VoiceConnectionState): string {
  if (state.status !== VoiceConnectionStatus.Disconnected) return '';

  return 'closeCode' in state
    ? ` closeCode=${state.closeCode}`
    : ` reason=${state.reason}`;
}

function scheduleReconnect(connection: VoiceConnection, guildId: string): void {
  if (pendingReconnects.has(connection)) return;
  pendingReconnects.add(connection);

  setTimeout(() => {
    pendingReconnects.delete(connection);

    if (connection.state.status === VoiceConnectionStatus.Ready
      || connection.state.status === VoiceConnectionStatus.Destroyed) {
      return;
    }

    if (connection.rejoinAttempts >= MAX_REJOIN_ATTEMPTS) {
      logger.error(
        `[Voice] Rejoin failed ${connection.rejoinAttempts} times for guild ${guildId}; destroying stale connection.`,
      );
      connection.destroy();
      return;
    }

    logger.warn(
      `[Voice] Rejoining guild ${guildId} after disconnect (attempt ${connection.rejoinAttempts + 1}/${MAX_REJOIN_ATTEMPTS}).`,
    );
    if (!connection.rejoin()) {
      logger.error(`[Voice] Could not start rejoin for guild ${guildId}; destroying stale connection.`);
      connection.destroy();
      return;
    }

    const rejoinAttempt = connection.rejoinAttempts;
    setTimeout(() => {
      if (connection.rejoinAttempts !== rejoinAttempt
        || connection.state.status === VoiceConnectionStatus.Ready
        || connection.state.status === VoiceConnectionStatus.Destroyed) {
        return;
      }

      logger.warn(
        `[Voice] Rejoin for guild ${guildId} did not become ready within ${RECONNECT_READY_TIMEOUT_MS}ms.`,
      );
      scheduleReconnect(connection, guildId);
    }, RECONNECT_READY_TIMEOUT_MS);
  }, RECONNECT_DELAY_MS);
}

/**
 * Record voice lifecycle events and retry transient Discord voice disconnects.
 * A connection that cannot be rejoined is destroyed so callers can create a new one.
 */
export function monitorVoiceConnection(connection: VoiceConnection): void {
  if (monitoredConnections.has(connection)) return;
  monitoredConnections.add(connection);

  const guildId = connection.joinConfig.guildId;
  connection.on('error', error => {
    logger.error(`[Voice] Connection error for guild ${guildId}:`, error);
  });

  connection.on('stateChange', (oldState, newState) => {
    logger.log(
      `[Voice] Connection state for guild ${guildId}: ${oldState.status} -> ${newState.status}${disconnectDetail(newState)}`,
    );

    if (newState.status !== VoiceConnectionStatus.Disconnected) {
      return;
    }
    scheduleReconnect(connection, guildId);
  });
}
