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

function getFirstPaidPlanDate(subscriptionSchedules: OrbSubscriptionScheduleItem[]): Date {
    // Find all schedule items where the plan is not 'free'
    const paidItems = subscriptionSchedules.filter((item) => item.plan?.external_plan_id !== 'free');

    if (paidItems.length === 0) {
        return undefined;
    }

    // Find the paid item with the earliest start_date
    let earliest = paidItems[0];
    for (const item of paidItems) {
        if (new Date(item.start_date) < new Date(earliest.start_date)) {
            earliest = item;
        }
    }
    return new Date(earliest.start_date);
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
            const firstPaidPlanDate = getFirstPaidPlanDate(subscriptionSchedules);

            if (firstPaidPlanDate) {
                if (!DRY_RUN) {
                    await db('nango.plans').where('id', plan.id).update({ orb_subscribed_at: firstPaidPlanDate });
                }

                const action = DRY_RUN ? 'Would update' : 'Successfully updated';
                console.log(`✅ ${action} plan ${plan.id} (account_id: ${plan.account_id}) with start_date: ${firstPaidPlanDate.toISOString()}`);
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
