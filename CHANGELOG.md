# Changelog

All notable changes to this project will be documented in this file.

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
