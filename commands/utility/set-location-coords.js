import { SlashCommandBuilder } from 'discord.js';

export default {
	data: new SlashCommandBuilder()
		.setName('set-location-coords')
		.setDescription('Sets location marker for current user in the DisWorld map in this channel by lat/long coordinates')
		.addNumberOption(option =>
			option
				.setName('latitude')
				.setDescription('Latitude')
				.setRequired(true)
		)
		.addNumberOption(option =>
			option
				.setName('longitude')
				.setDescription('Longitude')
				.setRequired(true)
		)
};