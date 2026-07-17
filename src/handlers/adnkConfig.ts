import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { ConfigRepository } from '../repositories/config-repository';

export async function handleSetSoundboard(interaction: ChatInputCommandInteraction, guildId: string, repo: ConfigRepository) {
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

export async function handleUnsetSoundboard(interaction: ChatInputCommandInteraction, guildId: string, repo: ConfigRepository) {
  repo.setSoundboardId(guildId, null);
  await interaction.reply({ content: `✅ サウンドボードの設定を解除しました。` });
}

export async function handleSetVc(interaction: ChatInputCommandInteraction, guildId: string, repo: ConfigRepository) {
  const channel = interaction.channel;
  if (!channel || !channel.isVoiceBased()) {
    await interaction.reply({ content: '❌ このコマンドはボイスチャンネルの専用テキストチャット内で実行してください。', flags: [MessageFlags.Ephemeral] });
    return;
  }

  const vc = channel;
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

export async function handleUnsetVc(interaction: ChatInputCommandInteraction, guildId: string, repo: ConfigRepository) {
  repo.setVcId(guildId, null);
  await interaction.reply({ content: `✅ ボイスチャンネルの登録を解除しました。` });
}
