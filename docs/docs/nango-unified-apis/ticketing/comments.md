# Comment Model (Unified Ticketing API)

The `Comment` model has the following fields:

:::note This model can be customized
Unified models in Nango can be extended and customized. This lets you define your own mapping from the fields of the external APIs to exactly the data model that you want.
Ping us on the [Slack community](https://nango.dev/slack) and we are happy to show you how it works.
:::

```json
{
    "id": "08d15f69-6403-4bef-9307-b96c12e44728", // Nango assigned unique ID of this object
    "external_id": "362382939", // The comment's id in the external system

    "ticket_id": "08d15f69-6403-4bef-9307-b96c12e44595", // The Nango ID of the ticket this comment belongs to

    "description": "This is a great idea!\n\n I can help with...", // The description/body of the comment. In HTML format if supported by the external API

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
