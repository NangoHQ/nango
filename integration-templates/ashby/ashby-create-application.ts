import type { NangoAction, AshbyCreateApplicationResponse } from './models';

interface AshbyCreateCandidateInput {
    candidateId: string;
    jobId: string;
    interviewPlanId?: string;
    interviewStageId?: string;
    sourceId?: string;
    creditedToUserId?: string;
}

export default async function runAction(nango: NangoAction, input: AshbyCreateCandidateInput): Promise<AshbyCreateApplicationResponse> {
    if (!input.candidateId) {
        throw new nango.ActionError({
            message: 'candidateId is a required field'
        });
    } else if (!input.jobId) {
        throw new nango.ActionError({
            message: 'jobId is a required field'
        });
    }

    try {
        const postData = {
            candidateId: input.candidateId,
            jobId: input.jobId,
            interviewPlanId: input.interviewPlanId,
            interviewStageId: input.interviewStageId,
            sourceId: input.sourceId,
            creditedToUserId: input.creditedToUserId
        };

        const resp = await nango.post({
            endpoint: '/application.create',
            data: postData
        });

        const {
            id,
            createdAt,
            updatedAt,
            status,
            customFields,
            candidate,
            currentInterviewStage,
            source,
            archiveReason,
            job,
            creditedToUser,
            hiringTeam,
            appliedViaJobPostingId
        } = resp.data.results;

        return {
            id,
            createdAt,
            updatedAt,
            status,
            customFields,
            candidate,
            currentInterviewStage,
            source,
            archiveReason,
            job,
            creditedToUser,
            hiringTeam,
            appliedViaJobPostingId
        };
    } catch (error: any) {
        throw new Error(`Error in runAction: ${error.message}`);
    }
}
