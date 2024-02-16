import type { NangoAction, HackerRankWorkTest } from './models';

interface HackerRankWorkCreateTestInput {
    name: string;
    starttime: Date;
    endtime: Date;
    duration: number;
    instructions: string;
    locked: boolean;
    draft: string;
    languages: string[];
    candidate_details: string[];
    custom_acknowledge_text: string;
    cutoff_score: number;
    master_password: string;
    hide_compile_test: boolean;
    tags: string[];
    role_ids: string[];
    experience: string[];
    questions: string[];
    mcq_incorrect_score: number;
    mcq_correct_score: number;
    secure: boolean;
    shuffle_questions: boolean;
    test_admins: string[];
    hide_template: boolean;
    enable_acknowledgement: boolean;
    enable_proctoring: boolean;
    candidate_tab_switch: boolean;
    track_editor_paste: boolean;
    show_copy_paste_prompt: boolean;
    ide_config: string;
}

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
        throw new Error(`Error in runAction: ${error.message}`);
    }
}
