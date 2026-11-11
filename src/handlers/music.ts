import { ChatInputCommandInteraction, GuildMember, MessageFlags, GuildTextBasedChannel } from 'discord.js';
import { MusicManager } from '../lib/music-player';
import { getVideoInfo } from '../lib/yt-dlp';
import { joinVoiceChannel, getVoiceConnection } from '@discordjs/voice';
import { isReadyForChannel, monitorVoiceConnection } from '../lib/voice-connection';
import { isYtDlpUpdateInProgress } from '../lib/yt-dlp-updater';
import { YomiageManager } from '../lib/yomiage-player';
import { ConfigRepository } from '../repositories/config-repository';

function isInQueueVoiceChannel(interaction: ChatInputCommandInteraction, guildId: string): boolean {
  const queue = MusicManager.getQueue(guildId);
  const member = interaction.member as GuildMember;
  const queueChannelId = queue.voiceChannel?.id ?? queue.connection?.joinConfig.channelId;
  return Boolean(queueChannelId && member.voice.channelId === queueChannelId);
}

async function rejectWhileYtDlpUpdating(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!isYtDlpUpdateInProgress()) return false;

  await interaction.reply({
    content: '⏳ yt-dlp を更新中です。音楽コマンドはまもなく利用できます。',
    flags: [MessageFlags.Ephemeral],
  });
  return true;
}

export async function handlePlay(interaction: ChatInputCommandInteraction, guildId: string, repo: ConfigRepository) {
  if (await rejectWhileYtDlpUpdating(interaction)) return;
  if (YomiageManager.hasActive(guildId)) {
    await interaction.reply({ content: '❌ 読み上げ中は音楽を再生できません。', flags: [MessageFlags.Ephemeral] });
    return;
  }

  const url = interaction.options.getString('url', true);
  const member = interaction.member as GuildMember;
  const voiceChannel = member.voice?.channel;

  if (!voiceChannel) {
    await interaction.reply({ content: '❌ 音楽を再生するには、先にボイスチャンネルに入室してください。', flags: [MessageFlags.Ephemeral] });
    return;
  }
  const configuredVoiceChannelId = repo.getConfig(guildId)?.vc_id;
  if (!configuredVoiceChannelId || voiceChannel.id !== configuredVoiceChannelId) {
    await interaction.reply({ content: '❌ `/adnk set-vc` で登録されたボイスチャンネル内から実行してください。', flags: [MessageFlags.Ephemeral] });
    return;
  }

  await interaction.deferReply();

  try {
    const queue = MusicManager.getQueue(guildId);
    const existingConnection = getVoiceConnection(guildId);
    if (queue.songs.length > 0
      && existingConnection
      && existingConnection.joinConfig.channelId !== voiceChannel.id) {
      await interaction.editReply({ content: '❌ 再生中のキューがあります。Bot と同じボイスチャンネルから操作してください。' });
      return;
    }

    const videoInfo = await getVideoInfo(url);
    if (isYtDlpUpdateInProgress()) {
      await interaction.editReply({ content: '⏳ yt-dlp の更新が始まったため、再生要求を受け付けませんでした。完了後にもう一度実行してください。' });
      return;
    }

    const song = {
      title: videoInfo.title,
      url: videoInfo.url,
      streamUrl: videoInfo.streamUrl,
      requestedBy: interaction.user.displayName || interaction.user.username,
    };

    let connection = getVoiceConnection(guildId);
    if (connection && !isReadyForChannel(connection, voiceChannel.id)) {
      connection.destroy();
      connection = undefined;
    }
    if (!connection) {
      connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guildId,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfMute: false,
      });
      monitorVoiceConnection(connection);
    }

    queue.textChannel = interaction.channel as GuildTextBasedChannel;
    queue.voiceChannel = voiceChannel;
    queue.connection = connection;
    queue.songs.push(song);

    await interaction.editReply({ content: `🎵 キューに追加しました: **${song.title}**` });

    if (!queue.isPlaying) {
      queue.playNext();
    }
  } catch (error) {
    await interaction.editReply({ content: '❌ 動画情報の取得または再生に失敗しました。URLが正しいか確認してください。' });
  }
}

export async function handleSkip(interaction: ChatInputCommandInteraction, guildId: string) {
  if (await rejectWhileYtDlpUpdating(interaction)) return;

  const queue = MusicManager.getQueue(guildId);
  if (!queue.isPlaying) {
    await interaction.reply({ content: '❌ 現在再生中の曲はありません。', flags: [MessageFlags.Ephemeral] });
    return;
  }
  if (!isInQueueVoiceChannel(interaction, guildId)) {
    await interaction.reply({ content: '❌ Bot と同じボイスチャンネルから操作してください。', flags: [MessageFlags.Ephemeral] });
    return;
  }
  queue.skip();
  await interaction.reply({ content: '⏭️ 曲をスキップしました。' });
}

export async function handleStop(interaction: ChatInputCommandInteraction, guildId: string) {
  if (await rejectWhileYtDlpUpdating(interaction)) return;

  const queue = MusicManager.getQueue(guildId);
  if (queue.songs.length > 0 && !isInQueueVoiceChannel(interaction, guildId)) {
    await interaction.reply({ content: '❌ Bot と同じボイスチャンネルから操作してください。', flags: [MessageFlags.Ephemeral] });
    return;
  }
  queue.stop();
  await interaction.reply({ content: '⏹️ 再生を停止し、キューをクリアしました。' });
}

export async function handleLoop(interaction: ChatInputCommandInteraction, guildId: string) {
  if (await rejectWhileYtDlpUpdating(interaction)) return;

  const queue = MusicManager.getQueue(guildId);
  if (queue.songs.length > 0 && !isInQueueVoiceChannel(interaction, guildId)) {
    await interaction.reply({ content: '❌ Bot と同じボイスチャンネルから操作してください。', flags: [MessageFlags.Ephemeral] });
    return;
  }
  const result = queue.toggleLoop();

  if (result === 'empty') {
    await interaction.reply({ content: '❌ ループするキューがありません。', flags: [MessageFlags.Ephemeral] });
    return;
  }

  await interaction.reply({
    content: result === 'enabled'
      ? '🔁 現在のキュー（再生中を含む）のループを有効にしました。もう一度 `/adnk loop` を実行すると解除します。'
      : '🔁 キューのループを解除しました。'
  });
}

export async function handleQueue(interaction: ChatInputCommandInteraction, guildId: string) {
  if (await rejectWhileYtDlpUpdating(interaction)) return;

  const queue = MusicManager.getQueue(guildId);
  
  if (queue.songs.length === 0) {
    await interaction.reply({ content: '📭 現在キューは空です。', flags: [MessageFlags.Ephemeral] });
    return;
  }

  const current = queue.songs[0];
  const loopStatus = queue.isLoopEnabled() ? ' 🔁 ループ中' : '';
  let msg = `▶️ **再生中:**${loopStatus}\n${current.title} (リクエスト: ${current.requestedBy})\n\n`;

  if (queue.songs.length > 1) {
    msg += `**順番待ち (${queue.songs.length - 1}曲):**\n`;
    const upNext = queue.songs.slice(1, 11);
    upNext.forEach((song, index) => {
      msg += `${index + 1}. ${song.title} (リクエスト: ${song.requestedBy})\n`;
    });

    if (queue.songs.length > 11) {
      msg += `...他 ${queue.songs.length - 11} 曲\n`;
    }
  } else {
    msg += `*順番待ちの曲はありません*`;
  }

  await interaction.reply({ content: msg });
}
