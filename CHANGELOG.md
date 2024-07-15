# Changelog

All notable changes to this project will be documented in this file.

## [v0.41.1] - 2024-07-12

### Added

- *(internal-integration-templates)* [nan-1343] allow integration templates to be run from the repo (#2473) by @khaliqgant
- *(integrations)* Add support for zoominfo (#2469) by @hassan254-prog
- *(oauth2)* Add coros provider to list of clientProviders (#2476) by @hassan254-prog
- *(integrations)* Add support for Coros (#2449) by @henrymgarrett
- *(integrations)* Add support for listmonk (#2480) by @samuelandert
- *(account)* Check password strength (#2483) by @bodinsamuel
- *(integration-templates)* [nan-1350] internal template versioning process (#2491) by @khaliqgant
- *(integration-templates)* Add luma integration template (#2490) by @hassan254-prog

### Changed

- Data validation (#2468) by @bodinsamuel
- *(CLI)* Protect against sync model renaming destructive consequences (#2475) by @TBonnin
- *(deps-dev)* Bump fast-loops from 1.1.3 to 1.1.4 (#2492) by @dependabot[bot]
- *(scheduler)* Cleanup tasks and schedules (#2485) by @TBonnin

### Fixed

- *(ui)* Toggle was not in sync with actual state (#2472) by @bodinsamuel
- *(integration-templates)* [nan-1328] remove auto start false (#2479) by @khaliqgant
- Handle big payload across the stack (#2474) by @bodinsamuel
- *(slack-notifications)* [nan-1164] add lock check for remove failing connection (#2482) by @khaliqgant
- Slow connection page (#2481) by @TBonnin
- *(validation)* Change default to false (#2487) by @bodinsamuel
- *(auth)* Do not display refresh button if not possible (#2484) by @bodinsamuel
- *(auth)* Stop leaking stack and credentials when erroring (#2489) by @bodinsamuel
- *(types)* Correct Timestamps, move env and account (#2486) by @bodinsamuel
- *(webapp)* [nan-1356] fix UI for syncs (#2498) by @khaliqgant
- *(webapp)* [nan-1295] stable ordering of syncs and actions (#2497) by @khaliqgant
- Token refresh locking logic (#2494) by @TBonnin
- *(integration-templates)* [nan-1366] add .nango dir and fix path (#2500) by @khaliqgant
- *(nango-yaml)* Disallow empty array (#2501) by @bodinsamuel
- *(validation)* Cache ajv compilation (#2502) by @bodinsamuel
- *(ui)* Reup Admin, fix input size (#2503) by @bodinsamuel
- Retry strategy (#2505) by @TBonnin
- *(nango-yaml)* Handle fields duplicated by extends (#2504) by @bodinsamuel

## [v0.41.0] - 2024-07-05

### Added

- *(integration-templates)* [nan-1328] add xero templates (#2452) by @khaliqgant
- *(integrations)* Add support for webflow (#2446) by @hassan254-prog
- *(integrations)* Add support for luma (#2453) by @hassan254-prog
- *(slack-notifications)* [nan-1148] slack notification UI polish (#2455) by @khaliqgant
- Validate action output, support dryun (#2454) by @bodinsamuel
- *(integrations)* Add support for garmin (#2445) by @hassan254-prog
- *(integration-templates)* [nan-1328] update xero more after test (#2463) by @khaliqgant
- Add kapa.ai (#2471) by @bodinsamuel
- *(integrations)* Add support for klaviyo-OAuth (#2470) by @hassan254-prog
- *(cli-reference)* [nan-1168] allow a user to reference a file to use for the input or metadata (#2464) by @khaliqgant
- Validate sync records (#2457) by @bodinsamuel
- *(integration-templates)* Add sharepoint integration templates (#2467) by @hassan254-prog

### Changed

- Reduce dequeue long polling timeout to 10s (#2459) by @TBonnin
- *(CLI)* Force confirmation when deletedSyncs (#2440) by @TBonnin

### Fixed

- *(validation)* Do no throw if invalid json schema (#2447) by @bodinsamuel
- *(webapp)* Fix spinner button (#2450) by @khaliqgant
- *(unanet-integration-template)* [nan-1298] tweaks to the template (#2451) by @khaliqgant
- *(nango-yaml)* Handle deep circular ref, correctly output recursive models (#2448) by @bodinsamuel
- *(ui)* Syncs use table and correct button depending on sync_type (#2441) by @bodinsamuel
- *(types)* Correct webhooks inheritance and exports  (#2458) by @bodinsamuel
- *(integration-templates)* [nan-1327] add response_path (#2460) by @khaliqgant
- *(slack-notifications)* [nan-1148] notification tweaks based on product conversation (#2461) by @khaliqgant
- *(ui)* Truncate long strings (#2456) by @bodinsamuel
- *(nango-yaml)* Object -> Record (#2466) by @bodinsamuel
- *(cli)* [nan-1344] allow type imports (#2465) by @khaliqgant

## [v0.40.10] - 2024-07-02

### Fixed

- *(node)* Correctly export Auth and Webhooks type (#2442) by @bodinsamuel
- *(validation)* Use feature flag (#2444) by @bodinsamuel
- Frequency when no quantity (#2443) by @TBonnin

## [v0.40.9] - 2024-07-02

### Fixed

- *(integration-templates)* [nan-1298] unanet updates (#2438) by @khaliqgant
- Pinning CLI dependencies (#2439) by @TBonnin
- *(ui)* Integration table style + wording (#2435) by @bodinsamuel

## [v0.40.8] - 2024-07-02

### Added

- *(integrations)* Add support for Oura  (#2417) by @henrymgarrett
- *(integrations)* Add certn implementation and cleanup other integrations (#2418) by @khaliqgant

### Changed

- Remove temporal (#2403) by @TBonnin
- Send metric when tasks change state (#2429) by @TBonnin
- Cleaning up legacy records tables (#2432) by @TBonnin
- RECORDS_DATABASE_URL defaults to main db (#2431) by @TBonnin

### Fixed

- *(sdk)* Handle internal issue when reaching persist (#2416) by @bodinsamuel
- Schedule nextDueDate should be null when schedule is not running (#2420) by @TBonnin
- *(tracing)* Various (#2413) by @bodinsamuel
- *(slack-notifications)* [nan-1164] dedupe slack notifications (#2421) by @khaliqgant
- *(webapp)* [nan-1164] fix connection count when filtering (#2423) by @khaliqgant
- *(tba-integration)* [nan 1259] support netsuite tba authorization (#2425) by @khaliqgant
- *(tracing)* Various fix (#2422) by @bodinsamuel
- Support post connection script execution in jobs handler (#2427) by @TBonnin
- Create processor for post connection scripts (#2428) by @TBonnin
- Every 1 hour" in nango.yaml -> "every1h" in UI (#2430) by @TBonnin
- /api/v1/sync is slow (#2424) by @TBonnin
- *(pagination)* [nan-1193] fix pagination (#2434) by @khaliqgant
- *(syncs)* Use JSON schema and validate action input (#2426) by @bodinsamuel
- Missing syncs in connections page (#2437) by @TBonnin
- *(ui)* Display code snippets more appropriately (#2436) by @bodinsamuel
- *(slack-notifications)* [nan-1164] multiple notifications on refresh error (#2433) by @khaliqgant

## [v0.40.7] - 2024-06-27

### Added

- *(integration-templates)* [nan 1235] unanet integration (#2399) by @khaliqgant
- *(google-mail)* Support adding headers to send-email action (#2391) by @Pyloris
- *(integration-templates)* Fix asana update fields (#2392) by @hassan254-prog
- *(integrations)* Add support for autodesk (#2393) by @hassan254-prog
- *(integrations)* Add support for wordpress (#2394) by @hassan254-prog
- *(cli)* Exports json schema (#2362) by @bodinsamuel
- *(integration-templates)* Add outputs (#2405) by @khaliqgant
- *(metrics)* Add sync, action, webhook, post script, proxy (#2398) by @bodinsamuel
- *(jira-basic)* Add support for jira-basic (#2410) by @hassan254-prog
- *(logs.v1)* Drop data (#2414) by @bodinsamuel
- *(tba-integration)* [nan-1259] support netsuite tba authorization (#2415) by @khaliqgant
- *(integrations)* Add support for medallia (#2411) by @hassan254-prog

### Fixed

- *(logs.v1)* Remove auth, slack, activities, etc. (#2400) by @bodinsamuel
- *(tracing)* Missing call to finish() (#2408) by @bodinsamuel
- *(integrations)* Better check for competing model names (#2409) by @khaliqgant
- /sync/status should return sync frequency (#2402) by @TBonnin
- *(orchestrator)* Update schedule last task when running sync manually and add runSyncCommand error loggging (#2401) by @TBonnin
- *(logs.v1)* Remove remaining (#2407) by @bodinsamuel
- *(telemetry)* Missing envId (#2412) by @bodinsamuel
- *(axios)* Disable axios proxy when passing agent (#2396) by @mithlesh135
- *(syncConfigs)* Handle new model_schema + display in the UI (#2404) by @bodinsamuel
- *(deploy)* Pass jsonSchema (#2406) by @bodinsamuel
- *(deploy)* Reconcile flag was turned off (#2419) by @bodinsamuel

## [v0.40.6] - 2024-06-24

### Added

- *(scheduler)* Add tracing (#2374) by @TBonnin
- Add last_scheduled_task_id column to schedules (#2382) by @TBonnin
- *(integration-templates)* [nan-1188] add calendly syncs (#2379) by @khaliqgant
- *(db)* Add models_json_schema to sync_configs (#2369) by @bodinsamuel
- *(integration-templates)* [nan-1192] add checkr syncs and actions (#2378) by @khaliqgant
- *(integration-templates)* Add fields to asana update-task (#2384) by @hassan254-prog
- *(oauth2_cc)* Add necessary parameters when creating connection (#2345) by @hassan254-prog
- *(integrations)* Add support for various oauth2_cc providers (#2346) by @hassan254-prog

### Changed

- Use last_scheduled_task_id for dueSchedules query (#2383) by @TBonnin

### Fixed

- Don't update schedule if frequency is alread set to the same value (#2380) by @TBonnin
- Missing await by @TBonnin
- *(integrations)* [nan-1188] add pagination (#2385) by @khaliqgant
- *(server)* Deploy+confirmation split and check (#2358) by @bodinsamuel
- *(eslint)* Enable @typescript-eslint/require-await (#2381) by @bodinsamuel
- *(connection)* Refresh credentials should re-fetch connection before proceeding (#2387) by @bodinsamuel
- *(activeLogs)* Drop v1 activity_log_id (#2390) by @bodinsamuel
- *(sdk)* Simplify message on validation error (#2389) by @bodinsamuel
- *(logs)* Handle maximum filters gracefully (#2388) by @bodinsamuel
- *(logs.v1)* Remove unauth, deploy, post script, GET connection (#2386) by @bodinsamuel
- *(deploy)* Increase description limit (#2397) by @bodinsamuel
- *(run)* Use SyncConfig instead of NangoConfig (#2375) by @bodinsamuel

## [v0.40.5] - 2024-06-20

### Added

- *(integrations)* [nan-1247] add checkr post connection script (#2370) by @khaliqgant

### Changed

- *(nango-yaml)* Exhaustive list of supported syntax (#2367) by @bodinsamuel
- Remove empty docs pages and fix broken links (#2372) by @bastienbeurier
- *(scheduler)* Create tasks in parallel (#2373) by @TBonnin

### Fixed

- *(auth)* [nan-1249] update number to refresh and update last fetched even if failed (#2368) by @khaliqgant
- *(logs.v1)* Remove auth, action, hooks (#2363) by @bodinsamuel
- *(server)* Log request and add route to tracing (#2371) by @bodinsamuel
- *(nango-yaml)* Support __string advanced syntax (#2377) by @bodinsamuel

## [v0.40.4] - 2024-06-19

### Fixed

- Missing created task events (#2364) by @TBonnin
- *(deps)* Upgrade vitest (#2357) by @bodinsamuel
- *(nango-yaml)* Fine tune parsing (#2366) by @bodinsamuel

## [v0.40.3] - 2024-06-18

### Changed

- *(deps)* Bump braces from 3.0.2 to 3.0.3 (#2304) by @dependabot[bot]
- *(deps)* Bump ws from 8.16.0 to 8.17.1 (#2354) by @dependabot[bot]
- Prevent concurrent scheduling (#2359) by @TBonnin

### Fixed

- *(orchestrator)* Update message when updating frequency (#2355) by @bodinsamuel
- *(integration-templates)* [nan-1239] fix integration-template upload (#2356) by @khaliqgant
- *(jobs)* Initialize tracer in processing worker threads (#2361) by @TBonnin
- *(logs)* Insert message without an ID (#2360) by @bodinsamuel
- *(nango-yaml)* Allow endpoint to be reused across integration (#2365) by @bodinsamuel

## [v0.40.2] - 2024-06-18

### Added

- *(integration-templates)* Add workflow and edit existing (#2337) by @khaliqgant
- *(integrations)* Add support for checkr-partner (#2339) by @hassan254-prog
- *(nango.yaml)* Dedicated package, stricter parsing, wider types support (#2303) by @bodinsamuel

### Changed

- One-off script to migrate undeleted schedules to orchestrator db (#2326) by @TBonnin
- *(logs)* Remove beta (#2350) by @bodinsamuel
- *(logs.v1)* Remove API, proxy (#2349) by @bodinsamuel

### Fixed

- *(webhooks)* [nan-1142] allow empty string for url (#2347) by @khaliqgant
- *(yaml)* Handle extends properly (#2348) by @khaliqgant

## [v0.40.1] - 2024-06-17

### Added

- *(orchestrator)* Pause/unpause/delete sync (#2289) by @TBonnin
- *(orchestrator)* Implement runSyncCommand (#2290) by @TBonnin
- *(integrations)* Add support for fireflies (#2287) by @hassan254-prog
- *(integrations)* Add support for microsoft power bi (#2293) by @hassan254-prog
- *(logs)* Remove v1 UI (#2276) by @bodinsamuel
- *(orchestrator)* Add update frequency (#2298) by @TBonnin
- *(integrations)* Add Jira Data Center support (#2308) by @zdhickman
- Schedule syncs via the orchestrator (#2309) by @TBonnin
- Add contribution guidelines (#2285) by @bastienbeurier
- *(webhooks)* [nan-1142] migrate to the external webhooks table (#2302) by @khaliqgant
- Process syncs via the orchestrator (#2315) by @TBonnin
- *(asana)* [nan-1187] retry after for asana (#2328) by @khaliqgant
- *(integrations)* Add support for unanet (#2330) by @hassan254-prog
- *(integrations)* [nan-1187] add asana templates (#2334) by @khaliqgant
- *(docs)* [nan-1172] relative file imports documentation (#2336) by @khaliqgant
- *(webhooks)* [nan-1142] update options on environment settings to allow more use settings (#2319) by @khaliqgant

### Changed

- Delete sync schedule (#2301) by @TBonnin
- Getting sync data from orchestrator (#2316) by @TBonnin
- Disable sync retry (#2322) by @TBonnin
- *(logger)* Handle object, better local output (#2321) by @bodinsamuel
- *(logs.v1)* Remove from persist (#2332) by @bodinsamuel

### Fixed

- *(logs)* Match preset from date range (#2294) by @bodinsamuel
- Missing webhooks dependencies in jobs (#2299) by @TBonnin
- Prevent concurrent scheduling of tasks (#2296) by @TBonnin
- *(cli)* Use absolute path (#2297) by @bodinsamuel
- *(webhooks)* [nan-1178] disable automatic opt in for webhook settings (#2306) by @khaliqgant
- *(webhooks)* [nan-1173] fix webhooks (#2300) by @khaliqgant
- *(deps)* Simple-oauth2 5.0.1 (#2305) by @bodinsamuel
- *(scheduler)* Retrying when task fails can interfere with scheduling (#2310) by @TBonnin
- *(logs)* Cosmetic fix (#2307) by @bodinsamuel
- Incorrect import of orchestratorService (#2314) by @TBonnin
- *(ui)* Make the connection creation date into a <time> element with a title (#2313) by @eabruzzese
- *(scheduler)* Remove retry_count column for schedules (#2318) by @TBonnin
- Event should be emitted when task is created by scheduling worker (#2317) by @TBonnin
- *(logs)* Correct timeout (#2320) by @bodinsamuel
- *(slack)* Only notify success when refreshing (#2323) by @bodinsamuel
- *(webhooks)* [nan-1204] make queryTimestamp always present (#2324) by @khaliqgant
- *(logs)* Missing success for syncs (#2325) by @bodinsamuel
- *(jobs)* Wrong boolean for getSyncConfigRaw (#2327) by @bodinsamuel
- *(slack)* Only notify success if it has refreshed (again) (#2333) by @bodinsamuel
- Orchestrator bugs (#2331) by @TBonnin
- Remove orchestrator event emmitter max listeners limit (#2335) by @TBonnin
- *(integration-templates)* [nan-1187] add slash (#2340) by @khaliqgant
- Remove schedule_id column in schedules (#2338) by @TBonnin
- *(orchestrator)* Accept every in sync interval (#2341) by @TBonnin
- *(webhook-settings)* [nan-1142] visual feedback while checkboxes are loading and ensure all values are boolean (#2344) by @khaliqgant

## [v0.40.0] - 2024-06-10

### Added

- *(proxy)* Support sending requests through HTTPS_PROXY (#2243) by @mithlesh135
- *(logs)* Timeout old operations (#2220) by @bodinsamuel
- *(integrations)* Add support for marketo (#2234) by @hassan254-prog
- *(processor)* Add tracing/logging to processTask function (#2250) by @TBonnin
- *(google-mail)* Action script to send an email using google-mail integration (#2242) by @Pyloris
- *(integrations)* Add support for highlevel white-label (#2251) by @hassan254-prog
- Add sync type and validation for orchestrator TaskSync (#2256) by @TBonnin
- *(integrations)* Add support for datev (#2223) by @hassan254-prog
- *(orchestrator)* Add support for schedules (#2260) by @TBonnin
- Expose environment name in scripts (#2268) by @TBonnin
- *(integrations)* Add support for vimeo (#2271) by @hassan254-prog
- *(webhooks)* [nan-1063] webhook on refresh error and slack notification (#2254) by @khaliqgant
- *(orchestrator)* Scheduling tasks based on schedules (#2274) by @TBonnin
- *(integrations)* Add support for instantly api key (#2265) by @jwd-dev
- *(cli)* [nan-1106] import relative files in syncs/actions (#2273) by @khaliqgant
- *(webhooks)* [nan 1064] webhook on sync error (#2281) by @khaliqgant
- *(orchestrator)* Add endpoint to api/client to run a schedule (#2283) by @TBonnin

### Changed

- Rename orchestrator waitForCompletion param to longPolling (#2238) by @TBonnin
- Actions and webhooks can be executed by orchestrator (#2237) by @TBonnin

### Fixed

- *(notificaitions)* [nan-981] Tighten up spacing + update notification display on list connections if a failure on the sync (#2247) by @khaliqgant
- *(ui)* Use common fetch method (#2246) by @bodinsamuel
- *(proxy)* Handle gzip response stream (#2248) by @bodinsamuel
- *(cli)* [nan-1088] support older cli versions (#2253) by @khaliqgant
- *(logs)* Ui feedback (#2249) by @bodinsamuel
- *(orchestratorClient)* Race condition in dequeue (#2252) by @TBonnin
- *(logs)* Feedback #3 (#2255) by @bodinsamuel
- *(orchestrator)* Race condition in dequeue (#2261) by @TBonnin
- *(proxy)* [nan-1049] if encoded at all then use pass through (#2262) by @khaliqgant
- *(logs)* Handle buffered activities (#2257) by @bodinsamuel
- *(integrations)* Fix mailgun logo (#2264) by @hassan254-prog
- Actions/webhooks without input should not failed (#2267) by @TBonnin
- *(orchestrator)* Accept bigger task output (#2270) by @TBonnin
- Post script connection error + handle in logs (#2259) by @bodinsamuel
- *(server)* [nan-979] Remove dupes if two or more syncs have an error for the connections list page (#2263) by @khaliqgant
- *(logs)* Feedback #4 (#2269) by @bodinsamuel
- *(webapp)* [nan-1086] route to the demo after verifying (#2275) by @khaliqgant
- *(dependency)* Cleanup and upgrade some (#2272) by @bodinsamuel
- Return error message when action fails (#2277) by @TBonnin
- Actions/webhooks should always report failure when failing (#2278) by @TBonnin
- *(cli)* [nan-1105] don't overwrite post connection file if it exists already (#2282) by @khaliqgant
- *(server)* Embed router in a subpath (#2279) by @bodinsamuel
- *(dockerfile)* Persist use unified Dockerfile (#2280) by @bodinsamuel
- *(webapp)* [nan-1147] remove refresh option on refresh token (#2284) by @khaliqgant
- *(logs)* Missing env, sort query params (#2288) by @bodinsamuel
- *(docker)* Stop compiling persist, autocompile tsconfig.docker.json (#2286) by @bodinsamuel
- *(server)* [nan-1167] fix types (#2295) by @khaliqgant

## [v0.39.33] - 2024-06-03

### Added

- *(logs)* Pagination and infinite scroll (#2213) by @bodinsamuel
- *(logs)* Messages infinite scroll and live refresh (#2214) by @bodinsamuel
- *(integrations)* Add support for various mircosoft graph api services (#2209) by @hassan254-prog
- *(logs)* Daily index, policy, retention (#2216) by @bodinsamuel
- Add command to generate encryption key to .env.example (#2227) by @TBonnin
- *(orchestrator)* Implement task processor (#2221) by @TBonnin
- *(logs)* Share an operation via URL (#2217) by @bodinsamuel
- *(scheduler)* Add indexes for tables tasks (#2230) by @TBonnin
- *(pkgs)* Create kvstore  (#2235) by @bodinsamuel
- *(integrations)* Add mailgun API key (#2177) by @jwd-dev
- *(server)* [nan-981] implement error reporting UI on connection authorization sub notification (#2222) by @khaliqgant
- *(server)* [nan-906] run external client post connection scripts (#2225) by @khaliqgant

### Changed

- *(persist)* Make NANGO_ENCRYPTION_KEY required in persist service (#2226) by @TBonnin

### Fixed

- *(orchestrator)* Harden type safety of orchestrator client execute function (#2205) by @TBonnin
- *(server)* [nan-1037] allow an override connection to be refreshed properly (#2215) by @khaliqgant
- *(jobs)* Local runner for enterprise (#2212) by @khaliqgant
- *(server)* [nan-1037] on refresh keep the overrides (#2218) by @khaliqgant
- *(connection)* Upsert return full connection, logs (#2219) by @bodinsamuel
- *(server.proxy)* [nan-1049] if the response not chunked manually piece the response together (#2228) by @khaliqgant
- *(server.proxy)* [nan-1051] allow DELETE to have a body (#2229) by @khaliqgant
- *(logs)* First prod feedback (#2224) by @bodinsamuel
- *(docker)* Missing orchestrator env (#2232) by @bodinsamuel
- *(processor)* Queue with max concurrency implementation (#2231) by @TBonnin
- *(database)* [nan-1063] migrate to database package (#2236) by @khaliqgant
- Update location of migration directory (#2245) by @khaliqgant

## [v0.39.32] - 2024-05-28

### Added

- *(server)* [nan-981] prep for implementing error reporting UI on connection authorization sub (#2204) by @khaliqgant

### Fixed

- *(docker)* Wrong node version for jobs (#2211) by @bodinsamuel

## [v0.39.31] - 2024-05-27

### Added

- *(scheduler)* All terminated tasks can have an output (#2172) by @TBonnin
- *(runner)* [nan-996] return descriptive error from action with revoked creds (#2182) by @khaliqgant
- *(logs)* Drawer with details (#2155) by @bodinsamuel
- *(webapp)* [nan-983] show slack banner if conditions are met (#2184) by @khaliqgant
- Add orchestrator to deploy Github Actions (#2186) by @TBonnin
- *(server)* [nan-869] email verification on signup (#2173) by @khaliqgant
- *(integrations)* Add support for tremendous (#2192) by @hassan254-prog
- Allow upsert existing basic connection (#2181) by @descampsk
- *(orchestrator)* Dry run execute action/webhook (#2176) by @TBonnin
- *(integrations)* Add support for wrike (#2200) by @hassan254-prog
- *(integrations)* Add support for signnow (#2201) by @hassan254-prog
- *(logs)* UI filtering (#2193) by @bodinsamuel
- *(logs)* Opensearch -> elasticsearch (#2196) by @bodinsamuel
- *(orchestrator)* Add long polling option for /output endpoint (#2202) by @TBonnin
- *(integrations)* Add support for productboard (#2194) by @hassan254-prog
- *(logs)* Add date range filtering (#2207) by @bodinsamuel

### Changed

- Making the scheduler db not rely on env vars (#2171) by @TBonnin
- Moving integrations/webhook folder out of shared (#2185) by @TBonnin
- Move hooks related logic to server (#2188) by @TBonnin
- *(logs)* Document elasticsearch and self-host (#2206) by @bodinsamuel

### Fixed

- *(webpapp)* [nan-968] helper for formatting the frequency (#2183) by @khaliqgant
- *(jobs)* [nan-1010] use void (#2195) by @khaliqgant
- *(cli)* [nan-992] fix with test case (#2199) by @khaliqgant
- *(logs)* Consolidate metadata (#2187) by @bodinsamuel
- *(docs)* More info about frequency notations (#2203) by @bastienbeurier
- *(version)* Store version in a file instead of reading package.json (#2208) by @bodinsamuel
- *(demo)* Incorrect token used to oauth (#2210) by @bodinsamuel

## [v0.39.30] - 2024-05-21

### Added

- Add env.local file (#2178) by @khaliqgant
- *(integrations)* Add support for woocommerce (#2175) by @hassan254-prog

### Fixed

- *(client)* Build esm/cjs compatible client (#2180) by @bodinsamuel

## [v0.39.29] - 2024-05-20

### Added

- *(jobs)* [nan-919] reconcile temporal schedules (#2149) by @khaliqgant
- *(client)* Add user-agent, reuse http agent (#2153) by @bodinsamuel
- [nan-919] only fix for paused and allow concurrent actions (#2165) by @khaliqgant
- *(scripts)* [nan-973] slack integration for each environment (#2168) by @khaliqgant
- Introduces the orchestra API and client (#2162) by @TBonnin
- *(api)* [NAN-793] bulk metadata update api (#2145) by @khaliqgant

### Fixed

- *(action)* Debug empty response (#2160) by @bodinsamuel
- *(api)* Handle invalid json payload (#2161) by @bodinsamuel
- *(temporal)* [nan-919] more quiet logs and add in the previous note (#2164) by @khaliqgant
- *(getSyncs)* Should not join on action (#2167) by @bodinsamuel
- *(persist)* Catch invalid payload early (#2166) by @bodinsamuel
- *(temporal)* Should not be loaded for oauth install (#2151) by @bodinsamuel
- *(temporal)* Handle error outside the scripts (#2163) by @bodinsamuel
- Headers issues in sync (#2169) by @bodinsamuel
- *(webapp)* [nan-968] when success if null it has a specific status (#2170) by @khaliqgant
- *(server)* [nan-990] hosted logic for sync tab (#2174) by @khaliqgant

## [v0.39.28] - 2024-05-15

### Added

- *(db)* Add ability to change schema name (#2126) by @bodinsamuel
- *(orchestration)* Introducing the scheduler (#2132) by @TBonnin
- *(db)* Add extensions to search_path (#2143) by @t1mmen
- *(webapp)* [nan-839] add secondary url (#2135) by @khaliqgant
- [nan-851] improve query to use the nango_config_id (#2124) by @khaliqgant
- *(logs)* GET /logs/operations/:operationId (#2156) by @bodinsamuel
- *(cli)* [nan-918] exit deploy if not everything compiled successfully (#2158) by @khaliqgant

### Fixed

- *(action)* Logs ActionError in activities (#2148) by @bodinsamuel
- *(db)* Backfill secret key hash (#2134) by @bodinsamuel
- *(action)* Log all errors by @bodinsamuel
- *(env)* Correctly parse db-schemas (#2154) by @bodinsamuel
- *(oauth)* [nan-934] fix public key lookup (#2157) by @khaliqgant
- *(ui)* Env switching issue (#2152) by @bodinsamuel
- *(webapp)* [nan-943] fix API reference for multi models (#2159) by @khaliqgant

## [v0.39.27] - 2024-05-13

### Added

- *(logs)* Add more context #2 (#2146) by @bodinsamuel
- *(ui)* Logs search mvp  (#2106) by @bodinsamuel

### Fixed

- *(release)* Improve changelog (#2147) by @bodinsamuel

## [v0.39.26] - 2024-05-13

### Fixed

- *(schedule)* Add scheduleId and warn label (#2142) by @khaliqgant
- *(schedule)* Comparison when checking if a schedule is paused (#2144) by @khaliqgant
- *(release)* Publish correctly to github (#2141) by @bodinsamuel

## [v0.39.25] - 2024-05-10

### Added

- *(integrations)* Add support for dialpad (#2082) by @hassan254-prog
- *(logs)* POST /logs/search (#2063) by @bodinsamuel
- *(debug)* Add more details when pausing temporal schedule (#2139) by @TBonnin
- *(sdk)* Add more caching (#2111) by @bodinsamuel
- *(metrics)* [NAN-664] track more usage metrics in datadog (#2136) by @khaliqgant

### Changed

- Remove heroku/render from self-hosted guides (#2110) by @bodinsamuel
- Better Result types (#2116) by @TBonnin
- Publish missing main package version in lock (#2138) by @bodinsamuel

### Fixed

- *(release)* Automatic release publishing (#2103) by @bodinsamuel
- *(server)* Remove list schedules (#2137) by @khaliqgant
- *(sdk)* Logging null breaks script (#2140) by @bodinsamuel

## [v0.39.24] - 2024-05-10

### Added

- *(oauth2cc)* Add authorization request parameters (#2053) by @hassan254-prog
- *(logs)* Add more context data (#2034) by @bodinsamuel
- *(integrations)* Add support for posthog api (#2102) by @hassan254-prog
- *(integrations)* Add support for wealthbox (#2109) by @hassan254-prog
- *(auth)* Add span and cache 🙈 (#2114) by @bodinsamuel
- *(persist)* Add error details in auth.middleware (#2113) by @TBonnin
- *(integrations)* Add support for lessonly api (#2083) by @hassan254-prog
- *(integrations)* Add support for envoy api (#2092) by @hassan254-prog
- *(integration)* Add strava-web-oauth integration (#2118) by @findachin
- *(integration)* Add Bland.ai (#2098) by @jwd-dev
- *(integrations)* Add support for pivotaltracker api (#2084) by @hassan254-prog

### Changed

- Script to migrate records (#1934) by @TBonnin
- No cap (#2104) by @khaliqgant
- *(deps)* Bump ejs from 3.1.9 to 3.1.10 (#2078) by @dependabot[bot]

### Fixed

- *(persist)* Truncate big logs (#2074) by @bodinsamuel
- *(api)* Handle 404 as json (#2085) by @bodinsamuel
- *(db)* Slow query getSyncs (#2088) by @bodinsamuel
- *(api)* Setup for e2e tests (#2090) by @bodinsamuel
- *(Provider)* Proxy is optional (#2096) by @bodinsamuel
- *(docker)* Set correct platform (#2101) by @bodinsamuel
- *(logs)* Make it completely optional (#2100) by @bodinsamuel
- *(api)* Unified context (#2097) by @bodinsamuel
- Latency and type error (#2112) by @bodinsamuel
- Ensure secret_key_hashed is updated when needed (#2119) by @TBonnin
- Set secret_key_hashed when creating environment (#2122) by @TBonnin
- Show error details from persist in activity logs (#2129) by @TBonnin

## [v0.39.23] - 2024-05-01

### Added

- Add authentication (#2076) by @TBonnin

### Changed

- Return new upsert result + retry upsert (#2079) by @TBonnin

## [v0.39.22] - 2024-05-01

### Fixed

- *(eslint)* Pass #11 (#2058) by @bodinsamuel

## [v0.39.21] - 2024-04-30

### Added

- Types package (#2055) by @bodinsamuel

## [v0.39.20] - 2024-04-30

### Added

- *(integrations)* Add support for pingboard api (#2052) by @hassan254-prog
- *(integrations)* Add support for squarespace (#2031) by @hassan254-prog

### Changed

- *(pkg)* Dirty release commit (#2056) by @bodinsamuel

### Fixed

- *(sync)* Maximum call stack for large dataset (#2064) by @bodinsamuel

## [v0.39.19] - 2024-04-29

### Added

- *(integration)* Add support for google docs api (#1967) by @hassan254-prog
- *(integration)* Add support for kustomer (#1958) by @hassan254-prog
- *(sdks)* Document frontend and node sdks in code (#1984) by @hassan254-prog
- *(db)* Add public to search_path (#2002) by @bodinsamuel
- *(ci)* Add eslint (#2007) by @bodinsamuel
- *(integrations)* Add support for refiner (#2009) by @hassan254-prog
- Add temporal ui to docker-compose (#2006) by @bodinsamuel
- *(integration)* Add api support for insightly (#2028) by @hassan254-prog
- *(integration)* Add api support for freshsales (#2027) by @hassan254-prog
- Hn demo (#2041) by @bodinsamuel
- *(logs)* Implem v2 logging (#1945) by @bodinsamuel
- *(integrations)* Add support for klipfolio api (#2038) by @hassan254-prog
- *(integrations)* Add support for harvest api (#2039) by @hassan254-prog
- *(integrations)* Add support for egnyte api (#2044) by @hassan254-prog
- *(integrations)* Add support for expensify api (#2047) by @hassan254-prog

### Changed

- Correct default action HTTP method by @lukejagg
- Sample app (#2008) by @bodinsamuel
- Sample app feedback (#2013) by @bodinsamuel
- Improve Microsoft OAuth docs by @rguldener

### Fixed

- *(npm)* Use ci instead of install (#1988) by @bodinsamuel
- *(webhooks)* Do not await send (#1977) by @bodinsamuel
- *(node)* Use version 20 (#1989) by @bodinsamuel
- *(api)* Only enable session for web (#1994) by @bodinsamuel
- *(integration)* Use random id on conflict (#1997) by @bodinsamuel
- *(api)* Stop using env cookie (#1987) by @bodinsamuel
- Type of count is a string (#2005) by @bodinsamuel
- *(ci)* Eslint (#2011) by @bodinsamuel
- *(utils)* Move metrics (#2012) by @bodinsamuel
- Logs don't show the context when detecting records differences (#2018) by @TBonnin
- 'localeCompare is not a function' error (#2020) by @TBonnin
- Set same deletedAt/updatedAt for deleted records in the same batch (#2021) by @TBonnin
- *(ui)* Handle long entity names (#2019) by @bodinsamuel
- Swap links in webhooks doc page (#2022) by @TBonnin
- BatchDelete counts already deleted records or non-existing ones as deleted (#2023) by @TBonnin
- *(api)* Wrong join for getSyncs (#2029) by @bodinsamuel
- *(release)* Unify build  (#2026) by @bodinsamuel
- Docker compose  (#2043) by @bodinsamuel
- *(error)* Use stringifier (#2042) by @bodinsamuel
- *(records)* Transaction not reusing opened connection (#2045) by @bodinsamuel
- *(logs)* Wrong zod coerce, add tracer (#2046) by @bodinsamuel
- *(logs)* Missing contextGetter in syncCommand (#2049) by @bodinsamuel
- *(envs)* Allow empty string (#2050) by @bodinsamuel
- *(ui)* Remove HN special login (#2057) by @bodinsamuel
- *(logs)* Only require envs for cloud (#2060) by @bodinsamuel

## [v0.39.18] - 2024-04-11

### Fixed

- *(node)* Missing type for webhook (#1982) by @bodinsamuel

## [v0.39.17] - 2024-04-11

### Changed

- *(deps-dev)* Bump vite from 4.5.2 to 4.5.3 (#1948) by @dependabot[bot]
- *(deps)* Bump undici from 6.6.2 to 6.11.1 (#1955) by @dependabot[bot]

### Fixed

- *(webhooks)* Expose type, fix docs, verifyWebhookSignature helper (#1976) by @bodinsamuel
- *(integration)* Simple fix for peopledatalabs api support (#1964) by @hassan254-prog
- Fix heartbeat (#1980) by @TBonnin
- TypeError: request.headers.split is not a function (#1981) by @TBonnin

## [v0.39.16] - 2024-04-10

### Added

- Logs storage v2 (#1865) by @bodinsamuel
- *(utils)* Add barrel file (#1947) by @bodinsamuel
- *(integrations)* Api support for snowflake (#1962) by @hassan254-prog

### Changed

- *(deps-dev)* Bump webpack-dev-middleware from 5.3.3 to 5.3.4 (#1897) by @dependabot[bot]
- *(deps)* Bump express from 4.18.2 to 4.19.2 (#1914) by @dependabot[bot]
- Report high memory usage (#1943) by @TBonnin

### Fixed

- *(eslint)* Pass #9 (#1928) by @bodinsamuel
- *(ui)* Correct 404 (#1935) by @bodinsamuel
- *(ui)* Sync cookie and url (#1921) by @bodinsamuel
- *(demo)* Server side tracking (#1936) by @bodinsamuel
- *(login)* Correct accountId (#1939) by @bodinsamuel
- *(docker)* Change Postgres version for public docker-compose (#1942) by @bodinsamuel
- Use destructured object on some functions (#1941) by @bodinsamuel
- Remove to getAccountUUIDFromEnvironment (#1944) by @bodinsamuel
- Do not idle runner if idleMaxDurationMs is 0 (#1949) by @TBonnin
- *(eslint)* Pass #10 (#1951) by @bodinsamuel
- *(sync)* VerifyOwnership not awaited (#1952) by @bodinsamuel
- *(error)* Reuse errors definition (#1954) by @bodinsamuel
- *(proxy)* DryRun optional activityLogId (#1959) by @bodinsamuel
- *(demo)* Move step_1 success tracking after the frontend auth (#1961) by @bodinsamuel
- *(providers)* Wave accounting token url (#1966) by @sxtfv
- *(node)* Wrong casing for modified_after (#1972) by @bodinsamuel
- *(node)* Proper types for listRecords and deprecate delta (#1973) by @bodinsamuel
- *(node)* Wrong condition on delta (#1974) by @bodinsamuel

## [v0.39.14] - 2024-04-01

### Fixed

- *(ui)* Environment settings title (#1920) by @bodinsamuel
- *(utils)* Parse env with zod (#1919) by @bodinsamuel
- *(deps)* Pin redis (#1925) by @bodinsamuel

## [v0.39.13] - 2024-03-28

### Added

- *(demo)* Add more backend tracking (#1912) by @bodinsamuel

### Fixed

- *(env)* Re-enable dynamic key (#1899) by @bodinsamuel
- *(ui)* Always identify to posthog (#1900) by @bodinsamuel
- *(demo)* Feedbacks (#1901) by @bodinsamuel
- *(ui)* Hmac issues (#1902) by @bodinsamuel
- *(ui)* Improve cache for session, integrations (#1904) by @bodinsamuel
- BatchDelete returns incorrect sync result (#1907) by @TBonnin
- *(api)* Get env by secretKey (#1908) by @bodinsamuel
- *(env)* Pin Postgres (#1915) by @bodinsamuel

## [v0.37.0] - 2024-03-22

### Fixed

- *(env)* Unsafe getEnvByName (#1896) by @bodinsamuel
- *(flows)* Path + strictness (#1894) by @bodinsamuel

## [v0.39.8] - 2024-03-21

### Fixed

- *(cli)* Glob change of behavior (#1891) by @bodinsamuel

## [v0.39.7] - 2024-03-21

### Fixed

- *(shared)* Specify published files (#1890) by @bodinsamuel

## [v0.39.6] - 2024-03-21

### Added

- Add helpers to vitest (#1869) by @bodinsamuel
- *(integration)* Add integration templates for zoho-mail (#1857) by @hassan254-prog

### Changed

- *(deps)* Bump follow-redirects from 1.15.4 to 1.15.6 (#1864) by @dependabot[bot]
- Unified dockerfile (#1840) by @bodinsamuel
- Remove node 19 (#1883) by @bodinsamuel

### Fixed

- *(deps)* Upgrade knex (#1868) by @bodinsamuel
- *(integrations)* Backfill integration templates (#1833) by @hassan254-prog
- Prevent race condition when updating job results (#1867) by @TBonnin
- *(eslint)* Pass #6 (#1871) by @bodinsamuel
- *(eslint)* Pass #7 (#1874) by @bodinsamuel
- Deleting lots of records (track_deletes=true) (#1878) by @TBonnin
- *(ui)* Env not updating (#1880) by @bodinsamuel
- *(flows)* Enforce compilation (#1881) by @bodinsamuel
- Integration should be unique per environment (#1889) by @TBonnin
- *(eslint)* Pass #8 (#1882) by @bodinsamuel
- *(shared)* Proper ts rootDir (#1887) by @bodinsamuel

## [v0.39.5] - 2024-03-15

### Added

- *(integration)* Add support for lever-basic-sandbox (#1848) by @hassan254-prog

### Fixed

- *(demo)* Feedback (#1855) by @bodinsamuel
- Fix flaky regex (#1859) by @bodinsamuel
- *(demo)* Hide after complete (#1849) by @bodinsamuel
- *(demo)* Feedback 2 (#1860) by @bodinsamuel
- *(activity)* Logs order (#1861) by @bodinsamuel

## [v0.39.4] - 2024-03-14

### Fixed

- *(eslint)* Pass #5 (#1846) by @bodinsamuel
- *(webapp)* Fix copy button value (#1847) by @hassan254-prog
- *(jobs)* Do not wait for temporal (#1850) by @bodinsamuel
- Fix flaky test (#1853) by @bodinsamuel
- *(demo)* Pause new demo (#1851) by @bodinsamuel
- *(ui)* Use hooks for meta/env/user (#1844) by @bodinsamuel

## [v0.39.3] - 2024-03-13

### Added

- Interactive demo (#1801) by @bodinsamuel

## [v0.39.2] - 2024-03-13

### Added

- Show debug mode in UI (#1831) by @bodinsamuel
- *(ui)* Add cn() utils (#1835) by @bodinsamuel
- *(flows)* Add github issues demo example flow (#1834) by @bodinsamuel
- *(eslint)* Add lint-staged (#1843) by @bodinsamuel

### Fixed

- *(demo)* Missing input (#1837) by @bodinsamuel
- *(auth)* Correctly save debug mode in session (#1838) by @bodinsamuel
- Eslint #4 (#1842) by @bodinsamuel

## [v0.39.1] - 2024-03-08

### Added

- *(webapp)* Improve on scopes input fields and download flow (#1794) by @hassan254-prog

### Fixed

- Nango deps version and publish.sh (#1821) by @TBonnin
- *(deps)* Pin aws-sdk (#1826) by @bodinsamuel

## [v0.39.0] - 2024-03-07

### Added

- *(integrations)* Api support for teamtailor (#1747) by @hassan254-prog
- *(integrations)* Integration template for teamtailor (#1748) by @hassan254-prog
- *(webapp)* Improve field values on refresh (#1782) by @hassan254-prog
- *(db)* Add index for isSyncJobRunning (#1793) by @bodinsamuel
- *(integrations)* Api support and integration template for zoho-mail (#1779) by @hassan254-prog
- *(SecretInput)* Handle null optionalvalue gracefully (#1781) by @hassan254-prog
- *(webapp)* Improve input integration ID on edit (#1783) by @hassan254-prog

### Changed

- *(eslint)* --fix #3 (#1798) by @bodinsamuel
- *(deps-dev)* Bump posthog-js from 1.51.4 to 1.57.2 (#1819) by @dependabot[bot]

### Fixed

- *(db)* Missing index on records (#1769) by @bodinsamuel
- *(lint)* Enable type checker (#1756) by @bodinsamuel
- *(cron)* Delete syncs naive approach (#1776) by @bodinsamuel
- *(datadog)* Correctly track runner (#1766) by @bodinsamuel
- *(db)* Clean up indexes (#1787) by @bodinsamuel
- *(dd)* Wrong import in server (#1789) by @bodinsamuel
- *(integration)* Stripe-app access token refresh on expire (#1780) by @hassan254-prog
- *(manifest)* Fix property names (#1795) by @hassan254-prog
- Jobs vulnerability (#1799) by @TBonnin
- *(eslint)* Improve webapp reporting (#1804) by @bodinsamuel
- *(getting-started)* Remove some code snippets, re-up local testing (#1803) by @bodinsamuel
- *(integration)* Teamtailor integration sync template (#1816) by @hassan254-prog
- *(ui)* Remove top nav logout (#1809) by @bodinsamuel
- *(ui)* Move and pin devDependencies (#1808) by @bodinsamuel

## [v0.38.5] - 2024-02-29

### Added

- *(integrations)* Api support for pinterest (#1738) by @hassan254-prog
- *(integrations)* Api support for anrok (#1739) by @hassan254-prog
- *(ui)* Merge with npm workspace (#1735) by @bodinsamuel

### Fixed

- *(db)* Remove schema() (#1746) by @bodinsamuel
- *(deploy)* Correctly output error and end the activity (#1757) by @bodinsamuel
- *(sync)* Off-load data deletion (#1745) by @bodinsamuel

## [v0.38.4] - 2024-02-27

### Changed

- *(deps)* Bump es5-ext from 0.10.62 to 0.10.63 (#1750) by @dependabot[bot]

### Fixed

- *(test)* Update tests (#1749) by @bodinsamuel
- *(connection)* Empty creds when deleting (#1743) by @bodinsamuel
- *(node)* Expose all types (#1751) by @bodinsamuel
- *(cli)* Compiler should skip project (#1752) by @bodinsamuel

## [v0.38.3] - 2024-02-26

### Changed

- *(deps)* Bump ip from 1.1.8 to 1.1.9 (#1711) by @dependabot[bot]

## [v0.38.2] - 2024-02-26

### Added

- *(db)* Add index for getAddedKeys() (#1732) by @bodinsamuel
- *(db)* Add index for connections (#1733) by @bodinsamuel
- *(db)* Add search path (#1727) by @bodinsamuel

### Fixed

- *(server)* Handle undefined status code (#1737) by @bodinsamuel
- *(sync)* Await full cancel (#1740) by @bodinsamuel

## [v0.38.1] - 2024-02-23

### Added

- Add total records count and size metrics (#1725) by @TBonnin

### Changed

- Eslint --fix (#1712) by @bodinsamuel

### Fixed

- *(db)* Remove unnecessary groupBy (#1723) by @bodinsamuel
- *(nango_sync_endpoints)* Relationship doesn't exist (#1731) by @hassan254-prog

## [v0.38.0] - 2024-02-23

### Added

- *(db)* Add index for logs (#1721) by @bodinsamuel
- *(db)* Add index for sync_jobs (#1717) by @bodinsamuel
- *(db)* Add index for data_records (#1719) by @bodinsamuel
- *(db)* Add index to configs (#1724) by @bodinsamuel

## [v0.37.26] - 2024-02-22

### Changed

- Temporal activities timeout (#1720) by @TBonnin

### Fixed

- Use GET /config/KEY to obtain provider in cli dryrun (#1722) by @TBonnin

## [v0.37.25] - 2024-02-22

### Added

- *(integrations)* Add support and integration for nextcloud (#1635) by @hassan254-prog
- *(integrations)* Add integration templates for ashby (#1637) by @hassan254-prog
- *(sdk)* Add optional telemetry (#1683) by @bodinsamuel
- Add logging when returning error in auth middleware (#1694) by @TBonnin
- *(sync)* Allow to force a full sync anytime (#1658) by @bodinsamuel

### Changed

- *(deps)* Bump undici from 6.2.1 to 6.6.1 (#1689) by @dependabot[bot]
- Remove unecessary call to API (#1709) by @TBonnin
- Rate limiter v1 (#1708) by @TBonnin
- Enable sdk telemetry (#1715) by @bodinsamuel

### Fixed

- *(sync)* Always trust lastSyncDate (#1685) by @bodinsamuel
- *(activity)* UI filters are inverted (#1688) by @bodinsamuel
- *(datadog)* Incorrect metric for sync  (#1695) by @bodinsamuel
- Error response logging (#1699) by @TBonnin
- *(ui)* Track getting started (#1700) by @bodinsamuel
- *(cron)* Delete old activities safely (#1698) by @bodinsamuel
- *(dd)* Correctly load tracer (#1705) by @bodinsamuel
- *(cron)* Fine tune delete old activities (#1706) by @bodinsamuel
- *(cron)* Env naming (#1714) by @bodinsamuel

## [v0.37.24] - 2024-02-16

### Added

- *(telemetry)* Use dd-trace for metrics (#1681) by @bodinsamuel
- *(activity)* Connection and integration filters in activities (#1648) by @hassan254-prog
- *(integrations)* Integration template for hibob (#1636) by @hassan254-prog

### Fixed

- *(datadog)* Incorrect instrumentation (#1671) by @bodinsamuel
- *(cli)* Remember upgrade choice (#1666) by @bodinsamuel
- *(sdk)* Deprecate setLastSyncDate() (#1679) by @bodinsamuel
- *(activity)* Limit the number of logs displayed (#1665) by @bodinsamuel

## [v0.37.23] - 2024-02-14

### Added

- Add retry for greenhouse (#1660) by @TBonnin

### Changed

- Dev clean up (#1651) by @bodinsamuel
- Use hosted tag for nango-server (#1663) by @TBonnin

### Fixed

- *(demo)* Run every 5minutes (#1649) by @bodinsamuel
- *(demo)* Auto idle demo after a few days (#1631) by @bodinsamuel
- *(docker)* Dist is not compiled in the docker image but copied (#1654) by @bodinsamuel
- Wrong export (#1655) by @bodinsamuel
- *(ui)* Autocomplete new password (#1652) by @bodinsamuel
- ConnectionConfigParams parsing (#1659) by @TBonnin
- *(jobs)* Missing package (#1661) by @bodinsamuel
- *(ci)* Dedup jobs (#1653) by @bodinsamuel
- *(ci)* Incorrect commit sha in PR (#1664) by @bodinsamuel
- *(runner)* Proper typing  (#1634) by @bodinsamuel
- *(ci)* Bad substition (#1667) by @bodinsamuel
- *(ci)* Missing alternatives on master (#1668) by @bodinsamuel
- Fix action guide link (#1669) by @Hahlh

## [v0.37.22] - 2024-02-08

### Changed

- Proxy should log to console (#1640) by @TBonnin
- Eslint upgrade (#1630) by @bodinsamuel

## [v0.37.21] - 2024-02-08

### Changed

- Reduce js bundle size by a 1/3 with lazy routes (#1577) by @danivazx

### Fixed

- *(action)* Be stricter about error and activity log  (#1628) by @bodinsamuel

## [v0.37.20] - 2024-02-07

### Added

- *(integrations)* Linear incoming webhooks support (#1617) by @bodinsamuel

### Changed

- Eslint --fix (#1627) by @bodinsamuel

### Fixed

- *(webhooks)* Select only configured syncs (#1621) by @bodinsamuel

## [v0.37.19] - 2024-02-06

### Added

- *(reporting)* Add error in datadog APM (#1615) by @bodinsamuel

### Fixed

- *(activity)* Reduce time and memory allocated for cleaning the table (#1616) by @bodinsamuel

## [v0.37.17] - 2024-02-02

### Fixed

- Webapp version number flick (#1578) by @danivazx

## [v0.37.13] - 2024-02-02

### Changed

- Improve errors logging + lastSyncDate = new Date if undefined (#1586) by @TBonnin
- Filter config param if in response_metadata (#1570) by @TBonnin
- Increase request size limit (#1594) by @TBonnin
- Always track records size/count, not just when writing was successful (#1596) by @TBonnin

### Fixed

- Error detail for postgresql 22001 error (#1597) by @TBonnin

## [v0.37.9] - 2024-01-30

### Fixed

- Update sync connection frequency tooling and documentation (#1549) by @bodinsamuel
- Update frontend version in webapp package after publication (#1571) by @TBonnin
- *(api)* Deploying sync now keeps frequency override (#1556) by @bodinsamuel

## [v0.37.8] - 2024-01-26

### Changed

- Link account and environment to authenticated trace (#1564) by @TBonnin

## [v0.37.7] - 2024-01-25

### Changed

- Explicitly install qs (#1565) by @khaliqgant

## [v0.37.5] - 2024-01-25

### Fixed

- *(ui)* Show frequency in connection's sync page (#1559) by @bodinsamuel

## [v0.37.4] - 2024-01-24

### Added

- Override sync frequency  (#1548) by @bodinsamuel

### Fixed

- Fix type of the updateMetadata function (#1557) by @TBonnin
- *(api)* /sync/status returns execution frequency (#1550) by @bodinsamuel

## [v0.37.2] - 2024-01-23

### Fixed

- *(dev)* Upgrade eslint minors (#1546) by @bodinsamuel

## [v0.37.1] - 2024-01-22

### Added

- Adding logs to debug why Nango.auth() sometimes doesn't resolve (#1312) by @TBonnin
- Add support for apollo.io (#1466) by @tonyxiao
- Add option to auth() to enable closed window detection (#1533) by @TBonnin

### Changed

- Revert auth popup closing detection and race condition fix (#1310) by @TBonnin
- Buffer should be available inside Node.vm (#1443) by @TBonnin
- Fallback to default runner if account runner is not ready quickly (#1440) by @TBonnin
- Caching runner (#1505) by @TBonnin
- Disable login window detection when needed (#1528) by @TBonnin

### Fixed

- Fix setMetadata argument type (#1428) by @TBonnin
- NangoProps lastSyncDate is not decoded as a Date (#1451) by @TBonnin
- Runner can run script for up to 24h (#1462) by @TBonnin
- Fix no res response by @khaliqgant
- If condition in push container github action (#1504) by @TBonnin
- Jobs should depends on shared v0.36.88 (#1512) by @TBonnin

## [v0.36.14] - 2023-11-13

### Added

- Key rotation warning (#1196) by @ashishrout-tech

### Changed

- *(webapp)* Improve sidebar ui design (#1163) by @ComfortablyCoding

## [v0.24.4] - 2023-07-13

### Added

- Add separate command to migrate database (#663) by @sstone1

### Changed

- Updated provider wiki. (#618) by @uncle-tee
- Improve explanation of nango.auth params in quickstart (#626) by @KShivendu
- Segment to add basic authorization method (#604) by @Khaalidsub
- Allow the websockets path to be configured (#688) by @richardt-engineb

### Fixed

- Docker compose volumes on windows (#625) by @tilda

## [v0.16.0] - 2023-05-02

### Added

- Add provider for Timely (#576) by @t1mmen
- Force refresh token on the web UI (#587) by @Chakravarthy7102
- *(server/db)* 💾 Add support for connection pool overrides (#588) by @0xRaduan
- Introduce hmac feature to restrict creation of new connections (#591) by @sstone1
- Query connections for only a specific connectionId. (#596)

### Fixed

- Input overlaps (#584) by @Chakravarthy7102
- Correctly display error message when creating a connection (#589) by @sstone1
- Error messages when scopes are missing (#592) by @Chakravarthy7102

## [v0.15.1] - 2023-04-24

### Added

- Adds Bamboo HR provider config. (#486) by @chandu
- Hide secrets by default (#553) by @Chakravarthy7102
- Custom error handler (#557) by @Chakravarthy7102
- Added new scripts to gen source-maps on install (#542) by @Chakravarthy7102
- Tags input for entering scopes (#556) by @Chakravarthy7102
- Add copy option to secret button (#560) by @Chakravarthy7102
- Added tiny space between nav items (#564) by @Chakravarthy7102
- Prism component with super powers (#563) by @Chakravarthy7102

### Changed

- Generic layouts for dashboard and default pages (#550) by @Chakravarthy7102
- Render Default Scope from Providers. (#534)

### Fixed

- Make frontend sdk ssr friendly (#565) by @Chakravarthy7102

## [v0.14.0] - 2023-04-18

### Added

- Added Provider for battlenet (#513)
- Deel Provider (#512)
- Add feature for Gorilla health (#497)
- Add provider for Accelo (#540)
- Add teamwork providers (#539)
- Added Provider for docusign (#533)
- Add providers for Uber. (#532)
- Add Bold sign provider. (#531)
- Add Provider for Squareup (#530)
- Add outreach provider (#529)
- Added Zoho-desk provider (#524)
- Added Provider for pandadoc. (#523)

### Changed

- Add a table to persist OAuth Session (#426)
- Add Provider for Keep (#522)

### Fixed

- Mural authorization URL. (#514)
- Fix typo (#526) by @0xRaduan

## [v0.13.4] - 2023-04-11

### Added

- Add Strava provider (#434)
- Atlassian Provider (#432)
- Add Spotify as a provider (#431)
- Add integration for Mural (#464)
- Add one drive provider. (#498)
- Add Amazon Provider (#496)
- Added oAuth for payfit (#485)
- Add provider for typeform (#484)
- Add provider for Gorgias (#483)

### Changed

- Added Twitch provider. (#435)
- Segment integration (#425) by @Khaalidsub
- Added Yandex Provider. (#436)
- Add Mailchimp provider (#428)
- Add Figma Provider (#440)
- Added Provider for Figjam (#462)
- Add Zenefits Provider (#472)
- Add support for querying an immediate refresh of the provider's refresh token (#465)
- Adobe Service integration (#463)
- Add provider for Gusto. (#473)
- Connection config params (#474)
- Fixes #386 by changing the UI routes for the 'connections' pages (#478) by @chandu

### Fixed

- Bad request request when requesting for refresh token (#430)
- Asana Integrations (#456)
- Added Provider for Miro. (#457)
- Digital Ocean refresh token (#500)
- Allow use of dynamic port for Nango DB in docker compose. (#499)
- Connection create page. (#489)

## [v0.12.7] - 2023-03-31

### Added

- Added precommit hook (#396)

### Fixed

- *(app)* Encode URLs when redirecting (#424) by @AnandChowdhary
- Refresh token contenstack integrations (#398) by @Khaalidsub

## [v0.12.1] - 2023-03-24

### Added

- Added server version on startup logs. (#380)

### Changed

- 🎡 add nodemon for development (#381)

## [v0.11.2] - 2023-03-21

### Added

- Dashboard: Confirmation before delete (#373) by @uncle-tee

### Changed

- ⚡️ added docker volume to the postgres in docker-compose (#376) by @uncle-tee

## [v0.8.5] - 2023-02-17

### Changed

- Support one-click deployment for render & heroku (#329) by @Pranav2612000

## [v0.8.0] - 2023-02-13

### Changed

- Add a one-click deploy to render button (#317) by @Pranav2612000

## [v0.5.1] - 2023-01-17

### Added

- Add support for Brex by @rguldener

## [v0.3.6] - 2022-11-30

### Changed

- Rewrite (details in desc) by @bastienbeurier

## [v0.2.2] - 2021-06-08

### Added

- Add automation to publish container image (#227) by @rawkode

## [v0.2.1] - 2021-05-12

### Added

- Add env.example
- Build with webpack
- Add postgresql by @cfabianski
- Add knex by @cfabianski
- Add procfile
- Add ts node for deployment
- Persist session
- Add more logging by @cfabianski
- Add authentications by @cfabianski
- Store result from authentication by @cfabianski
- Add authId by @cfabianski
- Add save-setup and retrieve-setup by @cfabianski
- Add timestamps to configurations by @cfabianski
- Add setupId by @cfabianski
- Allow user to provide it's own callback url by @Frenchcooc
- Prepare README structure by @Frenchcooc
- Add dashboard views by @Frenchcooc
- Passing API config to frontend by @Frenchcooc
- Link users view to database by @Frenchcooc
- Link dashboard to database by @Frenchcooc
- Add images to the integrations - WIP using Clearbit by @Frenchcooc
- Handle errors on the dashboard by @Frenchcooc
- Api endpoints by @Frenchcooc
- Add deletion actions on the dashboard by @Frenchcooc
- Updating JS client to Pizzly by @Frenchcooc
- Adding first batch of tests by @Frenchcooc
- Add integration methods by @Frenchcooc
- Handle proxy requests by @Frenchcooc
- Update Pizzly's main config files by @Frenchcooc
- Improve common page (home, errors, etc.) by @Frenchcooc
- Click&go connect button by @Frenchcooc
- Introduce a 'prepare' script by @Frenchcooc
- Secure access to the dashboard by @Frenchcooc
- Improve how the errors from the API are returned by @Frenchcooc
- Secure access to the API using a secret key by @Frenchcooc
- Improve API errors on unauthenticated requests by @Frenchcooc
- Proxy feature unauthentificated requests by @Frenchcooc
- Support of proxy requests for OAuth2 by @Frenchcooc
- Handle passing body content in the proxy request by @Frenchcooc
- Secure access to auth and proxy by @Frenchcooc
- New route on the API to retrieve an integration's config by @Frenchcooc
- Handle errors on the API with PizzlyError by @Frenchcooc
- Option to limit frontend call to the proxy service by @Frenchcooc
- Save setup id with a successful authentication by @Frenchcooc
- Add publishable key to pizzly js by @Frenchcooc
- Publish pizzly js by @Frenchcooc
- Update version with request authentication by @Frenchcooc
- Review README by @Frenchcooc
- Review images by @Frenchcooc
- Handle summary by @Frenchcooc
- Add license by @Frenchcooc
- Update images by @Frenchcooc
- Update images by @Frenchcooc
- Reduce logo width by @Frenchcooc
- Handle supported APIs by @Frenchcooc
- Handle token refreshness for OAuth2 by @Frenchcooc
- Add favicon (#33) by @Frenchcooc
- Support of Pizzly initialization with a string (#36) by @Frenchcooc
- Reduce the amount of environment for Heroku (#39) by @Frenchcooc
- Add dev command
- Add logger
- Add option to enable Bearer.sh (#44) by @Frenchcooc
- Add views directory to the docker image (#61) by @Hagbarth
- Added integration file for google hangouts (#152) by @dopecodez
- New pizzly-js release by @Frenchcooc
- Drift.com-integration (#155) (#163) by @lukas-mertens
- Add HSTS header (#159) by @Frenchcooc
- Enable telemetry data (#169) by @Frenchcooc
- Prepare product hunt (#170) by @Frenchcooc
- Add a try this authId link (#171) by @Frenchcooc
- Improve error message on token refreshness (#176) by @Frenchcooc

### Changed

- Update dependencies by @cfabianski
- Dev commands
- Get rid of webpack for server
- Move integrations out of src
- Knex migrations
- Disable migration temporarily
- Re enable migrations
- Enless command
- Providfe mode
- Use correct location
- Clean up by @cfabianski
- Removing some old code by @Frenchcooc
- Remove ts-node dependency by @Frenchcooc
- Split api/dashboard/auth/proxy into differents routers by @Frenchcooc
- Clean routes accross each feature by @Frenchcooc
- Group all things DB in this file by @Frenchcooc
- Moved src/views to views/ by @Frenchcooc
- Uses ejs as template engine by @Frenchcooc
- Remove tslint for now by @Frenchcooc
- Cleanup exressp's app generator by @Frenchcooc
- Nasty credentials by @Frenchcooc
- Moved clients/ under the auth/ directory by @Frenchcooc
- Review JS client README by @Frenchcooc
- Migrate some views by @Frenchcooc
- Remove logs by @Frenchcooc
- Cleanup following updates to the JS client by @Frenchcooc
- Moving auth directory to new legacy dir by @Frenchcooc
- Moving functions dir to new legacy dir by @Frenchcooc
- Moving middleware dir to new legacy dir by @Frenchcooc
- Moving api-config dir to new legacy dir by @Frenchcooc
- Moving functions dir to new legacy dir by @Frenchcooc
- Revert change to test the connect by @Frenchcooc
- Ease onboarding with low config by @Frenchcooc
- Migration of user_attributes to payload by @Frenchcooc
- Migration of clientID to clientId by @Frenchcooc
- Migration of config.setup to config.credentials by @Frenchcooc
- Moved error-handler to legacy directory by @Frenchcooc
- How we handle global errors by @Frenchcooc
- Reduce global middlewares by @Frenchcooc
- Improve comments on the access library by @Frenchcooc
- Remove API reference from README, now in the wiki by @Frenchcooc
- Rename credentials to configurations by @Frenchcooc
- Use of configurations where appropriate by @Frenchcooc
- Rename dashboard user/password by @Frenchcooc
- Upgrade typescript and fix tests
- : use pipe whenever it is possible
- Update link by @Frenchcooc
- *(deps)* Bump lodash in /src/clients/javascript (#81) by @dependabot[bot]
- *(deps)* Bump lodash from 4.17.15 to 4.17.19 in /src/clients/node (#82) by @dependabot[bot]
- Pull-request template by @Frenchcooc
- Pull-request template in the right directory by @Frenchcooc
- *(deps)* Bump node-fetch from 2.6.0 to 2.6.1 in /src/clients/node (#94) by @dependabot[bot]
- *(deps-dev)* Bump node-fetch from 2.6.0 to 2.6.1 (#95) by @dependabot[bot]
- Link to demo app by @Frenchcooc
- Update PR template (#160) by @Frenchcooc
- Adding Monday.com integration (#167) by @picsoung
- Adding fitbit.com integration (#172) by @smartbase-de
- Splitwise integration (#188) by @nosvalds
- Invalid Google cloud URL (#202) by @mikamboo

### Fixed

- Remove legacy files
- Build server
- Remvoe legacy references
- Fix render enndine
- Views path
- Bring back auth id
- Fix app.json by @cfabianski
- Use config foler
- Fix dependencies
- Test unsecure
- Set secure to true by @cfabianski
- SaveUnitialized by @cfabianski
- Use ejs instead of mustache by @cfabianski
- Get rid of aliasBuid by @cfabianski
- Include json files by @cfabianski
- Trigger build by @cfabianski
- Log getAuth by @cfabianski
- Clean up by @cfabianski
- Reduce pool setup by @cfabianski
- Update pool config for db by @cfabianski
- Share connections by @cfabianski
- Trigger build by @cfabianski
- Fix fetchAuthDetails by @cfabianski
- Reuse db connection by @cfabianski
- Fix validator by @cfabianski
- Fix scopes by @cfabianski
- Fix tests by @cfabianski
- Update slack scope by @cfabianski
- Fix setupId by @cfabianski
- Fix setupdetails by @cfabianski
- Fix oauth2 by @cfabianski
- Fix storage by @cfabianski
- Fix migrations by @cfabianski
- Fix migration by @cfabianski
- Update URL with new Pizzly repo by @Frenchcooc
- Use of legacy proxy code to provide proxy endpoint (for now) by @Frenchcooc
- Set logo dimensions by @Frenchcooc
- Using cp temporary to copy more views by @Frenchcooc
- Removing vhost - we don't use it anymore by @Frenchcooc
- Use new callback URl per default by @Frenchcooc
- Plus icon to add an API by @Frenchcooc
- Some issue following migration by @Frenchcooc
- Remove Axios from type definition by @Frenchcooc
- Handle edge case with the auth process by @Frenchcooc
- Issue with credentials rendering by @Frenchcooc
- Auth by forcing a callbackUrl by @Frenchcooc
- UX fixes by @Frenchcooc
- Handle unauthorized errors (401) by @Frenchcooc
- Remove access management on /auth by @Frenchcooc
- Update README by @Frenchcooc
- Minimize summary by @Frenchcooc
- Minimize summary by @Frenchcooc
- Try to use local images by @Frenchcooc
- Minor typo by @Frenchcooc
- A few more relative links by @Frenchcooc
- Headings by @Frenchcooc
- Finish renaming of .credential to .configuration (#32) by @Frenchcooc
- Issue when the setupId is unknown (#34) by @Frenchcooc
- Issue with setupId by @Frenchcooc
- Support multiple scopes (one per line) (#42) by @Frenchcooc
- Fix test config
- Remove Bearer's callback URL (#46) by @Frenchcooc
- Enable cors on proxy (#48) by @Frenchcooc
- No-default scope on integrations (#49) by @Frenchcooc
- Hotfix on configuration auth properties by @Frenchcooc
- Hotfix on req.data.integration renaming by @Frenchcooc
- Typos (#54) by @Frenchcooc
- Open port locally
- Force publish change to pizzly-js by @Frenchcooc
- Remove project link + version (#149) by @Frenchcooc
- Handle param options (#154) by @Hagbarth
- Update Zendesk Chat configuration file (#161) by @Frenchcooc
- APIs using client_credentials as grant type (#165) by @Frenchcooc

[v0.41.1]: https://github.com/NangoHQ/nango/compare/v0.41.0..v0.41.1
[v0.41.0]: https://github.com/NangoHQ/nango/compare/v0.40.10..v0.41.0
[v0.40.10]: https://github.com/NangoHQ/nango/compare/v0.40.9..v0.40.10
[v0.40.9]: https://github.com/NangoHQ/nango/compare/v0.40.8..v0.40.9
[v0.40.8]: https://github.com/NangoHQ/nango/compare/v0.40.7..v0.40.8
[v0.40.7]: https://github.com/NangoHQ/nango/compare/v0.40.6..v0.40.7
[v0.40.6]: https://github.com/NangoHQ/nango/compare/v0.40.5..v0.40.6
[v0.40.5]: https://github.com/NangoHQ/nango/compare/v0.40.4..v0.40.5
[v0.40.4]: https://github.com/NangoHQ/nango/compare/v0.40.3..v0.40.4
[v0.40.3]: https://github.com/NangoHQ/nango/compare/v0.40.2..v0.40.3
[v0.40.2]: https://github.com/NangoHQ/nango/compare/v0.40.1..v0.40.2
[v0.40.1]: https://github.com/NangoHQ/nango/compare/v0.40.0..v0.40.1
[v0.40.0]: https://github.com/NangoHQ/nango/compare/v0.39.33..v0.40.0
[v0.39.33]: https://github.com/NangoHQ/nango/compare/v0.39.32..v0.39.33
[v0.39.32]: https://github.com/NangoHQ/nango/compare/v0.39.31..v0.39.32
[v0.39.31]: https://github.com/NangoHQ/nango/compare/v0.39.30..v0.39.31
[v0.39.30]: https://github.com/NangoHQ/nango/compare/v0.39.29..v0.39.30
[v0.39.29]: https://github.com/NangoHQ/nango/compare/v0.39.28..v0.39.29
[v0.39.28]: https://github.com/NangoHQ/nango/compare/v0.39.27..v0.39.28
[v0.39.27]: https://github.com/NangoHQ/nango/compare/v0.39.26..v0.39.27
[v0.39.26]: https://github.com/NangoHQ/nango/compare/v0.39.25..v0.39.26
[v0.39.25]: https://github.com/NangoHQ/nango/compare/v0.39.24..v0.39.25
[v0.39.24]: https://github.com/NangoHQ/nango/compare/v0.39.23..v0.39.24
[v0.39.23]: https://github.com/NangoHQ/nango/compare/v0.39.22..v0.39.23
[v0.39.22]: https://github.com/NangoHQ/nango/compare/v0.39.21..v0.39.22
[v0.39.21]: https://github.com/NangoHQ/nango/compare/v0.39.20..v0.39.21
[v0.39.20]: https://github.com/NangoHQ/nango/compare/v0.39.19..v0.39.20
[v0.39.19]: https://github.com/NangoHQ/nango/compare/v0.39.18..v0.39.19
[v0.39.18]: https://github.com/NangoHQ/nango/compare/v0.39.17..v0.39.18
[v0.39.17]: https://github.com/NangoHQ/nango/compare/v0.39.16..v0.39.17
[v0.39.16]: https://github.com/NangoHQ/nango/compare/v0.39.15..v0.39.16
[v0.39.14]: https://github.com/NangoHQ/nango/compare/v0.39.13..v0.39.14
[v0.39.13]: https://github.com/NangoHQ/nango/compare/v0.37.0..v0.39.13
[v0.37.0]: https://github.com/NangoHQ/nango/compare/v0.39.8..v0.37.0
[v0.39.8]: https://github.com/NangoHQ/nango/compare/v0.39.7..v0.39.8
[v0.39.7]: https://github.com/NangoHQ/nango/compare/v0.39.6..v0.39.7
[v0.39.6]: https://github.com/NangoHQ/nango/compare/v0.39.5..v0.39.6
[v0.39.5]: https://github.com/NangoHQ/nango/compare/v0.39.4..v0.39.5
[v0.39.4]: https://github.com/NangoHQ/nango/compare/v0.39.3..v0.39.4
[v0.39.3]: https://github.com/NangoHQ/nango/compare/v0.39.2..v0.39.3
[v0.39.2]: https://github.com/NangoHQ/nango/compare/v0.39.1..v0.39.2
[v0.39.1]: https://github.com/NangoHQ/nango/compare/v0.39.0..v0.39.1
[v0.39.0]: https://github.com/NangoHQ/nango/compare/v0.38.5..v0.39.0
[v0.38.5]: https://github.com/NangoHQ/nango/compare/v0.38.4..v0.38.5
[v0.38.4]: https://github.com/NangoHQ/nango/compare/v0.38.3..v0.38.4
[v0.38.3]: https://github.com/NangoHQ/nango/compare/v0.38.2..v0.38.3
[v0.38.2]: https://github.com/NangoHQ/nango/compare/v0.38.1..v0.38.2
[v0.38.1]: https://github.com/NangoHQ/nango/compare/v0.38.0..v0.38.1
[v0.38.0]: https://github.com/NangoHQ/nango/compare/v0.37.26..v0.38.0
[v0.37.26]: https://github.com/NangoHQ/nango/compare/v0.37.25..v0.37.26
[v0.37.25]: https://github.com/NangoHQ/nango/compare/v0.37.24..v0.37.25
[v0.37.24]: https://github.com/NangoHQ/nango/compare/v0.37.23..v0.37.24
[v0.37.23]: https://github.com/NangoHQ/nango/compare/v0.37.22..v0.37.23
[v0.37.22]: https://github.com/NangoHQ/nango/compare/v0.37.21..v0.37.22
[v0.37.21]: https://github.com/NangoHQ/nango/compare/v0.37.20..v0.37.21
[v0.37.20]: https://github.com/NangoHQ/nango/compare/v0.37.19..v0.37.20
[v0.37.19]: https://github.com/NangoHQ/nango/compare/v0.37.18..v0.37.19
[v0.37.17]: https://github.com/NangoHQ/nango/compare/v0.37.16..v0.37.17
[v0.37.13]: https://github.com/NangoHQ/nango/compare/v0.37.12..v0.37.13
[v0.37.9]: https://github.com/NangoHQ/nango/compare/v0.37.8..v0.37.9
[v0.37.8]: https://github.com/NangoHQ/nango/compare/v0.37.7..v0.37.8
[v0.37.7]: https://github.com/NangoHQ/nango/compare/v0.37.6..v0.37.7
[v0.37.5]: https://github.com/NangoHQ/nango/compare/v0.37.4..v0.37.5
[v0.37.4]: https://github.com/NangoHQ/nango/compare/v0.37.3..v0.37.4
[v0.37.2]: https://github.com/NangoHQ/nango/compare/v0.37.1..v0.37.2
[v0.37.1]: https://github.com/NangoHQ/nango/compare/v0.36.14..v0.37.1
[v0.36.14]: https://github.com/NangoHQ/nango/compare/v0.35.5..v0.36.14
[v0.24.4]: https://github.com/NangoHQ/nango/compare/v0.16.0..v0.24.4
[v0.16.0]: https://github.com/NangoHQ/nango/compare/v0.15.1..v0.16.0
[v0.15.1]: https://github.com/NangoHQ/nango/compare/v0.14.0..v0.15.1
[v0.14.0]: https://github.com/NangoHQ/nango/compare/v0.13.5..v0.14.0
[v0.13.4]: https://github.com/NangoHQ/nango/compare/v0.12.7..v0.13.4
[v0.12.7]: https://github.com/NangoHQ/nango/compare/v0.12.6..v0.12.7
[v0.12.1]: https://github.com/NangoHQ/nango/compare/v0.11.3..v0.12.1
[v0.11.2]: https://github.com/NangoHQ/nango/compare/v0.10.7..v0.11.2
[v0.8.5]: https://github.com/NangoHQ/nango/compare/v0.8.0..v0.8.5
[v0.8.0]: https://github.com/NangoHQ/nango/compare/v0.7.2..v0.8.0
[v0.5.1]: https://github.com/NangoHQ/nango/compare/v0.5.0..v0.5.1
[v0.3.6]: https://github.com/NangoHQ/nango/compare/v0.2.2..v0.3.6
[v0.2.2]: https://github.com/NangoHQ/nango/compare/v0.2.1..v0.2.2

<!-- generated by git-cliff -->
