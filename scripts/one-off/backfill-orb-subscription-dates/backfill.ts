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
        statement_timeout: 60000
    },
    pool: {
        min: 1,
        max: 10
    }
});

interface OrbSubscriptionScheduleItem {
    start_date: string;
    end_date: string;
    created_at: string;
    plan: {
        external_plan_id: string;
    };
}

async function fetchOrbSubscriptionSchedule(subscriptionId: string): Promise<OrbSubscriptionScheduleItem[]> {
    const response = await fetch(`https://api.withorb.com/v1/subscriptions/${subscriptionId}/schedule`, {
        headers: {
            Authorization: `Bearer ${ORB_API_KEY}`
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch Orb subscription: ${response.statusText}`);
    }

    return (await response.json()).data as OrbSubscriptionScheduleItem[];
}

function getLastUpgradeDate(subscriptionSchedules: OrbSubscriptionScheduleItem[]): Date | undefined {
    // Sort all schedule items by start_date
    const sortedSchedules = [...subscriptionSchedules].sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());

    // look for the most recent free-to-paid transition anywhere in the schedule
    let lastUpgradeDate: Date | undefined;
    for (let i = 0; i < sortedSchedules.length - 1; i++) {
        const currentItem = sortedSchedules[i];
        const nextItem = sortedSchedules[i + 1];

        // Check if current is free and next is paid
        if (currentItem.plan?.external_plan_id === 'free' && nextItem.plan?.external_plan_id !== 'free') {
            lastUpgradeDate = new Date(nextItem.start_date);
        }
    }

    if (lastUpgradeDate) {
        return lastUpgradeDate;
    }

    // No free -> paid transition found, return the first non-free plan
    const firstNonFreePlan = sortedSchedules.find((item) => item.plan?.external_plan_id !== 'free');
    return firstNonFreePlan ? new Date(firstNonFreePlan.start_date) : undefined;
}

async function backfill() {
    const plans = await db('nango.plans').whereNot('name', 'free').whereNotNull('orb_subscription_id');

    const failures: { id: number; account_id: number; error: string }[] = [];
    let successCount = 0;

    console.log(`Found ${plans.length} subscriptions to backfill`);
    if (DRY_RUN) {
        console.log('🔍 DRY RUN MODE - No database updates will be executed');
    }

    for (const plan of plans) {
        try {
            const subscriptionSchedules = await fetchOrbSubscriptionSchedule(plan.orb_subscription_id);
            const lastUpgradeDate = getLastUpgradeDate(subscriptionSchedules);

            if (lastUpgradeDate) {
                if (!DRY_RUN) {
                    // await db('nango.plans').where('id', plan.id).update({ orb_subscribed_at: lastUpgradeDate });
                }

                const action = DRY_RUN ? 'Would update' : 'Successfully updated';
                console.log(`✅ ${action} plan ${plan.id} (account_id: ${plan.account_id}) with start_date: ${lastUpgradeDate.toISOString()}`);
                successCount++;
            } else {
                failures.push({
                    id: plan.id,
                    account_id: plan.account_id,
                    error: 'No upgrade date found in subscription data'
                });
                console.log(`❌ Failed to update plan ${plan.id} (account_id: ${plan.account_id}): No upgrade date found`);
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
