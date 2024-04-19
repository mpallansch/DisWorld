import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export default {
	data: new SlashCommandBuilder()
		.setName('create-map')
		.setDescription('Creates a DisWorld map in this channel to show user submitted locations')
	  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
};