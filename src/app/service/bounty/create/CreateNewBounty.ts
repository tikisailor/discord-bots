import constants from '../../constants/constants';
import BountyUtils from '../../../utils/BountyUtils';
import { AwaitMessagesOptions, DMChannel, GuildMember, Message, MessageOptions, MessageReaction } from 'discord.js';
import { finalizeBounty } from './PublishBounty';
import { Db, Int32 } from 'mongodb';
import dbInstance from '../../../utils/dbUtils';
import { deleteBountyForValidId } from '../DeleteBounty';
import { BountyCreateNew } from '../../../types/bounty/BountyCreateNew';
import ServiceUtils from '../../../utils/ServiceUtils';
import envUrls from '../../constants/envUrls';
import UpdateEditKeyBounty from '../UpdateEditKeyBounty';
import ValidationError from '../../../errors/ValidationError';

export default async (guildMember: GuildMember, params: BountyCreateNew): Promise<any> => {
	const title = params.title;
	const reward = params.reward;

	if (!ServiceUtils.isAtLeastLevel1(guildMember)) {
		throw new ValidationError('Must be at a least level 1 to create new bounties.');
	}
	await BountyUtils.validateReward(guildMember, reward);
	await BountyUtils.validateTitle(guildMember, title);
	BountyUtils.validateNumberOfCopies(guildMember, params.copies);

	const workNeededMessage: Message = await guildMember.send({ content: `Hello <@${guildMember.id}>! Can you tell me a description of your bounty?` });
	const dmChannel: DMChannel = await workNeededMessage.channel.fetch() as DMChannel;
	const replyOptions: AwaitMessagesOptions = {
		max: 1,
		time: 180000,
		errors: ['time'],
	};

	const summary = (await dmChannel.awaitMessages(replyOptions)).first().content;
	await BountyUtils.validateSummary(guildMember, summary);
	params.summary = summary;

	await guildMember.send({ content: 'Awesome! Now what is absolutely required for the bounty to be complete?' });

	const criteria = (await dmChannel.awaitMessages(replyOptions)).first().content;
	await BountyUtils.validateCriteria(guildMember, criteria);
	params.criteria = criteria;

	if (params.copies > 1) {
		const totalReward = params.reward.amount * params.copies;
		await guildMember.send({ content: `Are you sure you want to publish bounties with a \`total\` reward of \`${totalReward} ${params.reward.currencySymbol}\`? (yes/no)` });
		const amountConfirmation: string = (await dmChannel.awaitMessages(replyOptions)).first().content;
		if (!(amountConfirmation == 'yes' || amountConfirmation == 'YES' || amountConfirmation == 'Y' || amountConfirmation == 'Yes')) {
			return guildMember.send({ content: 'Ok no problem, bounty deleted.' });
		}
	}

	let convertedDueDateFromMessage: Date;
	do {
		await guildMember.send({ content: 'Please enter `UTC` date in format `yyyy-mm-dd`, i.e 2021-08-15`? (no to exit)' });
		const dueAtMessage = (await dmChannel.awaitMessages(replyOptions)).first().content;
		if (dueAtMessage !== 'no') {
			try {
				convertedDueDateFromMessage = BountyUtils.validateDate(guildMember, dueAtMessage);
			} catch(e) {
				console.log(e);
				await guildMember.send({ content: 'Please try `UTC` date in format `yyyy-mm-dd`, i.e 2021-08-15' });
			}
		} else if (dueAtMessage === 'no') {
			convertedDueDateFromMessage = null;
			break;
		}
	} while (convertedDueDateFromMessage.toString() === 'Invalid Date');
	params.dueAt = convertedDueDateFromMessage ? convertedDueDateFromMessage : BountyUtils.getDateFromISOString(constants.BOUNTY_BOARD_END_OF_SEASON_DATE);

	const db: Db = await dbInstance.dbConnect(constants.DB_NAME_BOUNTY_BOARD);
	const dbBounty = db.collection(constants.DB_COLLECTION_BOUNTIES);

	const listOfPrepBounties = [];
	for (let i = 0; i < params.copies; i++) {
		listOfPrepBounties.push(generateBountyRecord(params, guildMember));
	}

	const dbInsertResult = await dbBounty.insertMany(listOfPrepBounties, { ordered: false });
	if (dbInsertResult == null) {
		console.error('failed to insert bounties into DB');
		return guildMember.send({ content: 'Sorry something is not working, our devs are looking into it.' });
	}
	console.log(`user ${guildMember.user.tag} inserted into db`);
	const listOfBountyIds = Object.values(dbInsertResult.insertedIds).map(String);
	const newBounty = listOfPrepBounties[0];
	const messageOptions: MessageOptions = {
		embeds: [{
			title: newBounty.title,
			url: (envUrls.BOUNTY_BOARD_URL + listOfBountyIds[0]),
			author: {
				icon_url: guildMember.user.avatarURL(),
				name: newBounty.createdBy.discordHandle,
			},
			description: newBounty.description,
			fields: [
				{ name: 'HashId', value: listOfBountyIds[0], inline: false },
				{ name: 'Reward', value: BountyUtils.formatBountyAmount(newBounty.reward.amount, newBounty.reward.scale) + ' ' + newBounty.reward.currency.toUpperCase(), inline: true },
				{ name: 'Status', value: 'Open', inline: true },
				{ name: 'Deadline', value: ServiceUtils.formatDisplayDate(newBounty.dueAt), inline: true },
				{ name: 'Criteria', value: newBounty.criteria.toString() },
				{ name: 'Created by', value: newBounty.createdBy.discordHandle.toString(), inline: true },
			],
			timestamp: new Date().getTime(),
			footer: {
				text: '👍 - publish | 📝 - edit | ❌ - delete | Please reply within 60 minutes',
			},
		}],
	};

	await guildMember.send('Thank you! Does this look right?');
	const message: Message = await guildMember.send(messageOptions);

	await message.react('👍');
	await message.react('📝');
	await message.react('❌');

	return handleBountyReaction(message, guildMember, listOfBountyIds);
};

