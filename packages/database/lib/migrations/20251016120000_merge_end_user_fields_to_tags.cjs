exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    console.log('[merge end_user fields to tags] Starting migration...');

    // Process in batches to avoid loading all users at once
    const batchSize = 1000;
    let offset = 0;
    let processedCount = 0;

    while (true) {
        const endUsers = await knex.raw(
            `SELECT id, end_user_id, email, display_name, tags
             FROM end_users
             ORDER BY id
             LIMIT ? OFFSET ?`,
            [batchSize, offset]
        );

        if (endUsers.rows.length === 0) {
            break;
        }

        for (const user of endUsers.rows) {
            // Parse existing tags or create new object
            let mergedTags = {};

            if (user.tags !== null && typeof user.tags === 'object') {
                mergedTags = { ...user.tags };
            }

            // Add end_user_id (always present, NOT NULL)
            mergedTags.end_user_id = user.end_user_id;

            // Add email if present
            if (user.email !== null) {
                mergedTags.email = user.email;
            }

            // Add display_name if present
            if (user.display_name !== null) {
                mergedTags.display_name = user.display_name;
            }

            // Update the tags column with merged data
            await knex.raw(`UPDATE end_users SET tags = ? WHERE id = ?`, [JSON.stringify(mergedTags), user.id]);

            processedCount++;
        }

        console.log(`[merge end_user fields to tags] Processed ${processedCount} users...`);
        offset += batchSize;
    }

    console.log(`[merge end_user fields to tags] Migration complete. Total users processed: ${processedCount}`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    console.log('[merge end_user fields to tags] Starting rollback...');

    // Process in batches to avoid loading all users at once
    const batchSize = 1000;
    let offset = 0;
    let processedCount = 0;

    while (true) {
        const endUsers = await knex.raw(
            `SELECT id, tags
             FROM end_users
             WHERE tags IS NOT NULL
             ORDER BY id
             LIMIT ? OFFSET ?`,
            [batchSize, offset]
        );

        if (endUsers.rows.length === 0) {
            break;
        }

        for (const user of endUsers.rows) {
            if (user.tags !== null && typeof user.tags === 'object') {
                // Remove the merged fields
                const cleanedTags = { ...user.tags };
                delete cleanedTags.end_user_id;
                delete cleanedTags.email;
                delete cleanedTags.display_name;

                // If no tags remain, set to null; otherwise update with cleaned tags
                const finalTags = Object.keys(cleanedTags).length === 0 ? null : cleanedTags;

                await knex.raw(`UPDATE end_users SET tags = ? WHERE id = ?`, [finalTags === null ? null : JSON.stringify(finalTags), user.id]);

                processedCount++;
            }
        }

        console.log(`[merge end_user fields to tags] Rolled back ${processedCount} users...`);
        offset += batchSize;
    }

    console.log(`[merge end_user fields to tags] Rollback complete. Total users processed: ${processedCount}`);
};
