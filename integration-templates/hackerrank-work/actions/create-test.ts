import type { NangoAction, HackerRankWorkTest, HackerRankWorkCreateTestInput } from '../../models';

const mapInputToPostData = (input: HackerRankWorkCreateTestInput): Record<string, any> => {
    return { ...input };
};

export default async function runAction(nango: NangoAction, input: HackerRankWorkCreateTestInput): Promise<HackerRankWorkTest> {
    if (!input.name) {
        throw new nango.ActionError({
            message: 'name is a required field'
        });
    }

    const endpoint = `/x/api/v3/tests`;

    try {
        const postData = mapInputToPostData(input);

        const resp = await nango.post({
            endpoint: endpoint,
            data: postData
        });

        return {
            id: resp.data.id,
            unique_id: resp.data.unique_id,
            name: resp.data.name,
            duration: resp.data.duration,
            owner: resp.data.owner,
            instructions: resp.data.instructions,
            created_at: resp.data.created_at,
            state: resp.data.state,
            locked: resp.data.locked,
            test_type: resp.data.test_type,
            starred: resp.data.starred,
            start_time: resp.data.start_time,
            end_time: resp.data.end_time,
            draft: resp.data.draft,
            questions: resp.data.questions,
            sections: resp.data.sections,
            tags: resp.data.tags,
            permission: resp.data.permission
        };
    } catch (error: any) {
        throw new nango.ActionError({
            message: `Error in runAction: ${error.message}`
        });
    }
}
