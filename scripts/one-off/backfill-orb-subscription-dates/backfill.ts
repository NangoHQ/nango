import knex from 'knex';

const ORB_API_KEY = process.env['ORB_API_KEY'];

if (!ORB_API_KEY) {
    throw new Error('ORB_API_KEY is not set');
}

const DB_CONNECTION_STRING = process.env['DB_CONNECTION_STRING'];

if (!DB_CONNECTION_STRING) {
    throw new Error('DB_CONNECTION_STRING is not set');
}

const DRY_RUN = process.env['DRY_RUN'] === 'true';

// Initialize Knex database connection
const db = knex({
    client: 'pg',
    connection: {
        connectionString: DB_CONNECTION_STRING,
        ssl: 'no-verify',
        statement_timeout: 60000
    },
    pool: {
        min: 1,
        max: 10
    }
});
async function fetchOrbSubscription(subscriptionId: string) {
    const response = await fetch(`https://api.withorb.com/v1/subscriptions/${subscriptionId}`, {
        headers: {
            Authorization: `Bearer ${ORB_API_KEY}`
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch Orb subscription: ${response.statusText}`);
    }

    return response.json();
}

async function backfill() {
    const plans = await db('plans').whereNot('name', 'free').whereNotNull('orb_subscription_id').whereNull('orb_subscribed_at');

    const failures: { id: number; account_id: number; error: string }[] = [];
    let successCount = 0;

    console.log(`Found ${plans.length} subscriptions to backfill`);
    if (DRY_RUN) {
        console.log('🔍 DRY RUN MODE - No database updates will be executed');
    }

    for (const plan of plans) {
        try {
            const subscription = await fetchOrbSubscription(plan.orb_subscription_id);

            if (subscription.start_date) {
                if (!DRY_RUN) {
                    await db('plans').where('id', plan.id).update({ orb_subscribed_at: subscription.start_date });
                }

                const action = DRY_RUN ? 'Would update' : 'Successfully updated';
                console.log(`✅ ${action} plan ${plan.id} (account_id: ${plan.account_id}) with start_date: ${subscription.start_date}`);
                successCount++;
            } else {
                failures.push({
                    id: plan.id,
                    account_id: plan.account_id,
                    error: 'No start_date found in subscription data'
                });
                console.log(`❌ Failed to update plan ${plan.id} (account_id: ${plan.account_id}): No start_date found`);
            }
        } catch (err) {
            failures.push({
                id: plan.id,
                account_id: plan.account_id,
                error: err instanceof Error ? err.message : String(err)
            });
            console.log(`❌ Failed to update plan ${plan.id} (account_id: ${plan.account_id}): ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    console.log(`\n📊 Summary:`);
    const action = DRY_RUN ? 'Would update' : 'Successfully updated';
    console.log(`✅ ${action}: ${successCount}`);
    console.log(`❌ Failed updates: ${failures.length}`);

    if (failures.length > 0) {
        console.log(`\n🚨 Failed subscriptions:`);
        failures.forEach((failure) => {
            console.log(`  - Plan ID: ${failure.id}, Account ID: ${failure.account_id}, Error: ${failure.error}`);
        });
    }
}

void backfill().then(() => {
    void db.destroy();
});
