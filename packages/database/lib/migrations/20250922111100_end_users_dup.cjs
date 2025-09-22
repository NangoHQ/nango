const { wait } = require('@nangohq/utils');

exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    while (true) {
        // Grab end user one by one for simplicity and atomicity
        const endUsers = await knex.raw(`SELECT
			end_users.id,
			COUNT(1) as total
		FROM
			end_users
			JOIN _nango_connections AS nc ON nc.end_user_id = end_users.id
		GROUP BY
			end_users.id
		HAVING
			COUNT(1) > 1
		LIMIT 1`);

        if (endUsers.rows.length === 0) {
            break;
        }

        // Grab all connections for the end user that needs to be duplicated
        const connections = await knex.raw(`SELECT
	row_to_json(end_users.*) as end_user, _nango_connections.id as connection_id
FROM
	end_users
	JOIN _nango_connections ON end_users.id = _nango_connections.end_user_id
    WHERE end_users.id IN (${endUsers.rows.map((endUser) => endUser.id).join(',')})`);

        console.log('[endUser dup] changing', endUsers.rows[0].total, 'connections, for end user', endUsers.rows[0].id);

        // Insert a new end user for each connection
        // And update the related connection with the new end_users.id
        for (const connection of connections.rows) {
            const inserted = await knex
                .from('end_users')
                .insert({ ...connection.end_user, id: undefined })
                .returning('id');
            await knex.raw(`UPDATE _nango_connections SET end_user_id = ${inserted[0].id} WHERE id = ${connection.connection_id}`);
        }

        // Be nice to the database and cpu
        await wait(100);
    }
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
