import { SlashCommandBuilder } from 'discord.js';

export default {
	data: new SlashCommandBuilder()
		.setName('remove-map')
		.setDescription('Removes DisWorld map in this channel')
};