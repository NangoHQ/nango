import type { HackerRankWorkTest, NangoSync } from '../../models';

export default async function fetchData(nango: NangoSync) {
    let totalRecords = 0;

    try {
        const endpoint = '/x/api/v3/tests';
        const config = {
            paginate: {
                type: 'link',
                limit_name_in_request: 'limit',
                link_path_in_response_body: 'next',
                response_path: 'data',
                limit: 100
            }
        };

        const lastSyncDate = nango.lastSyncDate;
        for await (const test of nango.paginate({ ...config, endpoint })) {
            const testsToSave = [];
            for (const item of test) {
                if (lastSyncDate !== undefined && new Date(item.created_at) < lastSyncDate) {
                    continue; // Skip tests created before lastSyncDate
                }
                const mappedTest: HackerRankWorkTest = mapTest(item);

                totalRecords++;
                testsToSave.push(mappedTest);
            }

            if (testsToSave.length > 0) {
                await nango.batchSave(testsToSave, 'HackerRankWorkTest');
                await nango.log(`Saving batch of ${testsToSave.length} test(s) (total test(s): ${totalRecords})`);
            }
        }
    } catch (error: any) {
        throw new Error(`Error in fetchData: ${error.message}`);
    }
}

function mapTest(test: any): HackerRankWorkTest {
    return {
        id: test.id,
        unique_id: test.unique_id,
        name: test.name,
        duration: test.duration,
        owner: test.owner,
        instructions: test.instructions,
        created_at: test.created_at,
        state: test.state,
        locked: test.locked,
        test_type: test.test_type,
        starred: test.starred,
        start_time: test.start_time,
        end_time: test.end_time,
        draft: test.draft,
        questions: test.questions,
        sections: test.sections,
        tags: test.tags,
        permission: test.permission
    };
}
