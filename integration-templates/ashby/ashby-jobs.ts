import type { AshbyJob, NangoSync } from './models';

let nextCursor: string | null = null;

export default async function fetchData(nango: NangoSync) {
    const metadata = (await nango.getMetadata()) || {};
    const jobslastsyncToken = metadata['jobslastsyncToken'] ? String(metadata['jobslastsyncToken']) : '';

    await saveAllJobs(nango, jobslastsyncToken);
}

async function saveAllJobs(nango: NangoSync, jobslastsyncToken: string) {
    try {
        while (true) {
            const payload = {
                endpoint: '/job.list',
                data: {
                    syncToken: jobslastsyncToken,
                    cursor: nextCursor
                }
            };
            const response = await nango.post(payload);
            const pageData = response.data.results;
            const mappedJobs: AshbyJob[] = mapJob(pageData);
            if (mappedJobs.length > 0) {
                await nango.batchSave<AshbyJob>(mappedJobs, 'AshbyJob');
                await nango.log(`Sent ${mappedJobs.length} job(s)`);
            }
            if (response.data.moreDataAvailable) {
                nextCursor = response.data.nextCursor;
                jobslastsyncToken = response.data.syncToken;
            } else {
                break;
            }
        }

        const metadata = (await nango.getMetadata()) || {};
        metadata['jobslastsyncToken'] = jobslastsyncToken;
        await nango.setMetadata(metadata);
    } catch (error) {
        console.error('Error occurred while fetching and saving jobs:', error);
    }
}

function mapJob(jobs: any[]): AshbyJob[] {
    return jobs.map(job => ({
        id: job.id,
        title: job.title,
        confidential: job.confidential,
        status: job.status,
        employmentType: job.employmentType,
        locationId: job.locationId,
        departmentId: job.departmentId,
        defaultInterviewPlanId: job.defaultInterviewPlanId,
        interviewPlanIds: job.interviewPlanIds,
        customFields: job.customFields,
        jobPostingIds: job.jobPostingIds,
        customRequisitionId: job.customRequisitionId,
        hiringTeam: job.hiringTeam,
        updatedAt: job.updatedAt,
        location: job.location,
        openings: job.openings
    }));
}
