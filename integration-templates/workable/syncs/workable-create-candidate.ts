import type { NangoAction, WorkableCreateCandidateResponse, WorkableCreateCandidateInput } from '../../models';

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
    } else if (
        input.candidate.education_entries &&
        Array.isArray(input.candidate.education_entries) &&
        input.candidate.education_entries.some((entry: any) => !entry.school)
    ) {
        throw new nango.ActionError({
            message: "school is required for the candidate's education entries"
        });
    } else if (
        input.candidate.experience_entries &&
        Array.isArray(input.candidate.experience_entries) &&
        input.candidate.experience_entries.some((entry: any) => !entry.title)
    ) {
        throw new nango.ActionError({
            message: "title is required for the candidate's experience entries"
        });
    } else if (input.candidate.answers && Array.isArray(input.candidate.answers) && input.candidate.answers.some((entry: any) => !entry.question_key)) {
        throw new nango.ActionError({
            message: "question_key is required for the candidate's answer"
        });
    } else if (
        input.candidate.social_profiles &&
        Array.isArray(input.candidate.social_profiles) &&
        input.candidate.social_profiles.some((entry: any) => !entry.type)
    ) {
        throw new nango.ActionError({
            message: "type is required for the candidate's social profiles"
        });
    } else if (
        input.candidate.social_profiles &&
        Array.isArray(input.candidate.social_profiles) &&
        input.candidate.social_profiles.some((entry: any) => !entry.url)
    ) {
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
        throw new nango.ActionError({
            message: `Error in runAction: ${error.message}`
        });
    }
}
