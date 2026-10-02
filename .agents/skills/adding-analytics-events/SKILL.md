---
name: adding-analytics-events
description: Use when adding, renaming, changing or removing a PostHog product analytics event from the webapp, the server or the CLI - covers the catalogue, the naming rules, properties, where an event fires from, and what to update in PostHog
---

# Adding Analytics Events

`AnalyticsEventCatalogue` in `packages/types/lib/analytics/catalogue.ts` is the source of truth for every
product analytics event, whether the webapp, the server or the CLI sends it. Each entry records the
event's surface, the insight it serves, when it fires, and its properties. The senders are typed from it,
so an event that isn't in the catalogue doesn't compile.

The allowed categories, objects and actions are the unions in `packages/types/lib/analytics/taxonomy.ts`.
`packages/types/lib/analytics/rules.ts` checks names, snake*case properties, `is*`/`has\_`booleans, primitive
values,`is_success`on`complete`events and`structured_reason`. `npm run ts-build` fails with the event
and the broken rule. The other rules below are yours and the reviewer's to check.

**No insight, no event.** If you can't name the chart or funnel step an event feeds, don't add it. The
questions we want answered are on the [product insights page](https://app.notion.com/p/3e4ce298312181d7a9c7d8efd1a96c1a).
The reasoning behind the rules below is on the [taxonomy page](https://app.notion.com/p/3e3ce2983121810ea113e896abdfaecf).

## Workflow

1. **Name the insight.** Copy the question the event answers from the product insights page, word for
   word, into the entry's `insight`. Several events can share one question. If no question fits, write
   your own sentence, and ask whether the question belongs on the page.

2. **Look for an existing event first.** If a new event would carry the same properties as an existing
   one, differ only by a label and be charted next to it, add the label as a property instead.
   CLI commands are one `functions:command_start` with `command`. Usage page changes are one
   `billing:usage_update` with `change`.

3. **Choose where it fires.**

    | You need                                                  | Source                     |
    | --------------------------------------------------------- | -------------------------- |
    | Counts and current state, such as accounts per plan       | Our database. Not an event |
    | Changes over time and funnel steps, such as a plan change | A server event             |
    | Interaction, such as clicks, views and abandoned flows    | A web event                |

    Never move a web event to the server to get around ad blockers. PostHog is not for monitoring errors:
    don't send an event just to report an API error.

4. **Name it `category:object_action`.** Lowercase, snake_case, present tense, built only from the values
   in `taxonomy.ts`. The surface is a property, never part of the name. A UI element object ends in
   `_button`, `_link`, `_tab`, `_modal` or `_page`.

    To add a value, add it to the union in `taxonomy.ts` with the word the product already uses, and check
    that no existing value means the same thing. `integration`, never `provider`.

5. **Define its properties.**
    - `object_adjective`, snake_case: `integration_id`, `run_duration_ms`.
    - Booleans start with `is_` or `has_`. Dates end in `_date` or `_timestamp`.
    - For a change, the old value takes a `previous_` prefix and the new value the plain name:
      `previous_plan` and `plan`.
    - Values are strings, numbers or booleans.
    - A `complete` event always carries `is_success`. When `is_success` is false, add `error_code` with
      our API's error code, such as `resource_capped`, never the error message.
    - A server `create`, `update` or `delete` sent when the attempt finishes also carries `is_success`.
    - An HTTP call carries `http_status`. A session-scoped event carries `agent_session_id`.
    - Don't list `surface` or `is_production`. Every sender adds `surface`, and the server adds
      `is_production` when it knows the environment.
    - An array or object is allowed only when an insight can't be answered without it and it has a fixed
      maximum size. Put it in `structured_properties`, say why in `structured_reason`, and send primitive
      summaries next to it, such as a count or the top value.

6. **Add the entry.**

    ```ts
    'playground:run_complete': {
        surface: 'web';
        insight: 'How many accounts use the API Playground each week?';
        fires: 'When a Playground run returns a result or an error';
        properties: { function_type: string; integration: string; is_success: boolean; run_state: string; run_duration_ms: number };
    };
    ```

    `fires` is one sentence. The code shows where it fires.

7. **Send it.**
    - Web: `track()` from `packages/webapp/src/utils/analytics.tsx`.
    - Server: `productTracking.track()` from `@nangohq/shared`. The request's tracking context adds the
      account and, when there is one, `is_production`. It never adds the user, so a server event is sent as
      the account unless the call passes `user` itself.
    - CLI: the CLI posts to `/cli/telemetry`, and the server relays the event with `productTracking.trackAnonymous()`.
      Released CLIs keep sending what they sent when they shipped, so the endpoint has to keep accepting
      old bodies.

8. **Run `npm run ts-build`.**

## Personal data

- A person is identified by user id, with `email` and `name` as person properties. Nothing else personal.
- The account name is the `company` group's `name`, never an event property.
- Free text from a user or an agent can contain personal data. Send it only when an insight needs the text.
- Send a low-cardinality value, such as a filter's dimension, rather than the value someone typed.

## Changing an event

| Change                                    | What to do                                                      |
| ----------------------------------------- | --------------------------------------------------------------- |
| Add an optional property                  | Add it to the entry                                             |
| Change what a property holds, or its type | Add a property with a new name. Never retype one                |
| Revamp the flow an event belongs to       | Version the category, such as `onboarding_v2:connection_create` |
| Stop tracking something                   | Delete the entry and its calls. Never reuse the name            |
| Rename an event                           | See the gotcha below                                            |

## Gotchas

- **Renaming starts the event's history again under the new name.** Before renaming, find what reads the
  old name in PostHog: saved insights (`system.insights`) and destinations (`system.hog_functions`). Make
  them read both names before the deploy, then drop the old name after it.
- **PostHog's own events keep PostHog's names.** `$pageview`, `$mcp_tool_call` and other `$` events stay
  out of the catalogue, but a property we add to one still follows the property rules.
- **Most insights count accounts, not people.** Aggregate by the `company` group. CLI events have no
  group, because the CLI authenticates with a secret key and not as a user.
- **`LegacyAnalyticsEventName` is not an escape hatch.** It holds names whose replacement is already
  ticketed. Don't add to it.

## Review Checklist

- [ ] The entry names a real insight, and no existing event already answers it
- [ ] The name uses only values from `taxonomy.ts`, and any new value is the product's own word
- [ ] Properties follow the naming rules, and `complete` events carry `is_success`
- [ ] It fires from the right surface: server for business facts, web for interaction
- [ ] No personal data beyond what the insight needs
- [ ] For a rename or removal, PostHog insights and destinations that read the old name are updated
- [ ] `npm run ts-build` passes
