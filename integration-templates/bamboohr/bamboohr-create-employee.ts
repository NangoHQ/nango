import type { NangoAction, BamboohrEmployee, BamboohrCreateEmployeeResponse } from './models';

export default async function runAction(nango: NangoAction, input: BamboohrEmployee): Promise<BamboohrCreateEmployeeResponse> {
    try {
        const postData = {
            firstName: input.firstName,
            lastName: input.lastName,
            dateOfBirth: input.dateOfBirth,
            address1: input.address1,
            hireDate: input.hireDate,
            department: input.department,
            division: input.division,
            employeeNumber: input.employeeNumber,
            employmentHistoryStatus: input.employmentHistoryStatus,
            gender: input.gender,
            jobTitle: input.jobTitle,
            country: input.country,
            city: input.city,
            location: input.location,
            state: input.state,
            maritalStatus: input.maritalStatus,
            payRate: input.payRate,
            payType: input.payType,
            ssn: input.ssn,
            workPhone: input.workPhone,
            homePhone: input.homePhone,
            exempt: input.exempt,
            payPer: input.payPer,
            workEmail: input.workEmail
        };

        const response = await nango.post({
            endpoint: `/v1/employees`,
            data: postData
        });

        return {
            status: response.statusText
        };
    } catch (error: any) {
        throw new Error(`Error in runAction: ${error.message}`);
    }
}
