import { SlashCommandBuilder } from 'discord.js';

export default {
	data: new SlashCommandBuilder()
		.setName('clear-location')
		.setDescription('Removes location marker for the current user in the DisWorld map in this channel')
};