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
    .setDescription('ADNK Botコマンド')
    .addSubcommandGroup(group => group
      .setName('soundboard')
      .setDescription('サウンドボード設定')
      .addSubcommand(sub => sub
        .setName('set')
        .setDescription('サウンドボード名を設定します')
        .addStringOption(opt => opt.setName('name').setDescription('サウンドボードの名前').setRequired(true))
      )
      .addSubcommand(sub => sub
        .setName('unset')
        .setDescription('サウンドボード設定を解除します')
      )
    )
    .addSubcommandGroup(group => group
      .setName('vc')
      .setDescription('ボイスチャンネル設定')
      .addSubcommand(sub => sub
        .setName('set')
        .setDescription('このチャンネルをBotの動作対象VCに登録します')
      )
      .addSubcommand(sub => sub
        .setName('unset')
        .setDescription('ボイスチャンネルの登録を解除します')
      )
    )
    .addSubcommandGroup(group => group
      .setName('music')
      .setDescription('音楽再生')
      .addSubcommand(sub => sub
        .setName('play')
        .setDescription('YouTubeなどのURLから音楽を再生します')
        .addStringOption(opt => opt.setName('url').setDescription('再生する動画・音楽のURL').setRequired(true))
      )
      .addSubcommand(sub => sub.setName('skip').setDescription('現在再生中の曲をスキップします'))
      .addSubcommand(sub => sub.setName('stop').setDescription('再生を停止し、キューをクリアします'))
      .addSubcommand(sub => sub.setName('queue').setDescription('現在の再生キューを表示します'))
      .addSubcommand(sub => sub.setName('loop').setDescription('現在のキューのループを切り替えます'))
    )
    .addSubcommand(sub => sub
      .setName('yomiage')
      .setDescription('このチャンネルの読み上げを有効・無効にします')
    ) as unknown as any,

  execute: async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    
    const group = interaction.options.getSubcommandGroup(false);
    const subCmd = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    
    if (!guildId) {
      await interaction.reply({ content: 'このコマンドはサーバー内でのみ使用できます。', flags: [MessageFlags.Ephemeral] });
      return;
    }

    if (group === 'soundboard' && subCmd === 'set') {
        await handleSetSoundboard(interaction, guildId, repo);
    } else if (group === 'soundboard' && subCmd === 'unset') {
        await handleUnsetSoundboard(interaction, guildId, repo);
    } else if (group === 'vc' && subCmd === 'set') {
        await handleSetVc(interaction, guildId, repo);
    } else if (group === 'vc' && subCmd === 'unset') {
        await handleUnsetVc(interaction, guildId, repo);
    } else if (group === 'music' && subCmd === 'play') {
        await handlePlay(interaction, guildId, repo);
    } else if (group === 'music' && subCmd === 'skip') {
        await handleSkip(interaction, guildId);
    } else if (group === 'music' && subCmd === 'stop') {
        await handleStop(interaction, guildId);
    } else if (group === 'music' && subCmd === 'queue') {
        await handleQueue(interaction, guildId);
    } else if (group === 'music' && subCmd === 'loop') {
        await handleLoop(interaction, guildId);
    } else if (!group && subCmd === 'yomiage') {
        await handleYomiage(interaction, guildId, repo);
    } else {
        await interaction.reply({ content: '不明なサブコマンドです。', flags: [MessageFlags.Ephemeral] });
    }
  }
};

export default adnkCmd;
