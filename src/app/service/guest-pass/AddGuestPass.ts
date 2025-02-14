import { Db } from 'mongodb';
import dbInstance from '../../utils/dbUtils';
import constants from '../constants/constants';
import ServiceUtils from '../../utils/ServiceUtils';
import { GuildMember } from 'discord.js';

export const expiresInHours = 168;

export default async (guestUser: GuildMember): Promise<any> => {
	if (guestUser.user.bot) {
		return;
	}
	console.log(`attempting to add guest role to ${guestUser.user.tag}`);
	await addGuestUserToDb(guestUser);
	await addGuestRoleToUser(guestUser);
	notifyUserOfGuestExpiration(guestUser);
	removeGuestRoleOnExpiration(guestUser);
	return guestUser.send({ content: `Hi <@${guestUser.user.id}>, You have been granted guest access at Bankless DAO. Let us know if you have any questions!` }).catch(console.error);
};

export const addGuestUserToDb = async (guestUser: GuildMember): Promise<any> => {

	// DB Connected
	const db: Db = await dbInstance.dbConnect(constants.DB_NAME_DEGEN);
	const dbGuestUsers = db.collection(constants.DB_COLLECTION_GUEST_USERS);
	const queryOptions = {
		upsert: true,
	};
	const currentTimestamp = Date.now();
	const guestDbUser = {
		_id: guestUser.id,
		tag: guestUser.user.tag,
		startTimestamp: currentTimestamp,
		expiresTimestamp: currentTimestamp + (expiresInHours * 1000 * 60 * 60),
	};

	// Find and update guest user in mongodb
	const dbUpdateResult = await dbGuestUsers.findOneAndReplace({
		_id: guestUser.id,
	}, guestDbUser, queryOptions);
	if (dbUpdateResult == null) {
		console.error('Failed to insert into DB');
		return;
	}
	console.log(`/guest-pass end user ${guestUser.user.tag} inserted into guestUsers`);
};

export const addGuestRoleToUser = async (guestUser: GuildMember): Promise<void> => {
	const guestRole = ServiceUtils.getGuestRole(guestUser.guild.roles);
	await guestUser.roles.add(guestRole);
	console.log(`user ${guestUser.user.tag} given ${guestRole.name} role`);
};

export const notifyUserOfGuestExpiration = (guestUser: GuildMember): void =>{
	// Send out notification on timer
	setTimeout(async () => {
		await guestUser.send({ content: `Hey <@${guestUser.id}>, your guest pass is set to expire in 1 day. Let us know if you have any questions!` });
	}, (expiresInHours * 1000 * 60 * 60) - (1000 * 60 * 60 * 24));
	
	setTimeout(async () => {
		await guestUser.send({ content: `Hey <@${guestUser.id}>, your guest pass is set to expire in 15 minutes. Let us know if you have any questions!` });
	}, (expiresInHours * 1000 * 60 * 60) - (1000 * 60 * 15));

};

export const removeGuestRoleOnExpiration = (guestUser: GuildMember): void => {
	// Handle removal of guest pass
	setTimeout(async () => {
		const timeoutDB: Db = await dbInstance.dbConnect(constants.DB_NAME_DEGEN);
		const timeoutDBGuestUsers = timeoutDB.collection(constants.DB_COLLECTION_GUEST_USERS);
		const guestDBQuery = {
			_id: guestUser.id,
		};
		const dbDeleteResult = await timeoutDBGuestUsers.findOneAndDelete(guestDBQuery);
		if (dbDeleteResult == null) {
			console.error('Failed to remove from DB');
			return;
		}
		console.log(`guest pass removed for ${guestUser.user.tag} in db`);

		// Remove guest pass role
		const guestRole = ServiceUtils.getGuestRole(guestUser.guild.roles);
		await guestUser.roles.remove(guestRole).catch(console.error);

		console.log(`/guest-pass end; guest pass removed for ${guestUser.user.tag} in discord`);

		return guestUser.send({ content: `Hi <@${guestUser.id}>, your guest pass has expired. Let us know at Bankless DAO if this was a mistake!` });
	}, expiresInHours * 1000 * 60 * 60);
};