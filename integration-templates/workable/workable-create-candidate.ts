import type { NangoAction, WorkableCreateCandidateResponse } from './models';

interface EducationEntry {
    school: String;
    degree?: String;
    field_of_study?: String;
    start_date?: String;
    end_date?: String;
}

interface ExperienceEntry {
    title: String;
    summary?: String;
    start_date?: String;
    end_date?: String;
    current?: Boolean;
    company?: String;
    industry?: String;
}

interface Answer {
    question_key: String;
    body?: String;
    choices?: String[];
    checked?: Boolean;
    date?: String;
    number?: Number;
    file?: {
        name: String;
        data: String;
    };
}

interface SocialProfile {
    type: String;
    name?: String;
    username?: String;
    url: String;
}

interface WorkableCreateCandidateInput {
    shortcode: String;
    candidate: {
        name: String;
        firstname: String;
        lastname: String;
        email: String;
        headline?: String;
        summary?: String;
        address?: String;
        phone?: String;
        cover_letter?: String;
        education_entries?: EducationEntry[];
        experience_entries?: ExperienceEntry[];
        answers?: Answer[];
        skills?: String[];
        tags?: String[];
        disqualified?: Boolean;
        disqualification_reason?: String;
        disqualified_at?: String;
        social_profiles?: SocialProfile[];
    };
    domain?: String;
    recruiter_key?: String;
}

export default async function runAction(nango: NangoAction, input: WorkableCreateCandidateInput): Promise<WorkableCreateCandidateResponse> {
    if (!input.shortcode) {
        throw new nango.ActionError({
            message: 'job shortcode is a required field'
        });
    } else if (!input.candidate.name) {
        throw new nango.ActionError({
            message: 'name is required for the candidate'
        });
    } else if (!input.candidate.firstname) {
        throw new nango.ActionError({
            message: 'firstname is required for the candidate'
        });
    } else if (!input.candidate.lastname) {
        throw new nango.ActionError({
            message: 'lastname is required for the candidate'
        });
    } else if (!input.candidate.email) {
        throw new nango.ActionError({
            message: 'email is required for the candidate'
        });
    } else if (input.candidate.education_entries && input.candidate.education_entries.some((entry) => !entry.school)) {
        throw new nango.ActionError({
            message: "school is required for the candidate's education entries"
        });
    } else if (input.candidate.experience_entries && input.candidate.experience_entries.some((entry) => !entry.title)) {
        throw new nango.ActionError({
            message: "title is required for the candidate's experience entries"
        });
    } else if (input.candidate.answers && input.candidate.answers.some((entry) => !entry.question_key)) {
        throw new nango.ActionError({
            message: "question_key is required for the candidate's answer"
        });
    } else if (input.candidate.social_profiles && input.candidate.social_profiles.some((entry) => !entry.type)) {
        throw new nango.ActionError({
            message: "type is required for the candidate's social profiles"
        });
    } else if (input.candidate.social_profiles && input.candidate.social_profiles.some((entry) => !entry.url)) {
        throw new nango.ActionError({
            message: "url is required for the candidate's social profiles"
        });
    }

    const endpoint = `/spi/v3/jobs/${input.shortcode}/candidates`;

    try {
        const postData = {
            shortcode: input.shortcode,
            candidate: {
                name: input.candidate.name,
                firstname: input.candidate.firstname,
                lastname: input.candidate.lastname,
                email: input.candidate.email,
                headline: input.candidate.headline,
                summary: input.candidate.summary,
                address: input.candidate.address,
                phone: input.candidate.phone,
                cover_letter: input.candidate.cover_letter,
                education_entries: input.candidate.education_entries,
                experience_entries: input.candidate.experience_entries,
                answers: input.candidate.answers,
                skills: input.candidate.skills,
                tags: input.candidate.tags,
                disqualified: input.candidate.disqualified,
                disqualification_reason: input.candidate.disqualification_reason,
                disqualified_at: input.candidate.disqualified_at,
                social_profiles: input.candidate.social_profiles
            },
            domain: input.domain,
            recruiter_key: input.recruiter_key
        };

        const resp = await nango.post({
            endpoint: endpoint,
            data: postData
        });

        return {
            status: resp.data.status,
            candidate: resp.data.candidate
        };
    } catch (error: any) {
        throw new Error(`Error in runAction: ${error.message}`);
    }
}
