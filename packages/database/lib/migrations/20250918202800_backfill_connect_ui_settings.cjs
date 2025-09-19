exports.config = { transaction: true };

const payingCustomerSettings = {
    show_watermark: false,
    default_theme: 'system',
    theme: {
        light: {
            primary: '#00B2E3'
        },
        dark: {
            primary: '#00B2E3'
        }
    }
};

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    /**
     * Backfill plan:
     * - Existing paying customers should have the watermark disabled and the ability to toggle (even if they usually wouldn't have that ability)
     * - Growth plan should have the ability to customize the theme
     * - Free plan are migrated to having the watermark and can't toggle it or customize the theme
     */

    // Every existing paying customer can toggle the watermark and have it disabled by default
    await knex('plans').whereNot('name', 'free').update({ can_disable_connect_ui_watermark: true });

    // Every existing growth plan can customize the theme
    await knex('plans').where('name', 'growth').orWhere('name', 'growth-legacy').update({ can_customize_connect_ui_theme: true });

    // Get all environments for paying customers
    const payingCustomerEnvironments = await knex('_nango_environments')
        .select('_nango_environments.id')
        .innerJoin('plans', '_nango_environments.account_id', 'plans.account_id')
        .whereNot('plans.name', 'free');

    // Insert connect_ui_settings with disabled watermark for paying customers
    const settingsToInsert = payingCustomerEnvironments.map((env) => ({
        environment_id: env.id,
        ...payingCustomerSettings
    }));

    if (settingsToInsert.length > 0) {
        await knex('connect_ui_settings').insert(settingsToInsert).onConflict('environment_id').ignore();
    }
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};
