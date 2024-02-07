import type { WorkableJobQuestion, NangoSync } from './models';

const CHUNK_SIZE = 100;

export default async function fetchData(nango: NangoSync) {
    const totalRecords = 0;

    try {
        const jobs: any[] = await getAllJobs(nango);

        for (const job of jobs) {
            const endpoint = `/spi/v3/jobs/${job.shortcode}/questions`;

            const response = await nango.get({ endpoint });
            const questions: any[] = response.data.questions || [];

            const mappedQuestions: WorkableJobQuestion[] = questions.map(mapQuestion) || [];

            // Process questions in chunks since the endpoint doesn't offer pagination
            await processChunks(nango, mappedQuestions, job.shortcode, totalRecords);
        }
    } catch (error: any) {
        throw new Error(`Error in fetchData: ${error.message}`);
    }
}

async function processChunks(nango: NangoSync, data: WorkableJobQuestion[], shortcode: string, totalRecords: number) {
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, i + CHUNK_SIZE);
        const batchSize = chunk.length;
        totalRecords += batchSize;
        await nango.log(`Saving batch of ${batchSize} question(s) for job ${shortcode} (total question(s): ${totalRecords})`);
        await nango.batchSave(chunk, 'WorkableJobQuestion');
    }
}

async function getAllJobs(nango: NangoSync) {
    const records: any[] = [];
    const config = {
        endpoint: '/spi/v3/jobs',
        paginate: {
            type: 'link',
            link_path_in_response_body: 'paging.next',
            limit_name_in_request: 'limit',
            response_path: 'jobs',
            limit: 100
        }
    };

    for await (const recordBatch of nango.paginate(config)) {
        records.push(...recordBatch);
    }

    return records;
}

function mapQuestion(question: any): WorkableJobQuestion {
    return {
        id: question.id,
        body: question.body,
        type: question.type,
        required: question.required,
        single_answer: question.single_answer,
        choices: question.choices,
        supported_file_types: question.supported_file_types,
        max_file_size: question.max_file_size
    };
}