export const generateBountyRecord = (bountyParams: BountyCreateNew, guildMember: GuildMember): any => {
	const currentDate = (new Date()).toISOString();
	return {
		season: new Int32(Number(process.env.DAO_CURRENT_SEASON)),
		title: bountyParams.title,
		description: bountyParams.summary,
		criteria: bountyParams.criteria,
		reward: {
			currency: bountyParams.reward.currencySymbol,
			amount: new Int32(bountyParams.reward.amount),
			scale: new Int32(bountyParams.reward.scale),
		},
		createdBy: {
			discordHandle: guildMember.user.tag,
			discordId: guildMember.user.id,
			iconUrl: guildMember.user.avatarURL(),
		},
		createdAt: currentDate,
		statusHistory: [
			{
				status: 'Draft',
				setAt: currentDate,
			},
		],
		status: 'Draft',
		dueAt: bountyParams.dueAt.toISOString(),
	};
};

const handleBountyReaction = (message: Message, guildMember: GuildMember, bountyIds: string[]): Promise<any> => {
	return message.awaitReactions({
		max: 1,
		time: (6000 * 60),
		errors: ['time'],
		filter: async (reaction, user) => {
			return ['📝', '👍', '❌'].includes(reaction.emoji.name) && !user.bot;
		},
	}).then(async collected => {
		const reaction: MessageReaction = collected.first();
		if (reaction.emoji.name === '👍') {
			console.log('/bounty create new | :thumbsup: up given');
			for (const bountyId of bountyIds) {
				await finalizeBounty(guildMember, bountyId);
			}
			return;
		} else if (reaction.emoji.name === '📝') {
			console.log('/bounty create new | :pencil: given');
			if (bountyIds.length > 1) {
				// TODO: add support to edit multiple bounties in UI
				await guildMember.send({ content: 'Sorry, edit not available for multiple bounties' });
				for (const bountyId of bountyIds) {
					await deleteBountyForValidId(guildMember, bountyId);
				}
				return;
			} else {
				for (const bountyId of bountyIds) {
					await UpdateEditKeyBounty(guildMember, bountyId);
				}
			}
			return;
		} else {
			console.log('/bounty create new | delete given');
			for (const bountyId of bountyIds) {
				await deleteBountyForValidId(guildMember, bountyId);
			}
			return;
		}
	}).catch(console.error);
};