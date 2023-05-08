# Employee Model (Unified HRIS API)

The `Employee` model has the following fields:

:::note This model can be customized
Unified models in Nango can be extended and customized. This lets you define your own mapping from the fields of the external APIs to exactly the data model that you want.
Ping us on the [Slack community](https://nango.dev/slack) and we are happy to show you how it works.
:::

```json
{
    "id": "08d15f69-6403-4bef-9307-b96c12e44595", // Nango assigned unique ID of this object
    "external_id": "3732983892s3jsk", // The employee record's id in the external system
    "employee_number": "273", // The employee's number (usually given our sequentially)

    "first_name": "Juck", // The employee's first name
    "last_name": "Norris", // The employee's last name
    "full_display_name": "Juck Norris", // The first and last name together, to address the employee with their full name
    "gender": "MALE", // The employee's gender, any of: MALE, FEMALE or OTHER.
    "external_raw_gender": "Man", // The gender exactly as returned by the external system
    "marital_status": "SINGLE", // One of: SINGLE, MARRIED, DIVORCED or OTHER
    "external_marital_status": "single", // The marital status exactly as returned by the external system
    "date_of_birth": "1990-11-10T00:00:00Z", // Timestamp of the employee's date of birth

    "home_address": {   // The employee's home address
        "street_1": "3738 Greatstreet",
        "street_2": "Apartment 38392",
        "city": "San Francisco",
        "state": "CA",
        "zip_code": "94122",
        "country": "USA",
    },
    "work_address": {  // The employee's work address
        "street_1": "2892 Market St",
        "street_2": "34th floor",
        "city": "San Francisco",
        "state": "CA",
        "zip_code": "94124",
        "country": "USA",
    },

    "work_email": "juck@nango.dev", // The employee's work email
    "personal_email": "juck-norris@gmail.com", // The employee's personal email
    "mobile_phone_number": "+1234567890", // The employee's mobile phone number

    "job_title": "Intern with special priviledges", // The employee's current job title
    "salary_per_unit": 46382, // The employee's salary per unit of time
    "salary_currency": "USD", // Three letter ISO code of the currency
    "salary_unit": "YEAR", // Either YEAR, MONTH, WEEK or HOUR
    "start_date": "2020-11-23T00:00:00Z", // Timestamp of the employee's employment start date
    "end_date": "2024-10-11T00:00:00Z", // Timestamp of the employee's employment end date (or null if not known/indefinite employment)
    "manager": "08d15f69-6403-4bef-9307-b96c12e443849", // Nango id of the employee's manager object

    "external_created_at": "2023-05-01T00:00:00Z", // Timestamp when the employee was created (as returned by the external API)
    "external_updated_at": "2023-05-03T00:00:00Z", // Timestamp when the employee was last updated (as returned by the external API)

    "first_seen_at": "2023-05-03T00:00:00Z", // Timestamp when Nango first saw this employee
    "last_updated_at": "2023-05-03T00:00:00Z", // Timestamp when Nango last updated this employee
    "deleted_at": "2023-05-04T00:00:00Z", // The timestamp when Nango detected that this object had been deleted in the external system. null if not deleted.

    "external_raw_data": [  // List of raw API responses from the external API which Nango used to create the unified model
        {
            ...
        }
    ]
}
```
