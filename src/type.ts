import { AutocompleteInteraction, CacheType, Interaction, SharedSlashCommand } from 'discord.js';

export type SlashCmd = {
  builder: SharedSlashCommand; // SlashCommandBuilder-like object
  execute: (interaction: Interaction<CacheType>) => Promise<void>; 
  autocomplete?: (interaction: AutocompleteInteraction<CacheType>) => Promise<void>;
}
