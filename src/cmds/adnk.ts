import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { SlashCmd } from '../type';
import { ConfigRepository } from '../repositories/config-repository';
import { handleLoop, handlePlay, handleSkip, handleStop, handleQueue, handleVolume } from '../handlers/music';
import { handleSetSoundboard, handleUnsetSoundboard, handleSetVc, handleUnsetVc } from '../handlers/adnkConfig';
import { handleYomiageSpeed, handleYomiageStart, handleYomiageStop, handleYomiageVoice } from '../handlers/yomiage';
import { getVoicevoxSpeakerStyles } from '../lib/voicevox-client';

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
      .addSubcommand(sub => sub
        .setName('volume')
        .setDescription('音楽の音量を設定します（既定: レベル5）')
        .addIntegerOption(opt => opt.setName('level').setDescription('音量レベル（0〜10、5は10%）').setRequired(true).setMinValue(0).setMaxValue(10))
      )
      .addSubcommand(sub => sub.setName('skip').setDescription('現在再生中の曲をスキップします'))
      .addSubcommand(sub => sub.setName('stop').setDescription('再生を停止し、キューをクリアします'))
      .addSubcommand(sub => sub.setName('queue').setDescription('現在の再生キューを表示します'))
      .addSubcommand(sub => sub.setName('loop').setDescription('現在のキューのループを切り替えます'))
    )
    .addSubcommandGroup(group => group
      .setName('yomiage')
      .setDescription('読み上げ設定')
      .addSubcommand(sub => sub.setName('start').setDescription('このチャンネルの読み上げを有効にします'))
      .addSubcommand(sub => sub.setName('stop').setDescription('読み上げを無効にします'))
      .addSubcommand(sub => sub
        .setName('speed')
        .setDescription('読み上げ速度を設定します')
        .addNumberOption(opt => opt.setName('value').setDescription('0.5〜2.0').setRequired(true).setMinValue(0.5).setMaxValue(2))
        .addBooleanOption(opt => opt.setName('global').setDescription('サーバー既定値を変更します（省略時: false）')))
      .addSubcommand(sub => sub
        .setName('voice')
        .setDescription('読み上げ音声を設定します')
        .addStringOption(opt => opt.setName('value').setDescription('VOICEVOXの音声を選択').setRequired(true).setAutocomplete(true))
        .addBooleanOption(opt => opt.setName('global').setDescription('サーバー既定値を変更します（省略時: false）')))
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
    } else if (group === 'music' && subCmd === 'volume') {
        await handleVolume(interaction, guildId, repo);
    } else if (group === 'music' && subCmd === 'skip') {
        await handleSkip(interaction, guildId);
    } else if (group === 'music' && subCmd === 'stop') {
        await handleStop(interaction, guildId);
    } else if (group === 'music' && subCmd === 'queue') {
        await handleQueue(interaction, guildId);
    } else if (group === 'music' && subCmd === 'loop') {
        await handleLoop(interaction, guildId);
    } else if (group === 'yomiage' && subCmd === 'start') {
        await handleYomiageStart(interaction, guildId, repo);
    } else if (group === 'yomiage' && subCmd === 'stop') {
        await handleYomiageStop(interaction, guildId, repo);
    } else if (group === 'yomiage' && subCmd === 'speed') {
        await handleYomiageSpeed(interaction, guildId, repo);
    } else if (group === 'yomiage' && subCmd === 'voice') {
        await handleYomiageVoice(interaction, guildId, repo);
    } else {
        await interaction.reply({ content: '不明なサブコマンドです。', flags: [MessageFlags.Ephemeral] });
    }
  },

  autocomplete: async (interaction) => {
    if (interaction.commandName !== 'adnk' || interaction.options.getSubcommandGroup(false) !== 'yomiage' || interaction.options.getSubcommand() !== 'voice') return;
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'value' || typeof focused.value !== 'string') return;
    const query = focused.value.toLocaleLowerCase('ja-JP');
    const styles = await getVoicevoxSpeakerStyles();
    const choices = styles
      .filter(style => `${style.speakerName} ${style.styleName} ${style.id}`.toLocaleLowerCase('ja-JP').includes(query))
      .slice(0, 25)
      .map(style => ({ name: `${style.speakerName}（${style.styleName}） [${style.id}]`.slice(0, 100), value: String(style.id) }));
    await interaction.respond(choices);
  }
};

export default adnkCmd;
