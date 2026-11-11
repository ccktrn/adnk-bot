import { ChatInputCommandInteraction, GuildMember, Message, MessageFlags } from 'discord.js';
import { getVoiceConnection, joinVoiceChannel, VoiceConnectionStatus } from '@discordjs/voice';
import { ConfigRepository } from '../repositories/config-repository';
import { MusicManager } from '../lib/music-player';
import { YomiageManager } from '../lib/yomiage-player';
import { monitorVoiceConnection } from '../lib/voice-connection';
import { waitForVoicevox } from '../lib/voicevox-client';

const DEFAULT_SPEAKER_ID = Number(process.env.YOMIAGE_SPEAKER_ID || '1');

function normalize(text: string) {
  const normalized = text.replace(/https?:\/\/\S+/g, 'URL省略').replace(/```[\s\S]*?```/g, 'コード省略').replace(/<a?:\w+:\d+>/g, '').trim();
  return normalized.length > 200 ? `${normalized.slice(0, 200)}、以下省略` : normalized;
}

export async function handleYomiage(interaction: ChatInputCommandInteraction, guildId: string, repo: ConfigRepository) {
  const current = repo.getYomiageConfig(guildId);
  if (current?.yomiage_enabled) {
    repo.setYomiageConfig(guildId, false, null, null, current.yomiage_speaker_id);
    YomiageManager.stop(guildId);
    await interaction.reply('🔇 読み上げを無効にしました。');
    return;
  }
  const member = interaction.member as GuildMember;
  const voiceChannel = member.voice.channel;
  if (!voiceChannel || !interaction.channel) {
    await interaction.reply({ content: '❌ 読み上げを有効にするには、VCに参加してテキストチャンネルで実行してください。', flags: [MessageFlags.Ephemeral] });
    return;
  }
  const configuredVoiceChannelId = repo.getConfig(guildId)?.vc_id;
  if (!configuredVoiceChannelId || voiceChannel.id !== configuredVoiceChannelId) {
    await interaction.reply({ content: '❌ `/adnk set-vc` で登録されたボイスチャンネル内から実行してください。', flags: [MessageFlags.Ephemeral] });
    return;
  }
  if (MusicManager.hasActivePlayback()) {
    await interaction.reply({ content: '❌ 音楽再生中は読み上げを有効にできません。', flags: [MessageFlags.Ephemeral] });
    return;
  }
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  if (!await waitForVoicevox()) {
    await interaction.editReply('❌ VOICEVOX ENGINE の起動を確認できませんでした。しばらく待ってから再試行してください。');
    return;
  }
  let connection = getVoiceConnection(guildId);
  if (connection && connection.joinConfig.channelId !== voiceChannel.id) connection.destroy();
  connection = getVoiceConnection(guildId);
  if (!connection) {
    connection = joinVoiceChannel({ channelId: voiceChannel.id, guildId, adapterCreator: voiceChannel.guild.voiceAdapterCreator, selfMute: false });
    monitorVoiceConnection(connection);
  }
  repo.setYomiageConfig(guildId, true, interaction.channel.id, voiceChannel.id, current?.yomiage_speaker_id ?? DEFAULT_SPEAKER_ID);
  await interaction.editReply(`🔊 <#${interaction.channel.id}> のメッセージを <#${voiceChannel.id}> で読み上げます。`);
}

export async function handleYomiageMessage(message: Message, repo: ConfigRepository) {
  if (!message.guild || message.author.bot) return;
  const config = repo.getYomiageConfig(message.guild.id);
  if (!config?.yomiage_enabled || config.yomiage_text_channel_id !== message.channel.id) return;
  if (MusicManager.hasActivePlayback()) return;
  const connection = getVoiceConnection(message.guild.id);
  if (!connection || connection.state.status !== VoiceConnectionStatus.Ready || connection.joinConfig.channelId !== config.yomiage_voice_channel_id) return;
  const text = normalize(message.content);
  if (!text) return;
  YomiageManager.enqueue(message.guild.id, { text, speakerId: config.yomiage_speaker_id ?? DEFAULT_SPEAKER_ID, connection });
}
