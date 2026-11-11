import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { SlashCmd } from '../type';
import { ConfigRepository } from '../repositories/config-repository';
import { handleLoop, handlePlay, handleSkip, handleStop, handleQueue } from '../handlers/music';
import { handleSetSoundboard, handleUnsetSoundboard, handleSetVc, handleUnsetVc } from '../handlers/adnkConfig';
import { handleYomiage } from '../handlers/yomiage';

const repo = new ConfigRepository();

const adnkCmd: SlashCmd = {
  builder: new SlashCommandBuilder()
    .setName('adnk')
    .setDescription('Adnk Botの設定コマンド')
    .addSubcommand(sub => sub
      .setName('set-soundboard')
      .setDescription('サウンドボード名を設定します')
      .addStringOption(opt => opt.setName('name').setDescription('サウンドボードの名前').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('unset-soundboard')
      .setDescription('サウンドボード設定を解除します')
    )
    .addSubcommand(sub => sub
      .setName('set-vc')
      .setDescription('このコマンドを実行したボイスチャンネルを自動参加対象に登録します')
    )
    .addSubcommand(sub => sub
      .setName('unset-vc')
      .setDescription('ボイスチャンネルの登録を解除します')
    )
    .addSubcommand(sub => sub
      .setName('play')
      .setDescription('YouTubeなどのURLから音楽を再生します')
      .addStringOption(opt => opt.setName('url').setDescription('再生する動画・音楽のURL').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('skip')
      .setDescription('現在再生中の曲をスキップします')
    )
    .addSubcommand(sub => sub
      .setName('stop')
      .setDescription('再生を停止し、キューをクリアします')
    )
    .addSubcommand(sub => sub
      .setName('queue')
      .setDescription('現在の再生キュー（順番待ちリスト）を表示します')
    )
    .addSubcommand(sub => sub
      .setName('loop')
      .setDescription('現在のキュー（再生中を含む）のループを切り替えます')
    )
    .addSubcommand(sub => sub
      .setName('yomiage')
      .setDescription('このチャンネルの読み上げを有効・無効にします')
    ) as unknown as any,

  execute: async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    
    const subCmd = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    
    if (!guildId) {
      await interaction.reply({ content: 'このコマンドはサーバー内でのみ使用できます。', flags: [MessageFlags.Ephemeral] });
      return;
    }

    switch (subCmd) {
      case 'set-soundboard':
        await handleSetSoundboard(interaction, guildId, repo);
        break;
      case 'unset-soundboard':
        await handleUnsetSoundboard(interaction, guildId, repo);
        break;
      case 'set-vc':
        await handleSetVc(interaction, guildId, repo);
        break;
      case 'unset-vc':
        await handleUnsetVc(interaction, guildId, repo);
        break;
      case 'play':
        await handlePlay(interaction, guildId, repo);
        break;
      case 'skip':
        await handleSkip(interaction, guildId);
        break;
      case 'stop':
        await handleStop(interaction, guildId);
        break;
      case 'queue':
        await handleQueue(interaction, guildId);
        break;
      case 'loop':
        await handleLoop(interaction, guildId);
        break;
      case 'yomiage':
        await handleYomiage(interaction, guildId, repo);
        break;
      default:
        await interaction.reply({ content: '不明なサブコマンドです。', flags: [MessageFlags.Ephemeral] });
    }
  }
};

export default adnkCmd;
