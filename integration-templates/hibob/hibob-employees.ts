import type { HibobEmployee, NangoSync } from './models';

export default async function fetchData(nango: NangoSync) {
    try {
        const response = await nango.post({
            endpoint: '/v1/people/search'
        });

        const employees = response.data.employees;
        const chunkSize = 100;

        for (let i = 0; i < employees.length; i += chunkSize) {
            const chunk = employees.slice(i, i + chunkSize);
            const mappedEmployees = mapEmployee(chunk);
            const batchSize = mappedEmployees.length;

            await nango.log(`Saving batch of ${batchSize} employee(s)`);
            await nango.batchSave(mappedEmployees, 'HibobEmployee');
        }

        await nango.log(`Total employee(s) processed: ${employees.length}`);
    } catch (error: any) {
        throw new Error(`Error in fetchData: ${error.message}`);
    }
}

function mapEmployee(employees: any[]): HibobEmployee[] {
    return employees.map((employee) => ({
        id: employee.id,
        firstName: employee.firstName,
        surname: employee.surname,
        email: employee.email,
        displayName: employee.displayName,
        personal: employee.personal,
        about: employee.about,
        work: employee.work
    }));
}
