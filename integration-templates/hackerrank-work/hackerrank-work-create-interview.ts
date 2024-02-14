import type { NangoAction, HackerRankWorkInterview } from './models';

interface CandidateInformation {
    name: string;
    email: string;
}
interface HackerRankWorkCreateInterviewInput {
    from: Date;
    to: Date;
    title: string;
    notes: string;
    resume_url: string;
    interviewers: string[];
    result_url: string;
    candidate: CandidateInformation;
    send_email: boolean;
    interview_metadata: Record<string, any>;
}

const mapInputToPostData = (input: HackerRankWorkCreateInterviewInput): Record<string, any> => {
    return { ...input };
};

export default async function runAction(nango: NangoAction, input: HackerRankWorkCreateInterviewInput): Promise<HackerRankWorkInterview> {
    if (!input.title) {
        throw new nango.ActionError({
            message: 'title is a required field'
        });
    } else if (input.candidate && !input.candidate.email) {
        throw new nango.ActionError({
            message: 'email is required for the candidate'
        });
    }

    const endpoint = `/x/api/v3/interviews`;

    try {
        const postData = mapInputToPostData(input);

        const resp = await nango.post({
            endpoint: endpoint,
            data: postData
        });

        return {
            id: resp.data.id,
            status: resp.data.status,
            created_at: resp.data.created_at,
            updated_at: resp.data.updated_at,
            title: resp.data.title,
            feedback: resp.data.feedback,
            notes: resp.data.notes,
            metadata: resp.data.metadata,
            quickpad: resp.data.quickpad,
            ended_at: resp.data.ended_at,
            timezone: resp.data.timezone,
            interview_template_id: resp.data.interview_template_id,
            from: resp.data.from,
            to: resp.data.to,
            url: resp.data.url,
            user: resp.data.user,
            thumbs_up: resp.data.thumbs_up,
            resume_url: resp.data.resume_url,
            interviewers: resp.data.interviewers,
            candidate: resp.data.candidate,
            result_url: resp.data.result_url,
            report_url: resp.data.report_url
        };
    } catch (error: any) {
        throw new Error(`Error in runAction: ${error.data}`);
    }
}
