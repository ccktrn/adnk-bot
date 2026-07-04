import { SlashCommandBuilder, ChannelType, GuildMember, MessageFlags } from 'discord.js';
import { existsSync } from 'fs';
import { join } from 'path';
import { SlashCmd } from '../type';
import { ConfigRepository } from '../repositories/config-repository';

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
    ) as unknown as any,

  execute: async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    
    const subCmd = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    
    if (!guildId) {
      await interaction.reply({ content: 'このコマンドはサーバー内でのみ使用できます。', flags: [MessageFlags.Ephemeral] });
      return;
    }

    const channel = interaction.channel;
    if (subCmd === 'set-vc') {
      if (!channel || !channel.isVoiceBased()) {
        await interaction.reply({ content: '❌ このコマンドはボイスチャンネルの専用テキストチャット内で実行してください。', flags: [MessageFlags.Ephemeral] });
        return;
      }
    }

    if (subCmd === 'set-soundboard') {
      const name = interaction.options.getString('name', true);
      const sounds = await interaction.guild?.soundboardSounds.fetch();
      const sound = sounds?.find(s => s.name === name);
      
      const defaultSounds = ["quack", "airhorn", "cricket", "golf clap", "sad horn", "ba dum tss"];
      
      let warningMsg = '';
      if (!sound && !defaultSounds.includes(name.toLowerCase())) {
        warningMsg = `\n⚠️ **警告:** サーバー内に \`${name}\` という名前のサウンドボードが見つかりません！追加されるまでデフォルトの音が鳴ります。`;
      }
      repo.setSoundboardId(guildId, name);
      await interaction.reply({ content: `✅ サウンドボード名を \`${name}\` に設定しました。${warningMsg}` });
    } 
    else if (subCmd === 'unset-soundboard') {
      repo.setSoundboardId(guildId, null);
      await interaction.reply({ content: `✅ サウンドボードの設定を解除しました。` });
    }
    else if (subCmd === 'set-vc') {
      const vc = channel!;
      const guild = interaction.guild;
      let warningMsg = '';
      if (guild) {
        const botMember = guild.members.me || await guild.members.fetch(interaction.client.user.id);
        const channelObj = await guild.channels.fetch(vc.id).catch(() => null);
        if (channelObj && channelObj.isVoiceBased()) {
          const permissions = channelObj.permissionsFor(botMember);
          if (!permissions?.has('Connect')) {
            await interaction.reply({ content: `❌ 失敗: Botに <#${vc.id}> への「接続」権限がありません。\nチャンネルまたはサーバーの権限設定を見直してください。`, flags: [MessageFlags.Ephemeral] });
            return;
          }
          if (!permissions?.has('UseSoundboard')) {
            warningMsg += `\n⚠️ **警告:** Botに「サウンドボードを使用」権限がありません！`;
          }
        }
      }
      
      repo.setVcId(guildId, vc.id);
      await interaction.reply({ content: `✅ ボイスチャンネル <#${vc.id}> を自動参加対象に登録しました。${warningMsg}` });
    }
    else if (subCmd === 'unset-vc') {
      repo.setVcId(guildId, null);
      await interaction.reply({ content: `✅ ボイスチャンネルの登録を解除しました。` });
    }
  }
};

export default adnkCmd;
