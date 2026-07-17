import { Events, OAuth2Scopes, MessageFlags } from "discord.js";
import * as dotenv from "dotenv";
import { generateDependencyReport } from '@discordjs/voice';
import { handleVoiceStateUpdate } from "./handlers/onVoiceStateUpdate";
import { handleMessageCreate } from "./handlers/onMessageCreate";
import { logger } from "./lib/logger";
import createCmdMap from "./lib/create-cmd-map";
import DisbotClient from "./core/disbot-client";

dotenv.config();


// Create a new Discord client instance
const client = DisbotClient.createClient();

const cmdMap = createCmdMap(); // Create the command map from the cmds directory

// clientReady
client.once(Events.ClientReady, readyClient => {
  logger.log(generateDependencyReport());
  // generate an invite link for the bot
  const inviteLink = readyClient.generateInvite({
    scopes: [
      OAuth2Scopes.Bot,
      OAuth2Scopes.ApplicationsCommands,
    ],
    permissions: [
      'SendMessages',
      'ManageMessages',
      'ReadMessageHistory',
      'ViewChannel',
      'Connect',
      'Speak',
      'UseSoundboard',
    ]
  });
  logger.log(`${"-".repeat(10)}\n Invite link for the bot :\n${inviteLink} \n${"-".repeat(10)}`);

  // const devGuildId = process.env.DISCORD_DEV_GUILD_ID 
  // if (devGuildId){ 
  //   DisbotClient.deployCmdsForGuild(cmdMap, devGuildId) // if dev-guild is set, deploy commands instantly to only that guild
  // } else {
  //   DisbotClient.deployCmds(cmdMap)// Register commands globally (may take up to 1 hour to reflect)
  // }
  for (const guild of readyClient.guilds.cache.values()) { // Register commands instantly to all joined guilds instantly
    DisbotClient.deployCmdsForGuild(cmdMap, guild.id);
  }
});



// Register commands when the bot joins a new guild (discord-server)
client.on(Events.GuildCreate, async guild => {
  logger.log(`Joined a new guild: ${guild.name} (id: ${guild.id}).`);
  await DisbotClient.deployCmdsForGuild(cmdMap, guild.id);
});





// Listen for voice state updates
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  await handleVoiceStateUpdate(oldState, newState);
});

// Listen for new messages (LLM integration)
client.on(Events.MessageCreate, async message => {
  await handleMessageCreate(message);
});

// Listen for interactions e.g. slash commands
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;

  const command = cmdMap.get(interaction.commandName);
  if (!command) {
    await interaction.reply({ content: `Unknown command: ${interaction.commandName}`, ephemeral: true });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    logger.error(`Error executing command ${interaction.commandName}:`, error);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'There was an error while executing this command!', flags: [MessageFlags.Ephemeral] });
      } else {
        await interaction.reply({ content: 'There was an error while executing this command!', flags: [MessageFlags.Ephemeral] });
      }
    } catch (e) {
      logger.error('Failed to send fallback error message:', e);
    }
  }
});


DisbotClient.login();