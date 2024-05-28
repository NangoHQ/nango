import type { BamboohrEmployee, NangoSync } from '../../models';

interface CustomReportData {
    title: string;
    filters: {
        lastChanged: {
            includeNull: string;
            value?: string;
        };
    };
    fields: (keyof BamboohrEmployee)[];
}

export default async function fetchData(nango: NangoSync) {
    const customReportData: CustomReportData = {
        title: 'Current Employees',
        filters: {
            lastChanged: {
                includeNull: 'no',
                ...(nango.lastSyncDate ? { value: nango.lastSyncDate?.toISOString().split('.')[0] + 'Z' } : {}) //remove milliseconds
            }
        },
        fields: [
            'id',
            'employeeNumber',
            'firstName',
            'lastName',
            'dateOfBirth',
            'address1',
            'bestEmail',
            'jobTitle',
            'hireDate',
            'supervisorId',
            'supervisor',
            'createdByUserId',
            'department',
            'division',
            'employmentHistoryStatus',
            'gender',
            'country',
            'city',
            'location',
            'state',
            'maritalStatus',
            'exempt',
            'payRate',
            'payType',
            'payPer',
            'ssn',
            'workPhone',
            'homePhone'
        ]
    };

    try {
        const response = await nango.post({
            endpoint: '/v1/reports/custom',
            params: {
                format: 'JSON',
                onlyCurrent: true.toString() //limits the report to only current employees
            },
            data: customReportData
        });

        const employees = response.data.employees;
        const chunkSize = 100;

        for (let i = 0; i < employees.length; i += chunkSize) {
            const chunk = employees.slice(i, i + chunkSize);
            const mappedEmployees = mapEmployee(chunk);
            const batchSize = mappedEmployees.length;

            await nango.log(`Saving batch of ${batchSize} employee(s)`);
            await nango.batchSave(mappedEmployees, 'BamboohrEmployee');
        }

        await nango.log(`Total employee(s) processed: ${employees.length}`);
    } catch (error: any) {
        throw new Error(`Error in fetchData: ${error.message}`);
    }
}

function mapEmployee(employees: any[]): BamboohrEmployee[] {
    return employees.map((employee) => ({
        id: employee.id,
        employeeNumber: employee.employeeNumber,
        firstName: employee.firstName,
        lastName: employee.lastName,
        dateOfBirth: employee.dateOfBirth,
        address1: employee.address1,
        bestEmail: employee.bestEmail,
        jobTitle: employee.jobTitle,
        hireDate: employee.hireDate,
        supervisorId: employee.supervisorId,
        supervisor: employee.supervisor,
        createdByUserId: employee.createdByUserId,
        department: employee.department,
        division: employee.division,
        employmentHistoryStatus: employee.employmentHistoryStatus,
        gender: employee.gender,
        country: employee.country,
        city: employee.city,
        location: employee.location,
        state: employee.state,
        maritalStatus: employee.maritalStatus,
        exempt: employee.exempt,
        payRate: employee.payRate,
        payType: employee.payType,
        payPer: employee.payPer,
        ssn: employee.ssn,
        workEmail: employee.workEmail,
        workPhone: employee.workPhone,
        homePhone: employee.homePhone
    }));
}
