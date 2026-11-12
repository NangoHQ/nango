# Connect UI agent notes

## Two packages

Connect UI is split across two packages. A fix in the wrong one, or a deploy of the wrong service, silently changes nothing.

| Package                                      | Role                                                                                                                             | Ships with                                                                                                       |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `@nangohq/frontend` (`packages/frontend`)    | The SDK. Creates the `<iframe id="connect-ui">` (`packages/frontend/lib/connectUI.ts`), opens and closes it, and talks to it with `postMessage`. | The `app_ui` service (the webapp bundles it), the `connect_ui` service (the iframe app bundles it too), and the npm release (`scripts/publish.mjs`) for customers. |
| `@nangohq/connect-ui` (`packages/connect-ui`) | The React app that runs inside the iframe.                                                                                       | The `connect_ui` service.                                                                                        |

Deploy services are the `service` input of `.github/workflows/deploy.yaml`.

SDK behaviour is hard to reproduce through the dashboard. Verify it with a unit test next to `packages/frontend/lib/index.unit.test.ts` or a small local HTML page that loads the SDK, and treat a development deploy as a smoke test only.
