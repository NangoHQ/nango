import type { NangoAction, HackerRankWorkTest } from './models';

interface HackerRankWorkCreateTestInput {
    name: String;
    starttime: Date;
    endtime: Date;
    duration: Number;
    instructions: String;
    locked: Boolean;
    draft: String;
    languages: String[];
    candidate_details: String[];
    custom_acknowledge_text: String;
    cutoff_score: Number;
    master_password: String;
    hide_compile_test: Boolean;
    tags: String[];
    role_ids: String[];
    experience: String[];
    questions: String[];
    mcq_incorrect_score: Number;
    mcq_correct_score: Number;
    secure: Boolean;
    shuffle_questions: Boolean;
    test_admins: String[];
    hide_template: Boolean;
    enable_acknowledgement: Boolean;
    enable_proctoring: Boolean;
    candidate_tab_switch: Boolean;
    track_editor_paste: Boolean;
    show_copy_paste_prompt: Boolean;
    ide_config: String;
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
