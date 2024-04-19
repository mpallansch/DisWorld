import { SlashCommandBuilder } from 'discord.js';

export default {
	data: new SlashCommandBuilder()
		.setName('set-location-address')
		.setDescription('Sets location marker for current user in the DisWorld map in this channel by address')
		.addStringOption(option =>
			option
				.setName('address')
				.setDescription('Address (accepts partial)')
				.setRequired(true)
		)
		.addStringOption(option =>
			option
				.setName('country')
				.setDescription('Country (two letter country code)')
		)
};