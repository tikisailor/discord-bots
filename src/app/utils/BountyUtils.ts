import { GuildMember, Message, TextChannel } from 'discord.js';
import { BountyReward } from '../types/bounty/BountyReward';
import channelIds from '../service/constants/channelIds';
import ValidationError from '../errors/ValidationError';
import { URL } from 'url';
import envUrls from '../service/constants/envUrls';
import BountyMessageNotFound from '../errors/BountyMessageNotFound';
import ServiceUtils from './ServiceUtils';

/**
 * Utilities file for bounty commands
 */
const BountyUtils = {

	/**
	 * Validate the given string is a bounty id
	 * @param guildMember
	 * @param bountyId
	 */
	async validateBountyId(guildMember: GuildMember, bountyId: string): Promise<any> {
		const BOUNTY_ID_REGEX = /^[a-f\d]{1,24}$/i;
		if ((bountyId == null || !BOUNTY_ID_REGEX.test(bountyId))) {
			await guildMember.send({ content: `<@${guildMember.user.id}>\n` +
				'Please enter a valid bounty hash ID: \n' +
				' - can be found on bountyboard website\n' +
				` - ${envUrls.BOUNTY_BOARD_URL}` });
			throw new ValidationError('Please try another bountyId.');
		}
	},

	/**
	 * Validate the bounty types that are allowed
	 * @param guildMember
	 * @param bountyType
	 */
	async validateBountyType(guildMember: GuildMember, bountyType: string): Promise<void> {
		const ALLOWED_BOUNTY_TYPES = ['OPEN', 'IN_PROGRESS', 'CREATED_BY_ME', 'CLAIMED_BY_ME', 'DRAFT_BY_ME'];
		if (bountyType == null || !ALLOWED_BOUNTY_TYPES.includes(bountyType)) {
			await guildMember.send({
				content: `<@${guildMember.user.id}>\n` +
					'Please enter a valid bounty type: \n' +
					' - OPEN\n' +
					' - CREATED_BY_ME\n' +
					' - CLAIMED_BY_ME',
			}).catch(console.log);
			throw new ValidationError('Please try another bounty type.');
		}
	},

	async validateSummary(guildMember: GuildMember, summary: string): Promise<any> {
		const CREATE_SUMMARY_REGEX = /^[\w\s\W]{1,4000}$/;
		if (summary == null || !CREATE_SUMMARY_REGEX.test(summary)) {
			await guildMember.send({
				content: `<@${guildMember.user.id}>\n` +
					'Please enter a valid summary: \n' +
					'- 4000 characters maximum\n ' +
					'- alphanumeric\n ' +
					'- special characters: .!@#$%&,?',
			});
			throw new ValidationError('invalid summary');
		}
	},

	async validateReward(guildMember: GuildMember, reward: BountyReward): Promise<void> {
		const ALLOWED_CURRENCIES = ['BANK'];
		const allowedRegex = new RegExp(ALLOWED_CURRENCIES.join('|'), 'i');
		const MAXIMUM_REWARD = 100000000.00;

		if (isNaN(reward.amount) || reward.amount <= 0 || reward.amount > MAXIMUM_REWARD
			|| !allowedRegex.test(reward.currencySymbol)) {
			await guildMember.send({
				content: `<@${guildMember.user.id}>\n` +
					'Please enter a valid reward value: \n ' +
					'- 100 million maximum currency\n ' +
					'- accepted currencies: ETH, BANK',
			});
			throw new ValidationError('Please try another reward.');
		}
	},

	validateNumberOfCopies(guildMember: GuildMember, copies: number): void {
		ServiceUtils.validateLevel2AboveMembers(guildMember);

		if (copies > 100) {
			throw new ValidationError('Max number of copies is `100`.');
		}
	},

	async validateTitle(guildMember: GuildMember, title: string): Promise<any> {
		const CREATE_TITLE_REGEX = /^[\w\s\W]{1,250}$/;
		if (title == null || !CREATE_TITLE_REGEX.test(title)) {
			await guildMember.send({
				content: `<@${guildMember.user.id}>\n` +
					'Please enter a valid title: \n' +
					'- 250 characters maximum\n ' +
					'- alphanumeric\n ' +
					'- special characters: .!@#$%&,?',
			});
			throw new ValidationError('Please try another title.');
		}
	},

	async validateCriteria(guildMember: GuildMember, criteria: string): Promise<any> {
		const CREATE_CRITERIA_REGEX = /^[\w\s\W]{1,1000}$/;
		if (criteria == null || !CREATE_CRITERIA_REGEX.test(criteria)) {
			await guildMember.send({
				content: `<@${guildMember.user.id}>\n` +
					'Please enter a valid criteria: \n' +
					'- 1000 characters maximum\n ' +
					'- alphanumeric\n ' +
					'- special characters: .!@#$%&,?',
			});
			throw new ValidationError('Please try another criteria.');
		}
	},

	validateDate(guildMember: GuildMember, date: string): Date {
		try {
			return new Date(date + 'T00:00:00.000Z');
		} catch (e) {
			console.log(e);
			throw new ValidationError('Please try `UTC` date in format yyyy-mm-dd, i.e 2021-08-15');
		}
	},

	async validateUrl(guildMember: GuildMember, url: string): Promise<any> {
		try {
			new URL(url);
		} catch (e) {
			await guildMember.send({
				content: `<@${guildMember.user.id}>\n` +
					'Please enter a valid criteria: \n' +
					'- 1000 characters maximum\n ' +
					'- alphanumeric\n ' +
					'- special characters: .!@#$%&,?',
			});
			throw new ValidationError('Please try another url.');
		}
	},

	async checkBountyExists(guildMember: GuildMember, dbBountyResult: any | null, bountyId: string): Promise<any> {
		if (dbBountyResult == null) {
			console.log(`${bountyId} bounty not found in db`);
			await guildMember.send({ content: `Sorry <@${guildMember.user.id}>, we're not able to find an open bounty with ID \`${bountyId}\`.` });
			throw new ValidationError('Please try another bounty Id');
		}
		console.log(`found bounty ${bountyId} in db`);
	},

	async getBountyMessage(guildMember: GuildMember, bountyMessageId: string, message?: Message): Promise<Message> {
		if (message == null) {
			const bountyChannel: TextChannel = await guildMember.guild.channels.fetch(channelIds.bountyBoard) as TextChannel;
			return bountyChannel.messages.fetch(bountyMessageId).catch(e => {
				console.log(e);
				throw new BountyMessageNotFound('could not find bounty in discord #bounty-board channel');
			});
		} else {
			return message;
		}
	},

	getBountyIdFromEmbedMessage(message: Message): string {
		return message.embeds[0].fields[0].value;
	},

	formatBountyAmount(amount: number, scale: number): string {
		return (amount / 10 ** scale).toString();
	},

	getDateFromISOString(date: string): Date {
		return new Date(date);
	},
};

export default BountyUtils;