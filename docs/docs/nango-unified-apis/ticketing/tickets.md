# Ticket Model (Unified Ticketing API)

The `Ticket` model has the following fields:

:::note This model can be customized
Unified models in Nango can be extended and customized. This lets you define your own mapping from the fields of the external APIs to exactly the data model that you want.
Ping us on the [Slack community](https://nango.dev/slack) and we are happy to show you how it works.
:::

```json
{
    "id": "08d15f69-6403-4bef-9307-b96c12e44595", // Nango assigned unique ID of this object
    "external_id": "IS-3849", // The ticket's id in the external system

    "title": "Create open-source unified API", // The title/summary/name of the ticket
    "description": "We need an open-sourc, unified API:\n...", // The description/body of the ticket. In HTML format if supported by the external API

    "status": "IN_PROGRESS", // The status of the ticket. Possible values are: OPEN, CLOSED, IN_PROGRESS or CUSTOM if the value could not be clearly mapped.
    "external_raw_status": "On Hold", // The status of the ticket precisely as returned by the external system

    "comments": [
        // A list of comments associated with this ticket
        "2dbbbb6c-eab2-4dae-8231-1c50ec3c7e47"
    ],

    "creator": "Juck Norris", // The name of the user who created the ticket (if returned by the external API)
    "external_created_at": "2023-05-01T00:00:00Z", // Timestamp when the ticket was created (as returned by the external API)
    "external_updated_at": "2023-05-03T00:00:00Z", // Timestamp when the ticket was last updated (as returned by the external API)

    "first_seen_at": "2023-05-03T00:00:00Z", // Timestamp when Nango first saw this ticket
    "last_updated_at": "2023-05-03T00:00:00Z", // Timestamp when Nango last updated this ticket
    "deleted_at": "2023-05-04T00:00:00Z", // The timestamp when Nango detected that this object had been deleted in the external system. null if not deleted.

    "external_raw_data": [  // List of raw API responses from the external API which Nango used to create the unified model
        {
            ...
        }
    ]
}
```
