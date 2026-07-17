import { ChatInputCommandInteraction, GuildMember, MessageFlags, GuildTextBasedChannel } from 'discord.js';
import { MusicManager } from '../lib/music-player';
import { getVideoInfo } from '../lib/yt-dlp';
import { joinVoiceChannel, getVoiceConnection } from '@discordjs/voice';

export async function handlePlay(interaction: ChatInputCommandInteraction, guildId: string) {
  const url = interaction.options.getString('url', true);
  const member = interaction.member as GuildMember;
  const voiceChannel = member.voice?.channel;

  if (!voiceChannel) {
    await interaction.reply({ content: '❌ 音楽を再生するには、先にボイスチャンネルに入室してください。', flags: [MessageFlags.Ephemeral] });
    return;
  }

  await interaction.deferReply();

  try {
    const videoInfo = await getVideoInfo(url);
    const song = {
      title: videoInfo.title,
      url: videoInfo.url,
      streamUrl: videoInfo.streamUrl,
      requestedBy: interaction.user.displayName || interaction.user.username,
    };

    let connection = getVoiceConnection(guildId);
    if (!connection || connection.joinConfig.channelId !== voiceChannel.id) {
      connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guildId,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfMute: false,
      });
    }

    const queue = MusicManager.getQueue(guildId);
    queue.textChannel = interaction.channel as GuildTextBasedChannel;
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
  const queue = MusicManager.getQueue(guildId);
  if (!queue.isPlaying) {
    await interaction.reply({ content: '❌ 現在再生中の曲はありません。', flags: [MessageFlags.Ephemeral] });
    return;
  }
  queue.skip();
  await interaction.reply({ content: '⏭️ 曲をスキップしました。' });
}

export async function handleStop(interaction: ChatInputCommandInteraction, guildId: string) {
  const queue = MusicManager.getQueue(guildId);
  queue.stop();
  await interaction.reply({ content: '⏹️ 再生を停止し、キューをクリアしました。' });
}

export async function handleQueue(interaction: ChatInputCommandInteraction, guildId: string) {
  const queue = MusicManager.getQueue(guildId);
  
  if (queue.songs.length === 0) {
    await interaction.reply({ content: '📭 現在キューは空です。', flags: [MessageFlags.Ephemeral] });
    return;
  }

  const current = queue.songs[0];
  let msg = `▶️ **再生中:**\n${current.title} (リクエスト: ${current.requestedBy})\n\n`;

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
