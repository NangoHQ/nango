# Changelog

All notable changes to this project will be documented in this file.

## [v0.63.1] - 2025-07-18

### Added

- *(pubsub)* Add pubsub package (#4313) by @TBonnin
- *(webhooks)* Add support for attio webhooks (#4312) by @hassan254-prog
- Replace NangoModel with json schema (#4177) by @kaposke
- *(integrations)* Add support for google cloud storage (#4324) by @hassan254-prog
- Add detailed usage button in billing (#4321) by @kaposke
- Remove connection_with_scripts_max cap (#4329) by @kaposke
- *(jobs)* Network policies for kubernetes runners (#4330) by @rossmcewan
- Create new free-plan caps (#4334) by @kaposke
- *(kvstore)* Add incr methods  (#4336) by @bodinsamuel
- *(billing)* Self serve (#4220) by @bodinsamuel

### Changed

- *(integration-templates)* Automatic update from https://github.com/NangoHQ/integration-templates/commit/11febd739d4d2d839cf8c3b31dbb1d7b2a00fda1 by Khaliq by @github-actions[bot]
- *(orch)* Clean schedules and tasks older than 5 days (#4318) by @TBonnin
- *(integration-templates)* Automatic update from https://github.com/NangoHQ/integration-templates/commit/9ee5e21f8497e8b3c72441353d6d38f3040787da by Khaliq by @github-actions[bot]
- New API docs pages (#4316) by @hassan254-prog
- *(deps)* Bump multer from 2.0.1 to 2.0.2 in /packages/server (#4338) by @dependabot[bot]
- *(plans)* Update growth default flags (#4335) by @bodinsamuel

### Fixed

- *(billing)* Do not backfill sub for non-free plan (#4317) by @bodinsamuel
- Migration to fix json schema in public flows (#4268) by @kaposke
- *(github-app)* Handle update without auth code (#4320) by @khaliqgant
- *(providers)* Move Figma SCIM tenantId from endpoint to base URL for proper SCIM API calls (#4277) by @yksolanki9
- *(runner)* Prevent parallel run and zombie tasks (#4325) by @bodinsamuel
- Heartbeat ms -> sec, set last_heartbeat_at on started (#4326) by @bodinsamuel
- *(runner)* Allow webhooks and syncs to run in parallel (#4327) by @bodinsamuel
- *(orb)* Do not override flags if same plan (#4332) by @bodinsamuel
- *(zero)* Correctly support on-event execution (#4333) by @bodinsamuel
- *(types)* Do not leak deprecate state for providerConfigKey (#4339) by @bodinsamuel

## [v0.63.0] - 2025-07-11

### Added

- *(runner)* Create Kubernetes NodeProvider (#4295) by @rossmcewan
- Show in-app usage for free plans (#4270) by @kaposke
- Add resource request and limits as well as better error handling… (#4311) by @rossmcewan

### Changed

- Zero yaml (#4292) by @bodinsamuel
- Eslint pass on import order 3 (#4296) by @bodinsamuel
- *(integration-templates)* Automatic update from https://github.com/NangoHQ/integration-templates/commit/1d1d12dae0221dbab67615a003af2b4cc677860d by Victor Lang'at by @github-actions[bot]
- *(integration-templates)* Automatic update from https://github.com/NangoHQ/integration-templates/commit/48c5e68d77961e372d784798de96e852c08a1384 by Khaliq by @github-actions[bot]

### Fixed

- *(github-app-docs)* [nan-3564] update docs (#4302) by @khaliqgant
- *(auth)* Various feedback (#4290) by @bodinsamuel
- *(atlassian-admin-api)* [nan-3578] add in organization id as a connection config param (#4306) by @khaliqgant
- *(api)* Import or reconnect sending incorrect webhooks (#4299) by @bodinsamuel
- *(api)* POST /admin/impersonate new format (#4298) by @bodinsamuel
- *(docs)* Update image and docs section link (#4309) by @khaliqgant
- *(cli)* Init default to zero yaml (#4303) by @bodinsamuel
- *(node)* Remove deprecated methods (#4310) by @bodinsamuel
- *(jira-post-connection)* [nan-3592] wrap potential failing call in a try catch (#4315) by @khaliqgant

## [v0.62.1] - 2025-07-08

### Added

- *(integrations)* Add support for fathom (#4276) by @aniruddhb
- *(provider)* Added AWS scim integration (#4272) by @yksolanki9
- *(integrations)* Improve sap successfactors and other documentation pages (#4279) by @hassan254-prog
- Add index to sync_jobs (#4280) by @TBonnin
- *(integrations)* Add support for atlassian cloud admin (#4287) by @hassan254-prog
- *(api)* Unify auth response types (#4283) by @bodinsamuel
- *(pre-connection-deletion)* Add linear token revocation (#4293) by @hassan254-prog

### Changed

- *(integration-templates)* Automatic update from https://github.com/NangoHQ/integration-templates/commit/94d3e6ca338a44c4f885d80021362210713d77a6 by Khaliq by @github-actions[bot]
- *(integration-templates)* Automatic update from https://github.com/NangoHQ/integration-templates/commit/0f09aa12f862674f16c51254ad339c9c8c3e0ad7 by Khaliq by @github-actions[bot]
- Eslint pass on import order (#4286) by @bodinsamuel
- *(integration-templates)* Automatic update from https://github.com/NangoHQ/integration-templates/commit/ac898ed546cb0f2b98a7be7d7e8c4a2a2507842a by Samuel Bodin by @github-actions[bot]

### Fixed

- *(ramp)* Update ramp docs (#4278) by @khaliqgant
- *(ci)* Mintlify broken links (#4285) by @bodinsamuel
- *(frontend-sdk)* Encode connectionConfig params to preserve special characters in URL (#4288) by @hassan254-prog
- *(endUser)* Missing forUpdate in transaction (#4281) by @bodinsamuel
- *(zeroYaml)* Support zero yaml templates (#4274) by @bodinsamuel
- *(api)* Migrate PUT /password to new format (#4297) by @bodinsamuel

## [v0.62.0] - 2025-07-01

### Added

- Legacy model to json schema conversion (#4217) by @kaposke
- *(node-client)* Add PUT method support for API consistency (#4232) by @yksolanki9
- *(db)* Add fields in plans for self-serve billing (#4227) by @bodinsamuel
- *(plans)* Add auto_idle flag (#4234) by @bodinsamuel
- *(webapp)* Show year in connection dates (#4240) by @kaposke
- *(api)* Add endpoints for stripe (#4244) by @bodinsamuel
- *(integrations)* Remove tableau as an auth mode replace with two_step (#4233) by @hassan254-prog
- *(jira-provider)* Add offline_access as a default scope (#4253) by @khaliqgant
- *(provider)* Added Roam scim integration (#4250) by @yksolanki9
- *(integrations)* Remove validation endpoint for ukg pro (#4263) by @hassan254-prog
- Add guide about how to best use AI to create custom integrations (#4163) by @TBonnin
- Add last_execution_at column to connection table (#4266) by @TBonnin
- Add 'count of active connections' billing metric (#4267) by @TBonnin
- *(integrations)* Add support for sentry public integration (#4225) by @hassan254-prog
- Add primary key to _nango_oauth_sessions (#4273) by @rossmcewan
- Add primary key to oauth_sessions without unique index (#4275) by @rossmcewan
- *(integrations)* Support mTLS for secure API requests with certificate/key pair (#4258) by @hassan254-prog
- *(frontend)* Match sdk error types casing (#4057) by @hassan254-prog

### Changed

- Move json-schema converters to utils (#4229) by @kaposke
- Update version in manifest by @actions-user
- Rename stripe to stripe connect adding setup guide (#4241) by @hassan254-prog
- *(integration-templates)* Automatic update from https://github.com/NangoHQ/integration-templates/commit/a2c16668f471d3c1ddcd036f264ba0312878bd14 by Hassan_Wari by @github-actions[bot]
- *(docs)* Update enterprise self-hosting docs to match announcement (#4256) by @rossmcewan
- Clarify how to edit user/org data on connect session (#4215) by @mintlify[bot]
- *(integration-templates)* Automatic update from https://github.com/NangoHQ/integration-templates/commit/2a4cef859bcdc41de1318f526a88f5995aa5d9cc by Victor Lang'at by @github-actions[bot]
- Focus getting starter on auth & proxy (#4251) by @bastienbeurier
- Add MCP demo video to docs (#4261) by @bastienbeurier
- Use modern tsconfig, node16 and nodenext (#4271) by @bodinsamuel
- *(integration-templates)* Automatic update from https://github.com/NangoHQ/integration-templates/commit/6568c2893369d35ed79329bc8b263bd4e139d87e by Hassan_Wari by @github-actions[bot]
- *(integration-templates)* Automatic update from https://github.com/NangoHQ/integration-templates/commit/9e7ba791c3762bc725c5951ea0b09b71b8b4ecba by Khaliq by @github-actions[bot]
- Remove nango auth reference (#4269) by @hassan254-prog
- *(integration-templates)* Automatic update from https://github.com/NangoHQ/integration-templates/commit/3165515ca221d72a4c44dd3fe68b88af5114cdee by Victor Lang'at by @github-actions[bot]
- *(integration-templates)* Automatic update from https://github.com/NangoHQ/integration-templates/commit/7919a3f9f5b835d7f183443fabae7d62fd9d47c3 by Hassan_Wari by @github-actions[bot]

### Fixed

- Commit hash added to success path tag (#4224) by @rossmcewan
- GH_TOKEN required to interact with  CLI tool (#4226) by @rossmcewan
- *(records)* Paginate markPreviousGenerationRecordsAsDeleted (#4230) by @TBonnin
- Always filter partitioned records table by connection/model by @TBonnin
- *(plans)* New types, store customer_id at creation (#4228) by @bodinsamuel
- *(release)* Git push to master instead of PR (#4235) by @rossmcewan
- *(db)* Remove some schema leftover (#4236) by @bodinsamuel
- *(auth)* Handle csp in auth callback html (#4219) by @bodinsamuel
- *(runner)* Implement MaxLifetimeAgent for persist client socket management (#4239) by @TBonnin
- Handle nested inline models in nangoModelToJsonSchema (#4238) by @kaposke
- Handle dynamic models in NangoModel to json-schema converter (#4245) by @kaposke
- Do not send external facing connection id inside billing events (#4243) by @TBonnin
- *(billing)* Listen to orb webhooks (#4242) by @bodinsamuel
- *(webapp)* Only show first unit of time in grid (#4249) by @rossmcewan
- Handle special types in json schema converter (#4246) by @kaposke
- *(docs)* Fix netsuite link (#4255) by @khaliqgant
- *(plan)* Use auto_idle flag (#4248) by @bodinsamuel
- *(plan)* Modify free plan (#4260) by @bodinsamuel
- More json schema cases (#4257) by @kaposke
- *(es)* Disable refresh on operation creation (#4262) by @bodinsamuel
- Improve LegacyModel to Json Schema conversion (#4265) by @kaposke
- *(figma)* Fix Figma SCIM integration credential verification failure (#4252) by @yksolanki9

## [v0.61.3] - 2025-06-20

### Added

- Add token revocation script for pre connection deletion (#4059) by @viictoo
- *(integrations)* Add Trafft integration with documentation (#4190) by @viictoo
- *(integrations)* Update Instantly documentation and add connection guide (#4194) by @viictoo
- *(billing)* Don't bill first month of MAR for connection (#4192) by @kaposke
- *(docs)* Add securityScheme to OpenAPI spec (#4200) by @kaposke
- *(ukg-pro)* Ext-758 Updated auth and documentation for ukg-pro (#4205) by @ChoqueCastroLD
- *(persist)* Add tracing in auth middleware (#4206) by @TBonnin
- *(logs)* Add more error logs during oauth2 flow (#4195) by @hassan254-prog
- *(release)* Managed release process for self-hosted images (#4210) by @rossmcewan
- Added max width to ukg-pro form and fixed mint json sage-hr (#4213) by @ChoqueCastroLD
- Add upload/download actions to share data across jobs (#4222) by @rossmcewan

### Changed

- Zero yaml migration (#4191) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/27cfef157c734920b68b341f225ddf4037702573 by Hassan_Wari. Commit message: feat(gong): improve gong scripts  (#347) by @github-actions[bot]
- *(integration-templates)* Automatic update from https://github.com/NangoHQ/integration-templates/commit/61945f659fdfa0f4aaacbfaf494b0016839d25c8 by Victor Lang'at by @github-actions[bot]
- Clean up clickup, zoho and freshbook setup docs (#4182) by @viictoo
- *(scheduler)* Migrate from workers to in-process execution (#4193) by @TBonnin
- *(integration-templates)* Automatic update from https://github.com/NangoHQ/integration-templates/commit/7b57d93425d7d968ddfcfccaf5c34b8b87dd9cc4 by Victor Lang'at by @github-actions[bot]
- *(orchestrator)* Move abort task logic to scheduler (#4196) by @TBonnin
- Zeroyaml feedback, scripts credentials feedback (#4198) by @bodinsamuel
- *(integration-templates)* Automatic update from https://github.com/NangoHQ/integration-templates/commit/ad38b1ee64f7ae3487f61fd3a23574c87617dcdf by Samuel Bodin by @github-actions[bot]
- *(orchestrator)* Tasks events via pg LISTEN/NOTIFY (#4201) by @TBonnin
- *(integration-templates)* Automatic update from https://github.com/NangoHQ/integration-templates/commit/ffdb7379ea98fd8c54689aabb037212863324d4d by Hassan_Wari by @github-actions[bot]
- Setup guide for stripe app and stripe app sandbox (#4204) by @hassan254-prog
- Clarify refresh webhook docs (#4208) by @mintlify[bot]
- *(orch)* More tracing and prevent cleaning/expiring race condition (#4207) by @TBonnin
- *(runner)* Remove input/output validation (#4216) by @TBonnin
- *(integration-templates)* Automatic update from https://github.com/NangoHQ/integration-templates/commit/966f69623fd232a5212b0d2b441816b2b03a9390 by Hassan_Wari by @github-actions[bot]

### Fixed

- Use nango.dev domain to send email (#4144) by @TBonnin
- *(file)* Correctly zip from s3 (#4188) by @bodinsamuel
- *(shared)* Remove explicit setting of AWS credentials (#4189) by @rossmcewan
- *(proxy)* Fix build proxy headers (#4187) by @hassan254-prog
- *(pagination)* Fix link pagination type (#4199) by @hassan254-prog
- *(api)* Create billing customer on account creation (#4203) by @bodinsamuel
- *(cli)* Tsconfig correct options, dev mode parallel error display (#4211) by @bodinsamuel
- Helm command was failing (#4214) by @rossmcewan
- Docker credentials secret names were incorrect (#4218) by @rossmcewan
- *(cli)* Catch bad import earlier  (#4223) by @bodinsamuel

## [v0.61.2] - 2025-06-12

### Fixed

- *(cli)* Missing export for zeroyaml (#4186) by @bodinsamuel
- *(webhook-url)* Prevent updating webhook url to match server url (#4174) by @hassan254-prog

## [v0.61.1] - 2025-06-12

### Added

- *(cli)* Zeroyaml single script deploy  (#4183) by @bodinsamuel
- *(utils)* Add NangoModel to json-schema mapping (#4181) by @kaposke
- *(sage-hr)* Ext-731 Add Sage HR configuration and documentation (#4180) by @ChoqueCastroLD
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/5bd5a3b1b59fd02efdf945eaf14f5365c1f710ba by Victor Lang'at. Commit message: chore(slack): add removeBlockIds function to clean message data (#344) by @github-actions[bot]

### Fixed

- *(cli)* Zeroyaml feedback and test (#4184) by @bodinsamuel
- *(deps)* Pin everything (#4185) by @bodinsamuel

## [v0.61.0] - 2025-06-11

### Added

- *(node)* Upgrade backend to >=22, drop node 18 for cli and node sdk (#4160) by @bodinsamuel

### Changed

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/f30e504347af1420ec68ce5bacc4341d1e6493e5 by Hassan_Wari. Commit message: feat(gong): handle no users error gracefully (#343) by @github-actions[bot]

### Fixed

- *(retry-logic)* Handle both seconds and milliseconds in retry-at logic (#4175) by @hassan254-prog

## [v0.60.5] - 2025-06-10

### Added

- *(cli)* Add --ai options to nango init (#4178) by @TBonnin

## [v0.60.4] - 2025-06-10

### Added

- *(cli)* ZeroYaml definitions validation (#4173) by @bodinsamuel

### Changed

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/bd6ae92e24d1bb4bcc2b03b895583dd028f1d18b by Victor Lang'at. Commit message: feat: conditionally add currency code to accounts (#341) by @github-actions[bot]
- *(frontend)* Update en.ts (#4179) by @wub

### Fixed

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/98f5ce93bd350b32ebec09c23068fb115bd0c587 by Hassan_Wari. Commit message: fix(gong): fix gong integrations (#342) by @github-actions[bot]
- *(file)* Support zip for zeroyaml (#4176) by @bodinsamuel

## [v0.60.3] - 2025-06-06

### Added

- *(integrations)* Add Jobvite integration documentation and configuration (#4169) by @viictoo
- *(webapp)* Add snapshot tests to snippets (#4162) by @kaposke
- Database changes for webhook forwarding enabled (#4171) by @rossmcewan
- Option to deactivate forwarding webhooks by integration (#4161) by @rossmcewan

### Fixed

- *(deploy)* Refactor template deploy (#4159) by @bodinsamuel

## [v0.60.2] - 2025-06-05

### Added

- *(cli)* ZeroYaml generate:docs  (#4152) by @bodinsamuel

### Changed

- *(deps)* Bump multer from 2.0.0 to 2.0.1 in /packages/server (#4166) by @dependabot[bot]

### Fixed

- *(webhook)* Decode private key before hashing in validation (#4151) by @priyesh2609
- *(cli)* Use old syntax for dirname (#4168) by @bodinsamuel

## [v0.60.1] - 2025-06-04

### Added

- Add section about handling invalid connections (#4132) by @TBonnin
- *(webapp)* Add duration to logs and sub-logs (#4155) by @rossmcewan
- *(providers)* Localize oracle-hcm (#4158) by @kaposke
- *(webapp)* Add second-level precision to period log search (#4154) by @rossmcewan

### Fixed

- *(server)* Mistake on getting json_schema models (#4157) by @kaposke
- *(zeroyaml)* Various bug fixes (#4156) by @bodinsamuel
- *(cli)* Dryrun with --integration-id flag has incorrect check (#4164) by @kaposke

## [v0.60.0] - 2025-06-04

### Added

- *(integrations)* Add support for PreciseFP (#3975) by @h55nick
- *(cli)* Zero deploy (#4129) by @bodinsamuel
- *(exec)* Support zero yaml script in runner and dryrun (#4115) by @bodinsamuel
- *(cli)* Zeroyaml nango dev (#4148) by @bodinsamuel
- *(cli)* Migrate to zero (#4138) by @bodinsamuel
- *(integrations)* Add support for ukg pro and ukg ready (#4143) by @ChoqueCastroLD

### Changed

- *(deps)* Bump tar-fs (#4145) by @dependabot[bot]
- Improved pg pooler docs and fixed formatting of env variables (#4139) by @paradoxloop

### Fixed

- *(webapp)* Show logs from connection page (#4140) by @kaposke
- Failed starting supervisor error when remote runner (#4141) by @TBonnin
- *(deploy)* Use same logic for models_json_schema in custom and prebuilt (#4142) by @kaposke
- *(deps)* Upgrade soap, tsup (#4149) by @bodinsamuel
- *(deps)* Upgrade tooling (#4150) by @bodinsamuel
- More descriptive errors for disabled sync configs (#4146) by @rossmcewan
- Adjustable log payload height (#4147) by @rossmcewan
- *(frontend-sdk)* Fix two-step credentials types (#4153) by @hassan254-prog

## [v0.59.13] - 2025-05-30

### Added

- *(canva)* Add support for Canva API via OAuth (#4114) by @lordsarcastic
- *(integrations)* Add support for JobAdder (#4120) by @lordsarcastic
- *(integrations)* Add support for paychex (#4126) by @hassan254-prog
- Download scripts from UI (#4113) by @kaposke
- *(cli)* Add init --zero  (#4112) by @bodinsamuel
- *(authorization)* Skip undefined/empty query parameter (#4124) by @hassan254-prog
- *(cli)* Zero yaml compile (#4116) by @bodinsamuel
- *(integrations)* Add support for Recruit CRM (#4131) by @lordsarcastic
- Add missing index for sync endpoint table (#4135) by @TBonnin
- *(terraform)* Ext-713 Add Terraform configuration and documentation (#4117) by @ChoqueCastroLD
- *(integerations)* Add support for confluence data center (#4136) by @hassan254-prog
- *(integrations)* Add support for Dropbox sign (#4019) by @lordsarcastic

### Changed

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/2a2f80670459722b3b5ac3f1396a665c4a145818 by Victor Lang'at. Commit message: feat(workday): Update employee syncs to support incremental updates (#340) by @github-actions[bot]

### Fixed

- *(deps)* Upgrade cookie-parser (#4130) by @bodinsamuel
- *(slack)* Ts is not always present (#4128) by @bodinsamuel
- GET /connection/id consistent response when invalid credentials (#4122) by @TBonnin
- Sync status shouldn't return finishedAt when RUNNING (#4133) by @TBonnin

## [v0.59.12] - 2025-05-28

### Fixed

- *(cli)* Detect nango folder correctly (#4125) by @bodinsamuel

## [v0.59.11] - 2025-05-27

### Added

- Add lang param to connect-ui docs (#4121) by @kaposke

### Changed

- Release script to use short live github token by @TBonnin

### Fixed

- *(cli)* Send sdkVersion (#4111) by @bodinsamuel

## [v0.59.8] - 2025-05-27

### Added

- Add comprehensive Microsoft OAuth setup guide (#3706) by @devin-ai-integration[bot]
- *(syncConfig)* Store sdk version along syncConfigs, onevents (#4106) by @bodinsamuel
- *(connect-ui)* Spanish and german translations (#4109) by @kaposke
- Localize providers.yaml for connect-ui (#4105) by @kaposke
- Add async tag to trigger action span (#4119) by @TBonnin
- New scripts types, expose in cli  (#4108) by @bodinsamuel

### Changed

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/2b7780e2e3e58e807a204d643632d2066b46ba82 by Khaliq. Commit message: feat(google-calendar-events): Update google calendar events sync (#339) by @github-actions[bot]
- *(docs)* Improve microsoft client credential and business central documentation pages (#4110) by @hassan254-prog

### Fixed

- *(docs)* More specific docs on 1password SCIM Bridge (#4107) by @khaliqgant
- *(cli)* Prepare zero yaml  (#4118) by @bodinsamuel

## [v0.59.7] - 2025-05-23

### Added

- Do not await webhook forwarding (#4098) by @TBonnin

### Changed

- Use github app to push release commit by @TBonnin

### Fixed

- *(sdk)* Better handle 401 false positive (#4081) by @bodinsamuel
- *(response-saver)* Filter out undefined as well (#4102) by @khaliqgant
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/01b3b69a7006a15ffbf8f6428d14c8830d3b9570 by Khaliq. Commit message: fix(tests): Add back in recruiterflow tests (#338) by @github-actions[bot]
- *(express)* Correct querystring parsing in persist, support querystring in v1 (#4101) by @bodinsamuel
- Actually send billing events additional properties (#4099) by @TBonnin
- Race condition in processor tests (#4103) by @TBonnin

## [v0.59.3] - 2025-05-23

### Added

- *(billing)* Add dimensions to billing events  (#4087) by @TBonnin
- Add group max concurrency to tasks table (#4093) by @TBonnin
- *(connect-ui)* Localize frontend (#4089) by @kaposke
- Add warning about getMetadata caching in sync (#4097) by @TBonnin

### Changed

- *(docs)* Mention the action output 10mb limit (#4096) by @TBonnin
- *(scheduler)* Remove groups (#4094) by @TBonnin
- *(scheduler)* Remove unused groups table (#4095) by @TBonnin
- Update Facebook API endpoint from v15 (deprecated) to v22 (latest) (#4053) by @wub

### Fixed

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/d8cbb291e1fbf8dd19b76726e5cb9e29cd842743 by lordsarcastic. Commit message: fix(recruiterflow): Add syncs for Recruiterflow (#336) by @github-actions[bot]
- *(save-responses)* Don't remove content type if not the default application/json & remove dupes (#4085) by @khaliqgant
- *(scheduler)* Max concurrency race condition (#4092) by @TBonnin
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/bc352a87848ac99c75164f24120275f40004aa77 by Hassan_Wari. Commit message: fix(jira): throw error instead of logging when metadata is not found (#337) by @github-actions[bot]

## [v0.59.1] - 2025-05-22

### Added

- *(proxy)* Dynamically parse retry response from body (#4056) by @hassan254-prog
- Add Zoho integration setup guide (ext-357) (#3748) by @devin-ai-integration[bot]
- *(recruiterflow)* Add support Recruiterflow (#4080) by @lordsarcastic
- Add ClickUp integration setup guide (ext-393) (#3746) by @devin-ai-integration[bot]
- Add Jira Data Center integration setup guide (ext-377) (#3744) by @devin-ai-integration[bot]

### Changed

- *(google-drive)* Further edits to the google drive file syncing (#4075) by @lordsarcastic
- Async actions (#4071) by @TBonnin
- Clean package-lock.json (#4082) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/43e42f3cff89fbdd40df7959403fcf010dd2b973 by lordsarcastic. Commit message: feat(recruiterflow): Add syncs for Recruiterflow (#333) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/2d7bf112d08ad9ed20b315e1822ca5fe7499ecaf by Victor Lang'at. Commit message: feat(linear): Add fetch teams action and related models (#334) by @github-actions[bot]
- Batch billing events (#4086) by @TBonnin

### Fixed

- *(proxy)* Do not append querystring on top of url (#4084) by @bodinsamuel
- *(server)* Fix nested query params parsing (#4088) by @hassan254-prog
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/67f3427392250f9aaa64544e33262ac5931a7b62 by Khaliq. Commit message: fix(groups): Fix recruiter groups (#335) by @github-actions[bot]
- *(api)* Tmp fix for rewriting express query (#4091) by @bodinsamuel

## [v0.59.0] - 2025-05-21

### Added

- *(scheduler)* Add retry_key and owner_key to the tasks table (#4030) by @TBonnin
- Set task ownerKey and retryKey (#4033) by @TBonnin
- *(docs)* Add link to jazzhr (#4039) by @khaliqgant
- *(integrations)* Add support for `Codegen` integration. (#4035) by @homanp
- Add comprehensive Linear OAuth setup guide (#3700) by @devin-ai-integration[bot]
- *(grammarly-scim)* Add support for Grammarly SCIM (#4038) by @lordsarcastic
- Adding GET /action/:id endpoint (#4044) by @TBonnin
- Add AWS integration setup guide (ext-398) (#3740) by @devin-ai-integration[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/6cec21b3abf07fd735a112400f333bc82fa1cade by Hassan_Wari. Commit message: feat(integrations): add gem syncs and actions (#326) by @github-actions[bot]
- *(integrations)* Handle hubspot rate limiting (#4046) by @hassan254-prog
- *(docs)* Add mention of smtp for self-hosted and remove Mailgun (#4047) by @TBonnin
- Trigger async actions (#4048) by @TBonnin
- Add FreshBooks integration setup guide (ext-388) (#3747) by @devin-ai-integration[bot]
- Add Attio integration setup guide (ext-399) (#3743) by @devin-ai-integration[bot]
- *(webapp/server)* Add time period filtering to sublogs (#4042) by @kaposke
- Add comprehensive Notion OAuth setup guide (#3698) by @devin-ai-integration[bot]
- *(server)* MCP server with actions as tools (#4012) by @kaposke
- Add on_async_action_completion column to webhook table (#4062) by @TBonnin
- Run async action sequentially per environment (#4054) by @TBonnin
- Send webhook when async actions complete (#4063) by @TBonnin
- Add async actions function to node-client (#4052) by @TBonnin
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/a6f435c297e9b05cfd56ccbf789937998e252587 by Hassan_Wari. Commit message: feat(gong): add call transcript sync (#331) by @github-actions[bot]
- Add comprehensive Airtable OAuth setup guide (#3703) by @devin-ai-integration[bot]
- Add comprehensive Gong setup guide (#3699) by @devin-ai-integration[bot]
- Add comprehensive GitHub App setup guide (#3707) by @devin-ai-integration[bot]
- Upgrade express, dd-trace, body-parser (#4078) by @bodinsamuel

### Changed

- Removing scheduler flags (#4017) by @TBonnin
- *(google-drive)* Update Google Drive integration documentation on downloading content (#4032) by @lordsarcastic
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/d260a955d0b011b3ae48ce1fb694803b5263c350 by Stylianos Mavrokoukoulakis. Commit message: feat(integrations): Add ClickSend integration provider (#316) by @github-actions[bot]
- Remove instance id in logger (#4031) by @bodinsamuel
- Document frontend sdk errors (#4034) by @hassan254-prog
- *(docs)* Missing mint.json entries (#4045) by @lordsarcastic
- Update netsuite tba docs for Non-admin role setup (#4055) by @viictoo
- Improve google docs with the rest of google aliases docs as well (#4058) by @hassan254-prog
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/0dd127a5ca14d79cf45de50510ad92f1fbcae47b by lordsarcastic. Commit message: feat(attio): Add in Attio templates (#327) by @github-actions[bot]
- *(deps)* Bump undici from 6.21.1 to 6.21.2 (#4050) by @dependabot[bot]
- Remove json pretty print pipe from header (#4077) by @viictoo
- *(deps)* Bump multer from 1.4.5-lts.1 to 2.0.0 in /packages/server (#4076) by @dependabot[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/5d88a77c2c4235155d396a038008a5a16dfb02db by Victor Lang'at. Commit message: feat(oracle-hcm): Implement unified employees sync and data mapping (#329) by @github-actions[bot]
- Nango MCP server (#4074) by @kaposke

### Fixed

- *(scheduler)* Decrease tasks table autovacuum factor settings (#4021) by @TBonnin
- *(cli)* FinishedAt type in SyncStatus (#4013) by @kaposke
- *(connect)* Support empty string in default (#4029) by @bodinsamuel
- *(orchestrator)* Fix dequeue long polling (#4023) by @TBonnin
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/b6912d841b36a04d0c43236bd80eb167e8b003e7 by Khaliq. Commit message: fix(docs & linear): Bump linear and update docs (#325) by @github-actions[bot]
- *(microsoft)* Remove prompt=consent (#4040) by @khaliqgant
- *(connect)* Wrong condition on preconfigured field (#4041) by @bodinsamuel
- Unrecognized key 'async' when triggering on-events script (#4043) by @TBonnin
- *(providers)* Fix lever authorization params (#4051) by @hassan254-prog
- Processor flacky test (#4049) by @TBonnin
- *(dryrun save-responses)* Fix check (#4064) by @khaliqgant
- *(github-app)* Trigger connect ui oauth flow (#4061) by @hassan254-prog
- Wrong diff for oneventscripts when deploying single integration (#4037) by @viictoo
- Mcp sdk installation (#4068) by @kaposke
- *(save-responses)* Fix metadata and header parsing (#4067) by @khaliqgant
- Mcp imports (#4069) by @kaposke
- *(webapp)* Delete button not working (#4060) by @kaposke
- *(email)* Sanitize html (#4066) by @bodinsamuel
- *(proxy)* Retry on token error, correctly clear cache (#4065) by @bodinsamuel
- *(webapp)* Sublogs scrolling (#4070) by @kaposke
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/bc9a471c483243fb43ad769d9d157ed9c6f88f62 by Khaliq. Commit message: fix(oracle-hcm-incremental): Oracle hcm incremental (#332) by @github-actions[bot]
- *(persist)* Format of errors in auth middleware (#4073) by @TBonnin
- *(deps)* Upgrade ws, jsdom (#4079) by @bodinsamuel

## [v0.58.7] - 2025-05-12

### Added

- *(integrations)* Add support for workday oauth (#3938) by @hassan254-prog
- *(logs)* Global search (#3906) by @bodinsamuel
- Delete old environments (and refactor delete old data) (#3928) by @kaposke
- *(integrations)* Add Confluence Basic Auth integration (#3961) by @viictoo
- *(integrations)* Make app secret hidden (#3967) by @hassan254-prog
- *(integrations)* Add support for adp (#3968) by @hassan254-prog
- *(integrations)* Add support for namely (#3962) by @hassan254-prog
- *(integrations)* Add support for ukg pro wfm (#3969) by @hassan254-prog
- *(docs)* Added documentation for Google drive support in sample app documentation (#3973) by @lordsarcastic
- *(integrations)* Add support for `Vercel` (#3974) by @homanp
- *(docs)* Add documentation around microsoft approval flow (#3964) by @lordsarcastic
- *(grammarly)* Added Grammarly to integrations (#3965) by @lordsarcastic
- *(integrations)* Add support for auth0 client credentials (#3978) by @hassan254-prog
- *(integrations)* Add support for ClickSend provider (#3959) by @steliosmavro
- *(api)* POST/PATCH/DELETE /integrations/:unique_key by @bodinsamuel
- *(jira)* Update Jira integration with multiple domain support (#3963) by @viictoo
- *(integrations)* Add support for cyberimpact (#3954) by @matthewbelair
- *(integrations)* Improve apollo and apollo auth (#3985) by @hassan254-prog
- *(docs)* Monday.com documentation (#3981) by @lordsarcastic
- *(webhooks)* Add in webhook support for Xero within Nango (#3934) by @viictoo
- *(jamf)* Add support for Jamf in Nango (#3988) by @lordsarcastic
- *(scheduler)* Dequeue on group key pattern (#3987) by @TBonnin
- *(web)* Add info box for CLI environment variable names (#3952) by @kaposke
- *(webapp)* Jump to specific time in logs (#3990) by @kaposke
- *(ui)* Billing page (#3989) by @bodinsamuel
- *(scheduler)* Add groups table (#3986) by @TBonnin
- *(ui)* Billing show usage (#3992) by @bodinsamuel
- *(api)* POST/PATCH/DELETE /integrations/:unique_key (#3982) by @bodinsamuel
- Add ServiceNow integration setup guide (ext-364) (#3742) by @devin-ai-integration[bot]
- Add Intuit integration setup guide (ext-379) (#3741) by @devin-ai-integration[bot]
- Add GitHub integration setup guide (ext-387) (#3745) by @devin-ai-integration[bot]
- Add Xero webhooks guide and update integration documentation (#3999) by @viictoo
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/dade55c80497f60d65612c9c15aec6f4ed8bb673 by Khaliq. Commit message: feat(github-app-oauth): add symlink (#320) by @github-actions[bot]
- *(supabase)* Add Supabase support to integrations (#3991) by @lordsarcastic
- Add comprehensive Salesforce OAuth setup guide (#3696) by @devin-ai-integration[bot]
- Send email via any smtp server (#4009) by @TBonnin
- *(integrations)* Add support for kandji (#4010) by @hassan254-prog
- *(scheduler)* Max concurrency aware dequeue query (#4002) by @TBonnin
- *(refresh-token)* Add offline_access scope (#4020) by @khaliqgant
- Add scheduler indexes for expired tasks query (#4016) by @TBonnin
- Add docs on figma rate limit per authenticated user (#4011) by @hassan254-prog
- *(google-drive)* Added support for Google Slides (#3996) by @lordsarcastic
- *(docs)* Enhance general information output with model details (#4000) by @viictoo
- *(integrations)* Add support for open-hands coding agent (#4018) by @homanp
- *(jazzhr)* Add support for JazzHR (#4014) by @lordsarcastic
- *(slack)* Add an alternate path for access_token if undefined (#4025) by @hassan254-prog
- *(microsoft-teams)* Microsoft: Obtain tenantId by decoding the access token instead of calling the /organizations endpoint (#4024) by @lordsarcastic

### Changed

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/72842769cf8c5d3c0eb35a138411a924ad88f41a by Victor Lang'at. Commit message: feat(calendly): check calendly api v1 to v2 migration (#315) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/c69d76a5c47d0b6cbbbd30e73cba32d79d6ad8fb by Hassan_Wari. Commit message: feat(xero): update general ledger pagination logic (#318) by @github-actions[bot]
- April changelog (#3977) by @bastienbeurier
- *(eslint)* Manual pass over some folders (#3979) by @bodinsamuel
- *(fleet)* Expose a overrideNodeConfig function (#3984) by @TBonnin
- Update rate limit code snippet (#3966) by @kndwin
- *(deps-dev)* Bump vite from 6.3.3 to 6.3.4 (#3983) by @dependabot[bot]
- Document credentials validation errors (#4003) by @hassan254-prog
- *(scheduler)* Update groups max concurrency (#3997) by @TBonnin
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/7eb6ed09f2170198ebd5634ed47fe993d4fc85a9 by lordsarcastic. Commit message: feat(grammarly): Grammarly User provisioning (#319) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/2b43009ae28e2834c699a9856b0acb2b973aad78 by Guilherme Bassa. Commit message: feat(gusto): update employee actions (#322) by @github-actions[bot]
- New integrations method (#4004) by @bodinsamuel
- *(scheduler)* Decrease frequency of monitor worker (#4022) by @TBonnin

### Fixed

- *(plan)* Wrong condition on connection_with_scripts_max (#3953) by @bodinsamuel
- *(auth)* Github app custom token, copy buttons (#3956) by @bodinsamuel
- Wrong webhook duration in logs (#3955) by @kaposke
- Upgrade dependencies (#3957) by @bodinsamuel
- *(persist)* Adapt wording for batchDelete, log missing error (#3958) by @bodinsamuel
- *(webapp)* Apply default scopes for oauth2 (#3919) by @hassan254-prog
- *(billing)* Use orb (#3970) by @bodinsamuel
- *(api)* Only count enabled scripts (#3976) by @bodinsamuel
- *(billing)* Send events for all users (#3980) by @bodinsamuel
- *(ci)* Windows (#3971) by @bodinsamuel
- *(orb)* Batch events (#3993) by @bodinsamuel
- *(github-app-oauth)* Refresh user credentials when refreshing github app oauth connection (#3995) by @hassan254-prog
- *(microsoft)* Fix scope location in docs (#3998) by @khaliqgant
- *(api)* Accept empty scopes (#4008) by @bodinsamuel
- *(scheduler)* Allow skipping group update if locked (#4015) by @TBonnin
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/899da5a75bc1c949da81dd6e820c4b4c271c8b76 by Khaliq. Commit message: fix(linear): Linear users sync (#323) by @github-actions[bot]
- *(ui)* Billing page feedback (#4005) by @bodinsamuel
- Refresh connections (#4006) by @bodinsamuel
- *(github-app-oauth)* Don't exit early on an update setup_action (#4027) by @khaliqgant
- *(auth)* Can't detect popup with security headers (#4028) by @bodinsamuel

## [v0.58.6] - 2025-04-24

### Added

- *(integrations)* Add support for devin (#3889) by @hassan254-prog
- *(integrations)* Add support for gem (#3892) by @hassan254-prog
- *(integrations)* Add support for companycam (#3894) by @CharlesWithC
- *(integrations)* Add support for rootly (#3903) by @hassan254-prog
- *(integrations)* Add support for jira data center basic auth (#3902) by @hassan254-prog
- Calculate billable connections metric (#3900) by @TBonnin
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/7b9a44b3fbf9af77448779df5c41c67d825f9e1b by Victor Lang'at. Commit message: feat(xero): add bank transactions sync (#311) by @github-actions[bot]
- *(logs)* Always append accountId to msg (#3907) by @bodinsamuel
- *(ui)* Improve operation search, perf, caching (#3901) by @bodinsamuel
- Add github actions to close inactive issues/PRs (#3913) by @TBonnin
- Delete environments (#3899) by @kaposke
- *(providers)* Add support for incident.io (#3917) by @viictoo
- Add support for Sentry (#3925) by @viictoo
- *(integrations)* Add suport for redtail crm sandbox (#3918) by @hassan254-prog
- *(plans)* Add connections_max flag (#3931) by @bodinsamuel
- *(persist)* Log unchanged records (#3929) by @bodinsamuel
- Event tracking v2 (#3922) by @bodinsamuel
- *(ui, api, db)* Allow editing integration name via new field (#3882) by @steliosmavro
- *(api)* Enforce max cli version with flag (#2957) by @bodinsamuel
- *(cli)* Version command shorthand (#3942) by @kaposke
- *(api)* Enforce max connections (#3935) by @bodinsamuel
- Billing with Lago (#3927) by @TBonnin
- *(integrations)* Add support for docuware (#3941) by @hassan254-prog
- *(api)* Enforce max connections (again)  (#3949) by @bodinsamuel
- *(api)* GET /plans (#3950) by @bodinsamuel
- *(cli)* Add message when all files compile successfully in `nango dev` (#3908) by @kaposke

### Changed

- *(deps-dev)* Bump vite from 6.2.5 to 6.2.6 in /packages/webapp (#3893) by @dependabot[bot]
- Rename plans, fix add-on info (#3897) by @bastienbeurier
- *(scheduler)* Restart worker when exiting (#3909) by @TBonnin
- Fix Qualtrics API reference link (#3923) by @rguldener
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/ca76842e66fcedcf1e92465801c69c3dbe86d164 by lordsarcastic. Commit message: feat(microsoft-teams): Messages sync (#310) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/d3572f77463c8689ca6844336f4298c189e19560 by Khaliq. Commit message: feat(workday): Workday improvements (#314) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/900799a12446be9a45d10b6d6e72949b1663c1d8 by lordsarcastic. Commit message: feat(xero): Add credit notes support (#313) by @github-actions[bot]

### Fixed

- Fix typos across the docs (#3895) by @steliosmavro
- *(ui)* Logs fix history, virtualization, data loading and caching (#3888) by @bodinsamuel
- *(docker)* Incorrect providers path (#3896) by @bodinsamuel
- *(gong-oauth)* Make api_base_url_for_customer field not required (#3898) by @hassan254-prog
- *(cli)* Compile one file and symlink (#3905) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/8be22ff82e59b167081c83fa831d8352492fee26 by Hassan_Wari. Commit message: fix(g-calendar): events sync (#312) by @github-actions[bot]
- *(api)* Typo in file name (#3912) by @bodinsamuel
- *(cli)* Ignore symlink test for windows  (#3911) by @bodinsamuel
- *(persist)* Express error handler didn't use correct error response schema (#3915) by @TBonnin
- *(integrations)* Use the correct base url (#3904) by @hassan254-prog
- *(ui)* Disable cache when live (#3921) by @bodinsamuel
- *(auth)* Split Tableau from connection (#3926) by @bodinsamuel
- *(persist)* Fix lock id generation (#3932) by @TBonnin
- *(cli)* Correctly resolve file with fake extension (#3924) by @bodinsamuel
- *(auth)* Split Bill from connection (#3930) by @bodinsamuel
- *(jira)* Use endpoint that requires no scopes (#3937) by @khaliqgant
- *(cron)* Invalid lock ttl (#3936) by @bodinsamuel
- *(api)* PUT /sync/update-connection-frequency new format (#3940) by @bodinsamuel
- *(auth)* Split Signature from connection  (#3939) by @bodinsamuel
- *(integrations)* Fix integrations categories (#3944) by @hassan254-prog
- *(plans)* Store definitions, fix trial api path  (#3943) by @bodinsamuel
- *(jira-basic)* Update verification endpoint (#3947) by @khaliqgant
- *(deploy)* Cli should not pass empty string for actions' run (#3948) by @bodinsamuel
- *(auth)* Split Apple App Store from connection (#3945) by @bodinsamuel
- *(gem)* Fix gem integration (#3951) by @hassan254-prog
- *(auth)* Split Github App from connection  (#3946) by @bodinsamuel

## [v0.58.5] - 2025-04-11

### Added

- *(jwt)* Use dynamic credentials to build the jwt (#3862) by @hassan254-prog
- Add comprehensive Google OAuth setup guide (#3702) by @devin-ai-integration[bot]
- *(integrations)* Add support for shopify partner (#3869) by @kmclaugh
- *(logs)* Search in global field, index batchSave (#3877) by @bodinsamuel
- *(webapp)* Revamp error circles (#3873) by @kaposke
- *(integrations)* Enforce regex pattern matching for snowflake jwt (#3878) by @hassan254-prog
- *(integrations)* Add support for smartlead ai (#3879) by @hassan254-prog
- *(docs)* Add xero note about offline_access scope (#3880) by @khaliqgant
- *(db)* Add soft delete columns to environment (#3891) by @kaposke

### Fixed

- *(rateLimit)* Use dynamic size (#3868) by @bodinsamuel
- *(es)* Do not index meta (#3870) by @bodinsamuel
- *(rateLimit)* Correctly store limiter (#3872) by @bodinsamuel
- *(frontend)* Better modal handling (#3867) by @bodinsamuel
- *(integration-deploy)* Fix install of a public integration to install the latest version (#3871) by @hassan254-prog
- *(rateLimit)* Increase limit for providers.json (#3876) by @bodinsamuel
- Runner-sdk triggerSync signature (#3874) by @TBonnin
- Expose reason a task was expired (#3875) by @TBonnin
- Clearing cache of variant syncs deletes records of the base sync (#3883) by @TBonnin
- *(runner-sdk)* No need for a mutex (#3884) by @TBonnin
- *(integrations)* Workday require user to add tenant and hostname as connectionConfigs (#3887) by @hassan254-prog
- Do not increment/decrement DD metric if value = 0 (#3885) by @TBonnin
- *(logs)* Wrong es schema (#3886) by @bodinsamuel
- *(ui)* Switch size and alignement (#3890) by @bodinsamuel

## [v0.58.4] - 2025-04-08

### Added

- *(webapp)* Remember last environment (#3814) by @hassan254-prog
- *(integrations)* Add Support for Rock Gym Pro (#3857) by @matoviale
- *(fleet)* Add more Render server definition (#3860) by @bodinsamuel
- *(plan)* Trial  (#3803) by @bodinsamuel
- Rename environments (#3864) by @kaposke
- *(es)* Meta search (#3835) by @bodinsamuel
- Nango locks in scripts (#3863) by @TBonnin

### Changed

- Details about free trial (#3861) by @bastienbeurier
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/f4eaea1a0d7f791c11a1bb14be60c441e04d1ea2 by Khaliq. Commit message: feat(pagination-tests): Pagination & Fix groups (#305) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/e3fdb00a5adcdcff55a4aa13c72d81f5649c610e by Hassan_Wari. Commit message: feat(gong): calls sync and fetch transcript action (#306) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/0d8f99ec7a4a837e6bc447d7ad9d5af1cf0407c4 by Khaliq. Commit message: feat(xero): Add source for xero (#308) by @github-actions[bot]

### Fixed

- *(ui)* Create connection missing integration (#3859) by @bodinsamuel
- *(plan)* Typo in flag (#3856) by @bodinsamuel
- *(plan)* Use plan for tracer (#3848) by @bodinsamuel
- *(integrations)* Missing retry header for Slack (#3865) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/e80f61bb4fd37591e2c4c4a10932df038a50fd2d by Khaliq. Commit message: fix(cursor): Fix cursor and document (#307) by @github-actions[bot]
- *(plans)* Follow-up (#3866) by @bodinsamuel

## [v0.58.3] - 2025-04-04

### Added

- *(plan)* Replace is_capped (#3825) by @bodinsamuel
- *(azure-devops)* Implement support for Azure Devops (#3785) by @lordsarcastic

### Changed

- *(deps-dev)* Bump vite from 6.0.11 to 6.0.13 (#3818) by @dependabot[bot]
- Update .env.example (#3826) by @steliosmavro
- *(deps)* Bump tar-fs and testcontainers (#3812) by @dependabot[bot]
- Webhook can execute for 1 hour (15mins previously) (#3815) by @TBonnin
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/fa13e02ca460a0d35b94ba868ecaad94df542b88 by Khaliq. Commit message: feat(unification): HRIS employees unification (#301) by @github-actions[bot]
- Xero oauth step guide (#3844) by @hassan254-prog
- Edit limits (#3845) by @bastienbeurier
- Nango on AWS ECS guide (#3830) by @TBonnin
- When there is a connect ui document, link to that for the setup guide (#3751) by @lordsarcastic
- *(deps-dev)* Bump vite from 6.2.4 to 6.2.5 in /packages/webapp (#3851) by @dependabot[bot]

### Fixed

- Update nango-runner package to utilize soap package 1.1.10 (#3840) by @colinbjohnson
- *(docs)* Docs update openai format (#3842) by @khaliqgant
- *(deps)* Upgrade vitest, axios, zod (#3841) by @bodinsamuel
- *(docker)* Cleanup (#3838) by @bodinsamuel
- Display git hash in api and UI (#3843) by @bodinsamuel
- *(connect-ui)* Show unique_key suffix when integration names are du… (#3846) by @steliosmavro
- *(integrations)* Remove the pattern in Avalara for the client. (#3852) by @hassan254-prog
- *(docs)* Doc improvements (#3855) by @khaliqgant
- *(cli)* Remove global store to allow tests to reuse code (#3850) by @bodinsamuel

## [v0.58.2] - 2025-04-03

### Added

- *(integrations)* Add support for employment hero (#3817) by @hassan254-prog
- *(plans)* Table migration (#3807) by @bodinsamuel
- *(docs)* Update trigger sync docs (#3816) by @kaposke
- Add billed records metrics (#3819) by @TBonnin
- *(plan)* Create free plan for new account (#3822) by @bodinsamuel
- *(ui)* Webpack -> vite (#3780) by @bodinsamuel

### Changed

- March changelog + improvements (#3824) by @bastienbeurier
- *(test)* Provide more seeder for unit test (#3823) by @bodinsamuel
- Reference pagination callback within  docs (#3827) by @hassan254-prog
- Remove some metrics dimensions (#3829) by @TBonnin
- *(deploy)* Use docker image for prod server (#3836) by @bodinsamuel

### Fixed

- Webhook response (#3832) by @TBonnin
- *(cli)* Compile only scripts in the nango yaml config (#3811) by @hassan254-prog
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/4cbeb70d391664de869f961664f7fc49fb95f510 by Hassan_Wari. Commit message: fix(outloook): properly fetch email attachments (#302) by @github-actions[bot]
- *(api)* GET /api/v1/integrations new format (#3833) by @bodinsamuel
- *(test)* Fix failing tests for windows (#3834) by @hassan254-prog
- *(scriptConfig)* Don't use disallowed character for the function name (#3837) by @khaliqgant

## [v0.58.1] - 2025-04-01

### Added

- *(attio)* Add retry parsing (#3791) by @khaliqgant
- Add AI demo (#3793) by @bastienbeurier
- *(integrations)* Add support for xero client credentials (#3798) by @hassan254-prog
- *(integrations)* Add sipport for rippling shop app (#3799) by @hassan254-prog
- Add Outreach integration setup guide (ext-368) (#3749) by @devin-ai-integration[bot]
- *(api)* Add sync_mode param to /sync/trigger (#3795) by @kaposke
- Nango to respond/forward webhook immediately (#3801) by @TBonnin
- *(node-client)* Support sync_mode in triggerSync (#3805) by @kaposke
- *(ai-toolkit)* Openai scripts format (#3796) by @khaliqgant
- *(integrations)* Add support for github pat (#3800) by @hassan254-prog
- *(pagination)* Add pagination callback function  (#3810) by @hassan254-prog

### Changed

- *(api)* Refactor POST /sync/trigger (#3782) by @kaposke

### Fixed

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/0e151ef434f0216827ff9efd05f1edc445554889 by Khaliq. Commit message: fix(action-retries): Action default (#291) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/7a609effae7837d0a6e022fb7f603c0acb54b57e by Khaliq. Commit message: fix(hibob): Fix hibob employees sync (#292) by @github-actions[bot]
- *(refresh)* Missing last_fetched_at (#3789) by @bodinsamuel
- *(ui)* Use correct API hostname (#3777) by @bodinsamuel
- *(providers.yaml)* Retry for 403 for google cal and hibob connect UI (#3788) by @khaliqgant
- *(docs)* Reported documentation issues (#3786) by @lordsarcastic
- Cors issue (#3790) by @bodinsamuel
- Fleet fallback db url (#3787) by @TBonnin
- *(api)* POST /logout new format (#3794) by @bodinsamuel
- Abort all scripts when timing out (#3797) by @TBonnin
- *(env)* Missing NANGO_PUBLIC_SERVER_URL (#3804) by @bodinsamuel
- *(auth)* Oauth2_cc support authorization_params (#3792) by @bodinsamuel
- *(docs)* Fix bad imports (#3808) by @khaliqgant
- *(api)* Make sync_mode optional in /sync/trigger (#3813) by @kaposke
- Do not block request if rate limit cannot be computed (#3806) by @TBonnin
- *(email)* Upgrade client, missing async/await (#3809) by @bodinsamuel
- *(docs)* Fix endpoint usage (#3820) by @khaliqgant

## [v0.57.6] - 2025-03-26

### Added

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/81232fa2f7ba4437afce3783fe2e67496bd8d865 by devin-ai-integration[bot]. Commit message: feat(bitdefender): add get-company-details action (#288) by @github-actions[bot]
- *(integrations)* Add support for active campaign (#3773) by @hassan254-prog
- *(ring-central)* Add retry-after parsing (#3778) by @khaliqgant

### Changed

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/79f8071b446e46a65352fc2c7c6a942719e1c1f4 by lordsarcastic. Commit message: feat(github): push github sync to public templates (#260) by @github-actions[bot]
- *(docs)* Clean up miro instructions (#3774) by @khaliqgant
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/2e48c6b3be900666e113cd74f1af78de17fbfb54 by Khaliq. Commit message: feat(ring-central): Ring central operations (#290) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/f4678ca5ae168739b821ecb520fda00e3b84e6ff by devin-ai-integration[bot]. Commit message: feat: Add One Drive integration provider (#270) by @github-actions[bot]
- 2 metrics about ingested records (#3781) by @TBonnin

### Fixed

- *(logging)* Remove log (#3775) by @khaliqgant
- Connection is already deleted when executing pre-connection-deletion (#3772) by @TBonnin
- Make Slack notifications aware of sync variants (#3771) by @TBonnin
- *(cli)* Reup validation error message (#3779) by @bodinsamuel
- *(api)* Split routes (#3776) by @bodinsamuel
- *(runner-sdk)* Forward props in uncontrolledFetch (#3783) by @kaposke

## [v0.57.5] - 2025-03-25

### Added

- Add comprehensive Quickbooks OAuth setup guide (#3693) by @devin-ai-integration[bot]

### Changed

- *(deploy)* Staging use unified image (#3767) by @bodinsamuel

### Fixed

- *(logs)* Buffer context, log oauth2 http calls (#3765) by @bodinsamuel
- *(persist)* Only report the size and count of modified records (#3764) by @TBonnin
- *(connection)* Decryption without a secret key would void credentials (#3769) by @bodinsamuel
- *(api)* GET /api/v1/environment new format (#3766) by @bodinsamuel

## [v0.57.4] - 2025-03-25

### Added

- *(credentials-check)* Add bitdefender verification script (#3760) by @khaliqgant
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/f2d2c6b9565c9fe84d72ae1503949d6fd3b8cd59 by Hassan_Wari. Commit message: feat(quickbooks): add write actions for journal entry (#285) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/d2fd05d76c0c409bb37dddd8c451118a0d6e20e5 by Khaliq. Commit message: feat(databricks): add list warehouses action (#287) by @github-actions[bot]

### Changed

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/ae0732ad718ce5910ef0e3890e4f304b62220870 by Khaliq. Commit message: feat(cursor+google-car): More cursor tweaks + settings action (#284) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/37bbc8985fa36d0ab6368fd2c117cce780a638b2 by lordsarcastic. Commit message: feat(netsuite-tba): Add a fetch-fields action for netsuite-tba (#283) by @github-actions[bot]

### Fixed

- ShouldRefreshCredentials to return false if credentials_expires_at is set (#3754) by @TBonnin
- *(runner)* Do not exit on unhandledRejection (#3756) by @TBonnin
- *(guru-scim)* Update guru scim (#3757) by @khaliqgant
- *(types)* Use nango standard config from types (#3759) by @khaliqgant
- *(cron)* Unify error reporting, envs, logging (#3731) by @bodinsamuel
- *(cron)* Delete all old data (#3712) by @bodinsamuel
- *(cli)* Deduplicate records when using batchSave in CLI (#3761) by @hassan254-prog
- Check record is not null in removeMetadata (#3758) by @TBonnin
- *(ui)* Show correct message for credentials error (#3762) by @bodinsamuel
- *(logs)* Do not fallback on unknown operation id (#3738) by @bodinsamuel
- *(refresh)* Only update attempts once per day (#3736) by @bodinsamuel
- *(refresh)* Short-circuit if exhausted, trycatch hooks (#3734) by @bodinsamuel
- *(credentials)* Split JWT from connection (#3729) by @bodinsamuel
- *(connection)* Merge issue (#3763) by @bodinsamuel
- *(connect-ui)* Do not detect closed auth-window (#3755) by @hassan254-prog

## [v0.57.3] - 2025-03-21

### Added

- *(integrations)* Add support for trakstar hire (#3752) by @hassan254-prog
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/bee0032882d7169ec818a79b56bb0c18a470c86c by devin-ai-integration[bot]. Commit message: feat(dropbox): add folder-content action (#267) by @github-actions[bot]

### Changed

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/40232a42fa89e73045ce320640d3212dd1b340b3 by devin-ai-integration[bot]. Commit message: feat(google-drive): update schema for folder-content action (#268) by @github-actions[bot]
- Credentials refresh & validity (#3739) by @bastienbeurier

### Fixed

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/50a138a00917f508e60c929e2197ad7fc2f9c474 by Khaliq. Commit message: fix(google-drive): support all drives (#272) by @github-actions[bot]
- *(CLI)* Nango.proxy should throw if request fails (#3753) by @TBonnin
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/4082e738d90d3501418d3c697e877f713157c6d4 by Khaliq. Commit message: fix(google-cal): minor cleanup and add whoami (#274) by @github-actions[bot]

## [v0.57.2] - 2025-03-20

### Added

- Add comprehensive Zendesk OAuth setup guide (#3701) by @devin-ai-integration[bot]
- Add comprehensive Intercom OAuth setup guide (#3695) by @devin-ai-integration[bot]
- Add accountId dimension to execution duration metrics (#3711) by @TBonnin
- *(hooks)* Reorder provider specific code under the provider instead of the type  (#3717) by @hassan254-prog
- *(integrations)* Add support for Callrail (#3728) by @thomask
- *(connect)* Allow authorization_params (#3726) by @bodinsamuel
- *(connect)* Accept param detectClosedAuthWindow (#3732) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/f27ad9f14703a95af2af01868b718ace1a2c5b49 by Victor Lang'at. Commit message: feat: add Linkedin messages sync. (#263) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/0c343e6a682f3807f56736dab1982267bb7d5a52 by devin-ai-integration[bot]. Commit message: feat(box): add folder-content action (#265) by @github-actions[bot]
- Add comprehensive Jira OAuth setup guide (#3704) by @devin-ai-integration[bot]
- Add comprehensive Confluence OAuth setup guide (#3705) by @devin-ai-integration[bot]
- *(verification)* Add verification method for ghost admin (#3737) by @hassan254-prog
- *(integrations)* Add support for figma scim (#3733) by @hassan254-prog
- *(verification)* Add verification script for aws-iam (#3735) by @hassan254-prog

### Changed

- *(eslint)* Import order as warning (#3721) by @bodinsamuel
- Slack notification sent via proxy instead of using an action (#3722) by @TBonnin

### Fixed

- *(logs)* Compute index name from operation id (#3719) by @bodinsamuel
- *(verification)* Not all providers have a valid method or script (#3723) by @hassan254-prog
- *(logs)* Catch parsing error (#3724) by @bodinsamuel
- *(logs)* Remove usage of kvstore (#3725) by @bodinsamuel
- *(connections)* Fill refresh columns, fix row_to_json types (#3718) by @bodinsamuel
- *(refresh)* Incorrect condition for stale connections, missing expires_at for api_key (#3727) by @bodinsamuel
- *(refresh)* Missing last_fetched_at update (#3730) by @bodinsamuel

## [v0.57.1] - 2025-03-17

### Added

- *(persist)* Add accountId dimension to records metrics (#3676) by @TBonnin
- Add accountId dimension to secretKey auth (#3678) by @TBonnin
- Add GET /records metrics (#3677) by @TBonnin
- *(providers)* Normalize credentials interpolation within providers (#3679) by @hassan254-prog
- *(logs)* Add http duration and context (#3680) by @bodinsamuel
- *(connect)* Telemetry (#3684) by @bodinsamuel
- Add comprehensive Shopify OAuth setup guide (#3683) by @devin-ai-integration[bot]
- *(integrations)* Add support for oracle fusion cloud hcm (#3694) by @hassan254-prog
- Add metric for records total count per account (#3709) by @TBonnin
- *(verification)* Make verification check more robust  (#3666) by @hassan254-prog
- *(integrations)* Add support for microsoft client credentials (#3715) by @hassan254-prog
- *(integrations)* Add support for pandadoc api key (#3716) by @hassan254-prog

### Changed

- Enterprise self-hosted improvements (#3670) by @bastienbeurier
- Update architecture diagram (#3685) by @bastienbeurier
- Cron job to export connection count metric to dd (#3686) by @TBonnin
- Move AI use-cases to getting started section (#3689) by @rguldener
- *(metrics)* We also want connections with syncs/actions/webhooks count (#3688) by @TBonnin
- Disable Slack notification by @TBonnin
- Pass accountId to log context to use it in metrics (#3710) by @TBonnin

### Fixed

- Fix real-time sync docs info (#3673) by @bastienbeurier
- *(ui)* Logs duration format, timestamp format (#3675) by @bodinsamuel
- *(verification)* Fix verification for unipile (#3682) by @hassan254-prog
- *(logs)* Put date in operation id (#3687) by @bodinsamuel
- Remove withSchema in query by @TBonnin
- *(jobs)* Drop where deleted index (#3681) by @bodinsamuel
- *(cron)* Delete old data (#3690) by @bodinsamuel
- *(logs)* Set auth operation as cancelled when expired (#3691) by @bodinsamuel
- *(db)* Drop unused table schedules  (#3692) by @bodinsamuel
- Use knex Transaction for all queries within a transaction (#3714) by @TBonnin
- *(connection)* Split refresh function (#3674) by @bodinsamuel
- *(node)* Remove leftover console.log (#3720) by @bodinsamuel

## [v0.57.0] - 2025-03-12

### Added

- *(integrations)* Add support for razorpay (#3650) by @hassan254-prog
- *(jobs)* Add index without deleted (#3651) by @bodinsamuel
- *(integrations)* Add anthropic admin (#3645) by @viictoo
- *(connect)* Store operation_id in DB (#3661) by @bodinsamuel
- *(integrations)* Add support for tldv (#3659) by @hassan254-prog
- *(link-pagination)* Add in baseUrlOverride (#3665) by @khaliqgant
- *(insights)* Add auth graph, show all states (#3663) by @bodinsamuel
- *(integration)* Add missive support (#3664) by @miles-kt-inkeep
- *(providers)* Add verification endpoints (untested) (#3643) by @viictoo
- *(providers)* Add api verification endpoint (3 of 6) (#3642) by @viictoo
- *(providers)* Connect ui documentation (1 of 10) (#3648) by @lordsarcastic
- Add AI use-cases link, improve services page, avoid duplicating real-time sync pages (#3668) by @bastienbeurier
- *(sdk)* Allow a sync to be started from the sdk (#3671) by @khaliqgant
- *(cli-deploy)* Deploy scripts for a specific api (#3660) by @viictoo
- *(integrations)* Add support for readwise and readwise reader (#3669) by @hassan254-prog

### Changed

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/7a63ea86f4ec62b2370f93ca1acf894204554b30 by lordsarcastic. Commit message: feat(linear): GraphQL introspection (#254) by @github-actions[bot]
- *(deps)* Bump axios from 1.7.9 to 1.8.2 (#3646) by @dependabot[bot]
- Differentate runner database url (#3644) by @TBonnin

### Fixed

- *(otlp)* Manual span by @bodinsamuel
- Show model in sync webhook log operation (#3641) by @TBonnin
- *(logs)* Do not await more logs  (#3649) by @bodinsamuel
- *(ui)* Tag padding, and SyncRow alignment (#3657) by @bodinsamuel
- *(auth)* Log endUser (#3656) by @bodinsamuel
- Set missing application_name in knex connection config (#3658) by @TBonnin
- *(es)* Prepare fields for duration and context (#3655) by @bodinsamuel
- *(connection)* Store metadata for refresh  (#3653) by @bodinsamuel
- *(logs)* Stop awaiting logs (#3654) by @bodinsamuel
- *(jobs)* Remove usage of deleted (#3652) by @bodinsamuel
- *(otlp)* Manual span (#3647) by @bodinsamuel
- *(webhooks)* Use same retry and logging as proxy (#3662) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/31bf1d42bcb17db1818e84163da38595dfc9a333 by Khaliq. Commit message: fix(compilation-test): resolve all aliases before compiling (#259) by @github-actions[bot]

## [v0.56.4] - 2025-03-07

### Fixed

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/7d8ef4a445a02c6f8c4da217952cc0cb488e94f9 by Khaliq. Commit message: fix(schema): Schema should always be updated (#255) by @github-actions[bot]
- *(cli)* Add metadata section for docs (#3640) by @khaliqgant

## [v0.56.3] - 2025-03-07

### Fixed

- *(cli-deploy)* Concurrent deployment throws an error and ruins future (#3639) by @khaliqgant

## [v0.56.2] - 2025-03-07

### Added

- *(docs)* Document sync variant in docs reference (#3607) by @TBonnin
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/0172dcf2019baf9c98b7c5f59f224d6fb444350f by Victor Lang'at. Commit message: feat(google-drive): add fetch-folders and upload-document actions; en… (#248) by @github-actions[bot]
- Add sigint and sigterm support for all services (#3620) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/31eacd0661a1cbbd151accef42b41632d5ba0b53 by Khaliq. Commit message: feat(gorgias): add symlink (#243) by @github-actions[bot]
- *(veriifcation)* [nan-2856] additional scim verification checks (#3627) by @khaliqgant
- *(http)* Add env to change agent (#3597) by @bodinsamuel
- Add sentry again (#3623) by @bodinsamuel
- *(integrations)* Add support for sharepoint online v2 oauth2_cc (#3633) by @hassan254-prog
- *(generate:docs)* Add specific option for integration templates (#3638) by @khaliqgant

### Changed

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/c0b1166087c87bc71acd6a477c9ea2450a7b4980 by devin-ai-integration[bot]. Commit message: refactor: replace zod validation pattern with nango.zodValidateInput() (#240) by @github-actions[bot]
- 300+ to 400+ APIs (#3637) by @bastienbeurier

### Fixed

- Refactor script result handler (#3621) by @TBonnin
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/a53b152611212714834516f56c78fc8737154403 by Khaliq. Commit message: fix(microsoft-teams): fix pagination and org unit (#250) by @github-actions[bot]
- *(provider)* Fix mip (#3624) by @hassan254-prog
- Fixing typographical errors (#3612) by @clarencepenz
- *(es)* Make nullable fields undefinable, dissociate Message and Operation (#3548) by @bodinsamuel
- *(oauth2)* Fix authorization params miss interpolation logic (#3628) by @hassan254-prog
- *(oauth)* Improve callback html response  (#3626) by @bodinsamuel
- *(kvstore)* Move feature flags to dedicated package  (#3625) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/914da07de9a9ceded03d5db81183901b39ff4bd0 by Khaliq. Commit message: fix(hubspot): clean up typing (#252) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/5c6b4c01169363dd0b49da58f830772e116bfc91 by Khaliq. Commit message: fix(schema): bump the version (#253) by @github-actions[bot]
- *(mip)* Update token response interpolation (#3630) by @hassan254-prog
- *(kvstore)* Move Locking (#3631) by @bodinsamuel
- Fail action when output is >10mb (#3629) by @TBonnin
- *(agent)* Better default for axios (#3632) by @bodinsamuel
- *(telemetry)* Remove logs (#3635) by @bodinsamuel
- *(es)* Do not wait some calls, change sharding (#3634) by @bodinsamuel
- *(syncConfig)* Runs is nullable, not models  (#3636) by @bodinsamuel

## [v0.56.1] - 2025-03-04

### Added

- *(integrations)* Add support for blackbaud basic (#3616) by @hassan254-prog

### Fixed

- *(db)* Clean up models, use read-only for more calls (#3613) by @bodinsamuel
- *(zod-validation)* Return the parsed zod (#3622) by @khaliqgant

## [v0.56.0] - 2025-03-04

### Added

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/71af92e2df493bcaada30310cb1de04f17252315 by Victor Lang'at. Commit message: feat(outlook): add calendars and events sync (#241) by @github-actions[bot]
- *(cli)* Dynamically load extraneous dependency (#3601) by @bodinsamuel
- *(cli-docs)* Cli command to generate integration readme files (#3614) by @khaliqgant
- *(cron)* Delete old jobs data  (#3619) by @bodinsamuel

### Changed

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/8d6f366ac10909f31486123e808403e935884bb8 by Khaliq. Commit message: feat(paylocity): Add paylocity (#244) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/2001c1fd1c40ed7ec49f76ee0fccbe527a3d7891 by Daniel Roy Lwetabe. Commit message: feat(box): file sync (#235) by @github-actions[bot]
- Add Feb changelog + update popular APIs (#3610) by @bastienbeurier

### Fixed

- Remove usage of getEndUserByConnectionId (#3609) by @TBonnin
- *(db)* Allow using read-only replica (#3605) by @bodinsamuel
- *(db)* Use read-only for getProviderConfig (#3611) by @bodinsamuel
- *(telemetry)* Remove unused logs (#3599) by @bodinsamuel
- *(api)* GET /scripts/config (#3598) by @bodinsamuel
- Temporary disabling actions slack and bigquery reporting (#3615) by @TBonnin
- *(runner-sdk)* Support variant in getRecordsByIds (#3608) by @TBonnin
- *(gorgias-api)* Remove api so can have parity (#3603) by @khaliqgant
- *(figma)* Update token requests method and endpoints (#3618) by @hassan254-prog

## [v0.55.0] - 2025-02-28

### Added

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/49a5924e33dfbd90019b0ee4889267611cd03b42 by Hassan_Wari. Commit message: feat(sage-intacct): add accounts sync (#230) by @github-actions[bot]
- Add support for mip (#3556) by @viictoo
- *(integrations)* Add support for quickbase (#3570) by @viictoo
- *(integrations)* Add support for openai admin keys (#3573) by @viictoo
- Modify /sync/ API endpoints to support variant (#3567) by @TBonnin
- Add support for variant when fetching records (#3569) by @TBonnin
- *(node-client)* Add support for sync variants (#3568) by @TBonnin
- Add redirect url instruction to quickstart (#3574) by @kaposke
- *(docs)* Google drive documentation improvements (#3571) by @viictoo
- *(integrations)* Improvements and fixes - openai administration docs (#3583) by @viictoo
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/cc191be294b00835509cd3b084c52413fdf1e201 by Khaliq. Commit message: feat(updated-at): add updatedAt to the drive sync (#236) by @github-actions[bot]
- *(cli)* Log http calls (#3581) by @bodinsamuel
- Add support for sync variant in runner-sdk/cli (#3582) by @TBonnin
- *(integrations)* Add support for check (#3553) by @dannylwe
- Expore variant in nango sync webhook (#3589) by @TBonnin
- *(oauth)* Add a configurable code parameter for oauth2 in the callback url (#3593) by @hassan254-prog
- *(ui)* Show sync variant on connections page (#3588) by @TBonnin
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/2c9acd0392d5cec68e7c6e2ecc7f221a15c5b8fd by Victor Lang'at. Commit message: feat(integrations): add folders  & labels sync (#237) by @github-actions[bot]
- *(integrations)* Add support for lemlist (#3591) by @hassan254-prog
- *(integrations)* Fixes for mip: add separate on prem and cloud provider (#3585) by @viictoo
- Add API endpoints and functions to create/delete sync variants (#3600) by @TBonnin

### Changed

- Create popular category for APIs (#3584) by @bastienbeurier
- Update popular APIs (#3592) by @bastienbeurier
- Update retry strategy (#3596) by @bodinsamuel
- Clarify the difference between sharepoint v1 and v2 (#3602) by @hassan254-prog
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/6c11a188e1033fa81643ac561da82dea7324f530 by Victor Lang'at. Commit message: chore: update gorgias types (#238) by @github-actions[bot]

### Fixed

- *(connection)* Import should reset auth errors (#3558) by @bodinsamuel
- *(orchestrator)* Return 408 on timeout (#3537) by @bodinsamuel
- *(proxy)* Remove token from payload, rewrite headers building (#3557) by @bodinsamuel
- *(compile-error)* Remove unneeded conditions (#3572) by @khaliqgant
- *(integrations)* Fix authorization url for amazon selling partner (#3575) by @hassan254-prog
- *(ui)* Change switch color, scroll to settings (#3577) by @bodinsamuel
- *(ui)* Display script name on template page (#3576) by @bodinsamuel
- *(proxy)* Upload file as binary (#3551) by @hassan254-prog
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/65024747895e5b17dd87cdfaef28dfaaf19e184b by Khaliq. Commit message: fix(basecamp-types): type fixes (#234) by @github-actions[bot]
- *(proxy)* Refresh connection between retries  (#3566) by @bodinsamuel
- *(proxy)* Refresh connection between retries (again) (#3587) by @bodinsamuel
- *(api)* Reup otlp check (#3586) by @bodinsamuel
- *(ui)* Use singular for operation type (#3579) by @bodinsamuel
- *(ui)* Show endpoint types (#3578) by @bodinsamuel
- *(api)* Redac logged headers when calling v1/ (#3580) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/90e3f5fccc4e484aace20a89b4d16347a1da8918 by Khaliq. Commit message: fix(g-cal): tighten up types (#239) by @github-actions[bot]
- *(logs)* Make drawer selectable (#3595) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/49885316fc606079fd36f2d19a9e267c0921a662 by Khaliq. Commit message: fix(gorgias): Fix endpoint (#242) by @github-actions[bot]
- *(db)* Parametrize pool size  (#3604) by @bodinsamuel
- *(fleet)* Do not fetch next page if no more nodes (#3606) by @TBonnin

## [v0.54.0] - 2025-02-24

### Added

- *(zod-validation)* Add built in zod validation helper (#3423) by @khaliqgant
- *(integrations)* Add support for airtable pat (#3545) by @hassan254-prog
- *(records)* Use read replicas when possible (#3546) by @bodinsamuel
- *(es)* Add indexed retry object for http logs (#3543) by @bodinsamuel
- *(proxy)* Full rewrite, controlled backoff, better logging, shared logic, etc. (#3540) by @bodinsamuel
- Add categories to Netsuite TBA API (#3552) by @bastienbeurier
- *(guru-scim)* Add missing headers (#3549) by @dannylwe
- *(integrations)* Add support for sage-intacct-oauth-support (#3547) by @hassan254-prog
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/5f29fa5fc99c08095484475335272fad17b98ed9 by Victor Lang'at. Commit message: feat(netsuite-tba): add netsuite actions (#226) by @github-actions[bot]
- *(gorgias-basic)* Add support for gorgias auth (#3554) by @dannylwe
- *(integrations)* Add support for amazon selling partner api (#3538) by @hassan254-prog
- *(integrations)* Add support for appstle-subscriptions (#3559) by @hassan254-prog
- *(sdk)* Add uncontrolledFetch (#3564) by @bodinsamuel

### Changed

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/8a200cf137b88e4ff1cea948b24122548cabbe5c by Hassan_Wari. Commit message: feat(netsuite): update syncs to incremental (#225) by @github-actions[bot]
- *(deps-dev)* Bump vitest from 2.1.8 to 2.1.9 (#3544) by @dependabot[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/9a101f7434dd1ed4a80fb2ccc358db5897fe19bf by Hassan_Wari. Commit message: feat(shopify): orders sync (#227) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/38595e571ef708d7057c2bd674d6cc2cb4967efb by Daniel Roy Lwetabe. Commit message: feat(dropbox): document sync should have modified date (#228) by @github-actions[bot]

### Fixed

- Fix python snippet in webhook verification docs (#3541) by @bastienbeurier
- Fix frontend docs (#3539) by @bastienbeurier
- *(types)* Move proxy to pkg  (#3542) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/3fc19d74a8d80c9241765feb77824c5499d2f795 by Khaliq. Commit message: fix(confluence): confluence type issue (#231) by @github-actions[bot]
- *(basecamp)* Assign accountId if only one (#3555) by @khaliqgant
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/3930f76c4f104c09eb8d696568ab9d00abea8fb7 by Khaliq. Commit message: fix(basecamp): bump versions (#233) by @github-actions[bot]
- *(metadata-stub)* Override metadata if coming from getConnection (#3565) by @khaliqgant

## [v0.53.2] - 2025-02-19

### Added

- *(sdk)* Ignore _nango_metadata field in batchSave, batchUpdate, batchDelete (#3513) by @nalanj
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/120d94fee1f01ecb7dcbfc62d69d5b5093008821 by Khaliq. Commit message: fix(scopes): add more explicit scopes (#216) by @github-actions[bot]
- *(integrations)* Whitelist unzipper package (#3445) by @hassan254-prog
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/430b033a09eaaa10852e517a39513abb4d29454f by Victor Lang'at. Commit message: feat(brightcrowd): add sync  for books and pages (#214) by @github-actions[bot]
- Add guide to document setMergingStrategy (#3426) by @TBonnin
- Introduce sync variant (#3521) by @TBonnin
- *(runner)* GetObjectsById (#3475) by @nalanj
- *(sync variant)* Add sync variant to schedule and nangoProps (#3522) by @TBonnin
- *(docs)* Started on docs for getRecordsById (#3525) by @nalanj
- *(integrations)* Add support for jira data center api key (#3524) by @hassan254-prog
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/63f5660d9ea0daaf0eb172cb45a671730c15616d by Khaliq. Commit message: feat(.nango): add .nango directory (#221) by @github-actions[bot]
- *(pagination)* Add support for dot notation in the body (#3533) by @khaliqgant
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/15f347fc31e313187510eacf64776de1bee25b6a by Victor Lang'at. Commit message: feat(quickbooks): add create bill and create purchase order actions (#223) by @github-actions[bot]
- *(guru-scim)* Add provider support (#3534) by @dannylwe

### Changed

- Add integration counts to webflow sync (#3506) by @nalanj
- Add script to automate changelog generation for providers (#3517) by @nalanj
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/faf3fb9c6a79231c7907524dbe13ca724c99423c by Khaliq. Commit message: feat(google-drive): output the mimeType (#218) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/100844ca03f7615d11f115c743294599a7dcdd6a by Khaliq. Commit message: feat(google-drive): Add root level sync (#219) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/be37b30de5b50a93196ab51de9b369c2727d3031 by Khaliq. Commit message: feat(google-docs): update actions (#220) by @github-actions[bot]
- A patch to fix typographical and grammatical errors (#3527) by @clarencepenz
- *(dd)* Try to change some spampling (#3518) by @bodinsamuel
- Integrations changelog (#3526) by @nalanj
- Update basic auth configuration field names 1 of 3 (#3532) by @viictoo

### Fixed

- *(records)* Wrong nextMerging cursor when last record was not updated (#3499) by @TBonnin
- *(persist)* Filter external ids to remove 0x00 (#3498) by @nalanj
- *(logs)* Ignore irrelevant headers in HTTP message (#3504) by @bodinsamuel
- Set orchestrator and jobs request size limit to 10mb (#3484) by @TBonnin
- *(logs)* Unify HTTP logs and retry (#3503) by @bodinsamuel
- Authenticate memory warning logs from runner to persist (#3507) by @TBonnin
- Wait for 10 successes to consider a runner healthy (#3505) by @TBonnin
- *(sdk)* Lower sample for validation error (#3508) by @bodinsamuel
- *(unauthenticated)* Allow connection config to be created (#3512) by @khaliqgant
- 10 successful reqs to runner /healthy for cloud only (#3510) by @TBonnin
- *(tracing)* Tag usr across the infra (#3511) by @bodinsamuel
- *(webapp)* Log operation tooltips (#3514) by @nalanj
- *(shortcut)* Fix verification link (#3520) by @khaliqgant
- Pause schedules when disabling integration (#3519) by @TBonnin
- *(webapp)* Fix mistake where I mixed up icons (#3523) by @nalanj
- *(rateLimit)* Improve compute strategy (#3516) by @bodinsamuel
- *(logs)* Correctly identify internal logs (#3515) by @bodinsamuel
- *(ui)* Env settings design feedback (#3509) by @bodinsamuel
- *(ui)* Table row hover (#3528) by @bodinsamuel
- *(ui)* Inline script configuration (#3529) by @bodinsamuel
- *(logs)* Missing created_at in sdk logs (#3531) by @bodinsamuel
- *(connectionRefresh)* Force salesforce refresh on error, add metrics (#3530) by @bodinsamuel
- *(dd)* Track webhook with metrics (#3535) by @bodinsamuel
- *(logs)* Ignore more headers in http logs (#3536) by @bodinsamuel

## [v0.53.1] - 2025-02-11

### Added

- *(persist)* Add endpoint to get records (#3463) by @nalanj
- Runner use new image (#3468) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/5ccdb8a0cfc1f9d972bd25aee1dbb4a1efa97dc2 by Andrew Karanja. Commit message: feat(basecamp): added fetch-todolists action (#213) by @github-actions[bot]
- *(server)* Separate auth related webhooks into their own log context (#3427) by @nalanj
- *(persist)* Add support for activityLogId to get records endpoint (#3476) by @nalanj
- *(connection)* Add span on refresh credentials (#3482) by @bodinsamuel
- *(web)* Refine logs display in UI (#3481) by @nalanj
- *(loom-scim)* Provider support (#3488) by @AndrewKaranja
- *(paylocity)* Paylocity support (#3492) by @AndrewKaranja
- *(integrations)* Add support for rippling (#3501) by @hassan254-prog
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/7fa2654b348debd340494149baab849011692b00 by Khaliq. Commit message: feat(recharge): add email (#215) by @github-actions[bot]
- *(integrations)* Add support for salesforce cdp (#3363) by @hassan254-prog
- *(1password-scim)* Support for 1password-scim (#3486) by @AndrewKaranja

### Changed

- New Slack channel to request new APIs (#3477) by @bastienbeurier
- Standardize providers.yaml display names (#3478) by @bastienbeurier
- Document how to show list of integrations in the Connect UI (#3480) by @bastienbeurier
- Document HTTP request retry behavior (#3489) by @bastienbeurier
- *(zapier)* Broken image link (#3495) by @viictoo
- Document re-authorization flow (#3491) by @bastienbeurier
- *(deps-dev)* Bump esbuild from 0.17.19 to 0.25.0 (#3500) by @dependabot[bot]
- Typographical error (#3502) by @clarencepenz

### Fixed

- *(runner-sdk)* Catch void this.log (#3474) by @TBonnin
- *(ui)* Connection create, re-up integration list (#3479) by @bodinsamuel
- Decrypt provider config in refreshConnections (#3485) by @TBonnin
- Fix typographical error (#3487) by @clarencepenz
- *(types)* Connection -> DBConnection (#3470) by @bodinsamuel
- *(connection)* Incorrect connection id (#3497) by @bodinsamuel
- Fix typo in frontend.mdx (#3494) by @spookyuser
- *(docker)* Stop building runner (#3490) by @bodinsamuel
- *(persist)* Correct validation and types (#3483) by @TBonnin
- *(jobs)* Logs track_deletes results (#3493) by @bodinsamuel

## [v0.53.0] - 2025-02-06

### Added

- *(persist)* Enable filtering records by external id (#3458) by @nalanj
- *(sap-concur)* SAP Concur provider support (#3453) by @AndrewKaranja
- *(support)* Add support for Gemini integration (#3336) by @Maina-Francis
- *(api)* Get records by IDs (#3466) by @bodinsamuel

### Changed

- *(fleet)* Simplify node config overrides (#3450) by @TBonnin
- *(fleet)* Remove deployment commit_id column (#3451) by @TBonnin
- *(plain)* Connect ui docs for plain (#3465) by @hassan254-prog
- *(minimax)* Updated minimax provider yaml. (#3464) by @AndrewKaranja
- Node client get records by ids (#3471) by @bodinsamuel

### Fixed

- *(shared)* Keep agents from cloning in simple-oauth2 (#3447) by @nalanj
- *(ui)* Display correct sync type  (#3454) by @bodinsamuel
- *(db)* Sync_type casing (#3456) by @bodinsamuel
- *(shared)* Clean up agent config stuff (#3457) by @nalanj
- *(api)* GET /records new format (#3448) by @bodinsamuel
- *(api)* Get records filter should accept uppercase and combined (#3460) by @bodinsamuel
- *(webhooks)* Remove webhook response body from webhook logging (#3462) by @nalanj
- *(ui)* Correct field when updating webhooks secondary url (#3461) by @bodinsamuel
- *(types)* SyncConfig -> DBSyncConfig (#3459) by @bodinsamuel
- *(integration-template-tests)* Remove output and content length header (#3467) by @khaliqgant
- *(docs)* Warn on docs mismatch, and update providers to remove all warnings (#3469) by @nalanj
- *(npm)* Put types pkg as prod dependency (#3473) by @bodinsamuel
- *(cron)* Automatic refresh token was not passing decrypted connection (#3472) by @bodinsamuel

## [v0.52.5] - 2025-02-05

### Added

- *(ui)* Environment settings revamp (#3432) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/184791e39a290d706aaf92b04042f0bc7feb9d31 by Khaliq. Commit message: fix(recharge): add subscription id (#211) by @github-actions[bot]
- *(docs)* Backfill missing docs due to multiple providers for same API (#3403) by @nalanj
- *(minimax)* Added minimax support (#3364) by @AndrewKaranja
- *(basecamp)* Store basecamp response in the connection config (#3455) by @khaliqgant
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/08cd7cb0ea8fb6a1908fe8b645f67abf27a0af67 by Khaliq. Commit message: feat(basecamp): add action to do a user lookup (#212) by @github-actions[bot]

### Changed

- Cleanup legacy runner management (#3425) by @TBonnin
- Clarify integration steps (#3435) by @bastienbeurier
- Show connect UI gif (#3436) by @bastienbeurier
- Be more explicit about callback URL redirect safeguards (#3439) by @bastienbeurier
- Fleet improvements (#3438) by @TBonnin
- Bump vitest to 2.1.9 (#3449) by @nalanj

### Fixed

- Fleet to fetch all nodes at once (#3429) by @TBonnin
- Deel provider (#3434) by @TBonnin
- *(server)* Log instance id from render instead of random id and catch unhandled (#3433) by @nalanj
- *(tests)* Test forwardWebhook (#3424) by @nalanj
- *(server)* Only log last part of instance id for render (#3437) by @nalanj
- *(server)* Put whitespace in front of instance id, if it's there (#3440) by @nalanj
- *(server)* Override agent toJSON (#3441) by @nalanj
- *(ui)* Env settings should reset on switching env (#3442) by @bodinsamuel
- *(docs)* PauseSync fix (#3443) by @khaliqgant
- Set Slack scope_separator to comma (#3430) by @mpotter
- Always update logo when updating apis in webflow (#3446) by @nalanj
- *(ui)* Feedback env settings page (#3444) by @bodinsamuel
- *(cli)* Fix dryrun bug after shared removal (#3452) by @nalanj

## [v0.52.4] - 2025-02-03

### Added

- *(persist)* Deep merge records in batchUpdate (#3386) by @nalanj
- Add support for merging strategy into the runner sdk (#3420) by @TBonnin
- *(support)* Adds support for xAI Integration (#3345) by @Maina-Francis
- *(integrations)* Added provider support for commercetools (#3347) by @AndrewKaranja
- *(retell-ai)* Added retell ai support (#3365) by @AndrewKaranja
- *(integrations)* Add support for drupal (#3378) by @hassan254-prog

### Changed

- Improve diagrams + add one for auth (#3431) by @bastienbeurier

### Fixed

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/7fec650269eb82e8cf775a7dcb010b715a8a0e06 by nalanj. Commit message: fix: Update basecamp docs to fix mintlify error (#209) by @github-actions[bot]
- *(api)* Better check for json content-type  (#3428) by @bodinsamuel
- *(api)* Req.is is not as reliable as expected by @bodinsamuel
- *(dependencies)* Upgrade frontend dependencies (#3418) by @bodinsamuel

## [v0.52.3] - 2025-01-31

### Added

- *(pagination)* Add flag to optionally add params to body (#3404) by @hassan254-prog
- *(integrations)* Split greenhouse apis into seperate providers (#3331) by @hassan254-prog
- *(integrations)* Add support for grafana (#3422) by @hassan254-prog

### Changed

- Revamp design of older changelog assets (#3416) by @bastienbeurier
- Public key deprecation guide (#3421) by @bastienbeurier

### Fixed

- *(docs)* Fix link for zapier connect (#3414) by @khaliqgant
- *(api)* Enforce content-type when possible (#3410) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/58c8dad986716d17821d17a7b452ea9d28f2d007 by Khaliq. Commit message: fix(optionals): chaining (#208) by @github-actions[bot]
- *(webapp)* Fix code generation for two_step (#3415) by @hassan254-prog

## [v0.52.2] - 2025-01-30

### Fixed

- *(auth)* Reup connectionId check (#3413) by @bodinsamuel
- *(ui)* Properly debounce/abort logs search (#3412) by @bodinsamuel
- Eslint pass (#3406) by @bodinsamuel
- *(cli)* Remove directory requirement in verification service (#3417) by @nalanj

## [v0.52.1] - 2025-01-30

### Added

- *(integrations)* Add support for document360  (#3340) by @miles-kt-inkeep
- *(integration)* Set scope separator for instagram (#3390) by @jape-dev
- *(runner)* Use new SDK (#3297) by @bodinsamuel
- *(calendly)* Add  webhook routing scripts and update latest providers.yaml (#3381) by @viictoo
- Adds documents access requirements and setup guide for Slack integration (#3327) by @Maina-Francis
- *(integrations)* Add support for Twilio (#3393) by @bodinsamuel
- *(integrations)* Add support for Zuora (#3388) by @hassan254-prog
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/02abedc52f79adfeddab977a1aaff45aaaa92fe0 by Khaliq. Commit message: feat(whoami): add whoami endpoint for intercom (#206) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/d5fb82cc3d8f080ac157ac0b783f979358b3ec40 by Khaliq. Commit message: feat(recharge): add next_charge_scheduled_at (#207) by @github-actions[bot]
- Add changelog assets (#3398) by @bastienbeurier
- *(persist)* Add support for merging strategy (#3389) by @TBonnin
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/5f6b7afb40a161e3c7b09bdb17764c0a099744cd by Francis Maina. Commit message: feat(google): adds fetch-documents actions for Google Docs and Google Sheets (#204) by @github-actions[bot]
- *(zapier-scim)* Add integration guide and configuration for Zapier SCIM (#3400) by @viictoo
- *(cli)* Allow init to create any directory name (#3338) by @nalanj

### Changed

- Remove Kapa from docs (#3391) by @bastienbeurier
- Move changelog to Mintlify (#3392) by @bastienbeurier
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/bbb59c9daf078b41c0f6c37dc19f1d2c108ba496 by Victor Lang'at. Commit message: feat(gorgias):  implement gorgias user provisioning using only the necessary User fields and add corresponding tests: (#199) by @github-actions[bot]
- Document simpler way to retrieve connection ID in dev (#3395) by @bastienbeurier
- Default to dark theme (#3396) by @bastienbeurier
- Nango webhook ref (#3394) by @bastienbeurier
- Pagination reference (#3405) by @bastienbeurier
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/f922ae99610d196540aa0790465d507567e22c82 by Andrew Karanja. Commit message: feat(basecamp): todos sync (#205) by @github-actions[bot]
- Compress changelog images + update changelog format (#3408) by @bastienbeurier
- *(logs)* Bump elasticsearch to 8.17.0 (#3399) by @nalanj

### Fixed

- *(jobs)* Wait until runner is reachable before registering (#3397) by @TBonnin
- *(persist)* Fix express.json limit (#3401) by @TBonnin
- *(webhooks)* Regression where body wasn't logged after webhook log enrichment (#3402) by @nalanj
- *(proxy)* Apply query params outside axios (#3361) by @bodinsamuel
- *(cli)* Update dry run to exclude nango prop on output.json files (#3411) by @nalanj
- *(ui)* Change copy for connection create (#3407) by @bodinsamuel
- *(ui)* Copy snippets with secrets (#3409) by @bodinsamuel

## [v0.51.0] - 2025-01-28

### Added

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/ef41e344c36cc7f3252d6e9b10734175d143e9d7 by Hassan_Wari. Commit message: feat(recharge): add upsert and customers sync (#203) by @github-actions[bot]
- *(records)* Add upserting/updating records merging strategy (#3379) by @TBonnin

### Changed

- Improve publish script (#3383) by @bodinsamuel

### Fixed

- Package.json by @bodinsamuel
- *(node-client)* UpdateSyncConnectionFrequency parameters (#3380) by @TBonnin
- *(docs)* Make webflow sync more graceful (#3382) by @nalanj
- *(docs)* Fix provider line parsing in webflow sync. (#3384) by @nalanj
- Fix list connections params in Node SDK (#3372) by @bastienbeurier
- *(tests)* Fix a few flaky tests (#3385) by @nalanj

## [v0.50.0] - 2025-01-28

### Added

- *(server, orchestrator, jobs, runner)* More descriptive action errors (#3279) by @nalanj
- *(integrations)* Add support for prive (#3359) by @hassan254-prog
- *(server)* Log webhooks from syncs separate from the sync (#3312) by @nalanj
- *(server)* Enrich webhook errors (#3319) by @nalanj
- *(cli)* Use runner sdk (#3375) by @bodinsamuel

### Changed

- Update package.json by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/afbb2c9d02de716d997f348d5e514adbc7c91651 by Victor Lang'at. Commit message: feat(quickbooks): Quickbooks CDC for incremental sync (#202) by @github-actions[bot]

### Fixed

- Use netsuite-tba for docs (#3362) by @nalanj
- *(slack)* Fix input/output, env, verbosity (#3368) by @bodinsamuel
- *(jobs)* Fix small bug in wehbook code that never closed log (#3377) by @nalanj

## [v0.49.0] - 2025-01-27

### Changed

- Clarify unification docs (#3367) by @bastienbeurier

### Fixed

- *(npm)* Correct publish command (#3371) by @bodinsamuel

## [v0.48.4] - 2025-01-27

### Added

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/ea5ecf44c4030313fea953267b5d7a10cdbc54c3 by Khaliq. Commit message: feat(linear): add users sync (#196) by @github-actions[bot]
- *(integrations)* Add support for Microsoft business central (#3309) by @hassan254-prog
- Providers package  (#3308) by @bodinsamuel
- *(render)* Add throttling so fleet never reaches render api limit (#3311) by @TBonnin
- *(api)* Track request content length (#3316) by @bodinsamuel
- Package runner-sdk (#3317) by @bodinsamuel
- *(docs)* Connection ui documentation (#3315) by @AndrewKaranja
- *(integrations)* Add support for odoo cc (#3348) by @hassan254-prog
- *(gw)* Gebrüder weiss provider support (#3341) by @AndrewKaranja
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/5b096d2ad50f9b93ddb341b0c25684d0afa948aa by Andrew Karanja. Commit message: feat(notion): added notion create database row action (#195) by @github-actions[bot]
- *(integrations)* Add support for basecamp (#3339) by @hassan254-prog
- *(lucid-scim)* Provider support docs (#3326) by @AndrewKaranja
- *(integrations)* Add support for recharge (#3357) by @hassan254-prog
- *(emarsys)* Add permissions to connect ui page (#3355) by @hassan254-prog
- *(providers)* Use new package (#3322) by @bodinsamuel

### Changed

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/0231344d5821810c541337c541cb4d5098ad6945 by Khaliq. Commit message: feat(quickbooks): Quickbooks more syncs (#197) by @github-actions[bot]
- Move shared/utils/http.ts to utils package (#3321) by @nalanj
- Bring back sample app instructions (#3332) by @bastienbeurier
- Allow console.log in the cli package (#3334) by @nalanj
- *(deps)* Bump undici from 6.12.0 to 6.21.1 (#3342) by @dependabot[bot]
- Rename custom integration builder to custom integrations (#3356) by @bastienbeurier
- *(deps-dev)* Bump vite from 5.4.6 to 5.4.12 (#3369) by @dependabot[bot]

### Fixed

- Publish failed (#3307) by @bodinsamuel
- *(jobs)* Closing logic (#3310) by @TBonnin
- *(jobs)* Try to use a check loop to make that one supervisor test not fail (#3313) by @nalanj
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/1fcbee8c7de13e545e95ba49dd77c50f823de10d by Khaliq. Commit message: fix(google-drive): id should be an object (#198) by @github-actions[bot]
- *(fleet)* Set correct image for noopNodeProvider (#3320) by @TBonnin
- *(fleet)* RUNNING to IDLE is a valid state transition (#3323) by @TBonnin
- *(proxy)* Fix proxy header construction for two_step (#3314) by @hassan254-prog
- *(http)* Use keepAlive and agent (almost) everywhere (#3318) by @bodinsamuel
- *(jobs)* Sync_type validation (#3325) by @bodinsamuel
- *(runner)* Tweak runner idling retry logic (#3324) by @TBonnin
- *(integrations)* Fix emarsys-oauth typo (#3329) by @hassan254-prog
- *(webapp)* Handle null sync_type to stop ui error (#3330) by @nalanj
- *(github-app)* Public links are set in the integration (#3335) by @khaliqgant
- *(ui)* Environment picker arrow placement (#3328) by @bodinsamuel
- *(ui)* Correctly clear cache, prevent renaming integration with active connections (#3333) by @bodinsamuel
- *(fleet)* If no running runner fallback to outdated (#3352) by @TBonnin
- *(fleet)* Wait  (#3349) by @TBonnin
- Delete aws IAM verification (#3353) by @TBonnin
- *(webapp)* Limit json display on connections to 250kb (#3350) by @nalanj
- *(server)* Fix errors on CUSTOM auth integrations (#3346) by @nalanj
- *(connect)* Open oauth popen up for github app oauth (#3344) by @bodinsamuel
- First requests to runner fails when new runner comes online (#3354) by @TBonnin
- *(webapp)* Crash when env switching on teams page (#3360) by @nalanj
- *(docs)* Updates Mailgun connect-ui guide with missing image and improved steps  (#3358) by @Maina-Francis

## [v0.48.3] - 2025-01-15

### Changed

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/d9e724026f9b2d353f889358e8adba6d862576b6 by Andrew Karanja. Commit message: feat(metabase): Implement Metabase user provisioning with create, delete, and list functionality (#184) by @github-actions[bot]

### Fixed

- *(build)* Missing version upgrade and types (#3305) by @bodinsamuel
- *(fleet)* Render error cause is swallowed by the logger  (#3303) by @TBonnin
- *(types)* NangoProps use DBSyncConfig (#3304) by @bodinsamuel
- *(cli)* Fix order of cleaning up headers (#3306) by @nalanj

## [v0.48.2] - 2025-01-14

### Added

- *(docs)* Add lattice connect ui docs (#3197) by @Maina-Francis
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/7ef0f492acada858cfb5bbb6552d79547e0b08b5 by Francis Maina. Commit message: feat(integration): adds user provision for both lattice and lattice-scim (#164) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/0b7c69e5020d6d1df470650c07f7cce17b84f53f by Khaliq. Commit message: feat(xero-general-ledger): add xero general ledger sync (#168) by @github-actions[bot]
- *(stack-trace)* [nan-2433] script execution add stack trace (#3211) by @khaliqgant
- *(integrations)* Add support for SAP successfactors (#3199) by @hassan254-prog
- *(verification)* Adds api verification endpoint priority integrations (#3208) by @Maina-Francis
- *(verification)* Adds verification endpoint to 1st batch of providers (#3216) by @Maina-Francis
- *(docs)* Basic auth configuration field names (#3217) by @dannylwe
- *(docs)* Add verification endpoints (5 of 6) (#3218) by @dannylwe
- *(docs)* Connect ui (#3223) by @dannylwe
- *(integrations)* Add support for BuiltWith (#3220) by @gkhngyk
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/180367b088002d6c8037f914e2bcf2845e49bbc6 by Khaliq. Commit message: fix(linear): add project milestone and mapping logic (#177) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/221856865ce8dbbda7d792d91e0d2b4e030f4fc8 by Khaliq. Commit message: feat(workday): add workday syncs (#178) by @github-actions[bot]
- *(frontend)* Add sourcemaps to frontend package (#3212) by @izakfr
- *(integrations)* Add gong scim support (#3230) by @dannylwe
- *(integrations)* Add support for Scrape.do (#3228) by @gkhngyk
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/b6b69765c5586a896224958b09ab297359babbc7 by Francis Maina. Commit message: feat: adds Smartsheet user provisioning (#179) by @github-actions[bot]
- *(integrations)* Add support for La Growth Machine (#3232) by @gkhngyk
- *(integrations)* Add support for FindyMail (#3233) by @gkhngyk
- *(api)* POST /environments (#3273) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/6892edd2087195670ad8a23c3570337098d339f4 by Daniel Roy Lwetabe. Commit message: feat(gong): add user sync (#182) by @github-actions[bot]
- *(integrations)* Add support for sharepoint online v1 (#3274) by @hassan254-prog
- *(integrations)* Add airtable scim support (#3271) by @viictoo
- *(integrations)* Add support for shopify api key (#3288) by @hassan254-prog
- *(ui)* Create environment UI (#3280) by @bodinsamuel
- Add application_name to fleet db url + db pool max (#3295) by @TBonnin
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/72ee577834f0b8a2e58b928ef78d6898c27d4029 by Victor Lang'at. Commit message: feat(netsuite): add journal-entry sync and mapping functionality (#193) by @github-actions[bot]
- *(integrations-shopify-scim)* Shopify SCIM provider (#3278) by @AndrewKaranja

### Changed

- Polish on-event script docs (#3206) by @bastienbeurier
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/4d5a887fab31f57da73e11754007fbec495a2e6b by Khaliq. Commit message: feat(linear): Add create linear issue action (#166) by @github-actions[bot]
- Broken link (#3207) by @bastienbeurier
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/393f41ce3cec827b3bd5e64ca5d0f21c1f16a2af by Khaliq. Commit message: feat(stripe): Stripe subscriptions sync (#170) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/b677108466794784f6fae162367d6b6d3c2561df by Khaliq. Commit message: feat(whoami): whoami for hubspot and airtable (#173) by @github-actions[bot]
- Reapply reverted prior commit from Docker upgrade (#3229) by @nalanj
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/c07b3945787e86004f3da1ac0f3e187d8402eb50 by Khaliq. Commit message: feat(whoami): Add whoami endpoints (#174) by @github-actions[bot]
- *(connect-ui)* Chorus connect ui docs (#3243) by @hassan254-prog
- *(connect-ui)* Sendgrid connect ui docs (#3244) by @hassan254-prog
- *(connect-ui)* Gainsight-cc connect ui docs (#3245) by @hassan254-prog
- *(connect-ui)* Freshsales connect ui docs (#3249) by @hassan254-prog
- Use singleFork in vitest (#3241) by @nalanj
- Only truncate records table once for those tests (#3239) by @nalanj
- Upgrade vitest (#3238) by @nalanj
- Add option to skip creating an env for account seeder (#3240) by @nalanj
- *(server)* Add application name to db config (#3214) by @nalanj
- Upgrade to typescript 5.7.2 (#3255) by @bodinsamuel
- *(webapp)* Update scrapedo logo to 62x62 (#3257) by @nalanj
- Update koala snippet (#3253) by @nalanj
- Remove sentry (#3259) by @bodinsamuel
- *(connect-ui)* Freshservice connect ui docs (#3254) by @hassan254-prog
- Upgrade eslint (+ plugins) (#3262) by @bodinsamuel
- *(ci)* Re-up docker image build (#3269) by @bodinsamuel
- *(connect-ui)* Guru connect ui docs (#3251) by @hassan254-prog
- Upgrade dependencies (#3267) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/8dbe98d7243d724b03a9ba61c68c5942082a6c4a by Victor Lang'at. Commit message: feat(jira-basic): victor-langat/ext 348 fetch list of teams from jira basic (#187) by @github-actions[bot]
- Fix up handler type (#3282) by @nalanj
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/67ff2090bed55553baa29e7086ef6f4811c2b677 by Victor Lang'at. Commit message: feat(quickbooks): victor-langat/ext 448/quickbooks general ledger sync (#191) by @github-actions[bot]
- Use computed matrix for clients tests (#3289) by @nalanj
- Unit test env fix (#3294) by @nalanj
- Restructure docs (#3301) by @bastienbeurier

### Fixed

- *(docs)* Use logos from github rather than our app (#3209) by @nalanj
- *(docs)* Add ability to run webflow sync by workflow displatch (#3210) by @nalanj
- *(jobs)* Do not exit on unhandledRejection (#3213) by @TBonnin
- Move triggering actions out of transations (#3215) by @TBonnin
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/ca6b1621897f940b5a1fbc5aa884099a5ef928e8 by Khaliq. Commit message: fix(xero): Add xero tests and update group for General Ledger (#169) by @github-actions[bot]
- *(webapp)* [nan-2439] add connection to filter so the page is filtered once the popover is closed (#3221) by @khaliqgant
- *(build)* Bump docker image versions to 20.18 (#3201) by @nalanj
- *(sync-status)* [nan-2207] add connection_id to response (#3224) by @khaliqgant
- *(json-schema)* [nan-1680] parse the json schema to push to the configs table (#3226) by @khaliqgant
- *(active-logs)* [nan-2448] remove active logs for disabled syncs (#3227) by @khaliqgant
- *(datadog-api-key)* [nan-2459] prefix with api (#3250) by @khaliqgant
- *(sync status)* [nan-2141] also only grab enabled syncs (#3222) by @khaliqgant
- *(all)* Fix deprecated tsconfig error (#3234) by @nalanj
- *(server)* Clean up createConnectionSeed signature (#3235) by @nalanj
- *(api)* Unify end user shape (#3246) by @bodinsamuel
- Sync API clarify response, remove operation name in UI (#3247) by @bodinsamuel
- *(insights)* Clarify UTC (#3252) by @bodinsamuel
- *(server)* Handle missing connection id and provider config (#3256) by @nalanj
- *(webapp)* Fix unquoted string for Koala (#3258) by @nalanj
- *(webapp)* Add new koala endpoints to CSP (#3260) by @nalanj
- *(aircall)* Aircall alias doesn't work for nested objects (#3266) by @khaliqgant
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/8603fb34fc5331f014ed83b753782b8c0e2337eb by Khaliq. Commit message: fix(smartsheet): Add scopes (#185) by @github-actions[bot]
- *(ui)* Environment picker v2 (#3261) by @bodinsamuel
- Track_deletes only deletes records from previous jobs (#3268) by @TBonnin
- *(docker)* Fix up docker-compose in root of repo to handle empty vars correctly (#3270) by @nalanj
- *(cors)* Allow sentry headers (#3272) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/5484ff7d906f68df8abe6153c801d5b8ab293c15 by Khaliq. Commit message: fix(smartsheet): small model tweaks (#186) by @github-actions[bot]
- *(webapp)* Remove the need for env (#3275) by @bodinsamuel
- *(server)* Oauth callback crash due to query (#3277) by @nalanj
- *(server)* Roll back ddtrace (#3283) by @nalanj
- *(cli)* Remove deprecated docker compose (#3276) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/045c631624c6cb3c089e1053f8f44bd1a4455886 by Samuel Bodin. Commit message: fix(github): remove demo scripts (#190) by @github-actions[bot]
- *(connect)* Remove overflow on unmount (#3285) by @bodinsamuel
- *(insights)* Syncs were counted multiple times (#3287) by @bodinsamuel
- *(connect)* Safari content disappearing bug  (#3286) by @bodinsamuel
- *(docker)* Stop building staging, prod, enterprise in favor of unified (#3281) by @bodinsamuel
- *(fleet)* Image override might contain the commitId tag (#3292) by @TBonnin
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/f50953a098da66d8fb087267464e571db91d8576 by Victor Lang'at. Commit message: fix(netsuite-tba): handle optional timeZone reference in location sync (#194) by @github-actions[bot]
- *(cli)* Remove header prefix on dry-run (#3298) by @nalanj
- Determine nango yaml version (#3300) by @TBonnin
- Fix log copy when setting frequency on script deployment (#3299) by @TBonnin
- *(types)* Copy SDK types to @types (#3302) by @bodinsamuel

## [v0.48.1] - 2024-12-19

### Added

- *(docs)* Generate pre-built tooling table (#3191) by @nalanj

### Fixed

- *(server)* Fix case of duplicate connectionId with different providers for /connections/:id (#3198) by @nalanj
- *(server)* /connections/:connectionId New Format (#3200) by @nalanj
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/7eda6278e02e663067843ec98b9fd5ee830aa175 by nalanj. Commit message: fix(linkedin): Fix endpoint for linkedin (#167) by @github-actions[bot]
- *(logs)* Correctly truncate logs based on bytes size (#3203) by @TBonnin
- *(environment-id)* EnvironmentId not required for getEnvironmentVariables call (#3204) by @khaliqgant
- *(aircall)* Aircall basic extends aircall (#3202) by @khaliqgant

## [v0.48.0] - 2024-12-18

### Added

- *(cli)* Support saving error responses in dryrun (#3138) by @nalanj
- *(integration)* Back fill missing base url (#3155) by @hassan254-prog
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/652ac8560ed492acc840d5337ef53450aa8b12d6 by Francis Maina. Commit message: feat(integration): adds ramp user-provision integration (#152) by @github-actions[bot]
- *(api)* GET /connection returns end_user (#3169) by @bodinsamuel
- *(api)* GET /connection search in end user (#3170) by @bodinsamuel
- *(fleet)* Add tracing around supervisor plan/execute (#3163) by @TBonnin
- *(docs)* Webflow sync (#3156) by @nalanj
- *(integrations)* Add support for lastpass (#3171) by @hassan254-prog
- *(exact-online)* Add reset headers for exact online (#3185) by @khaliqgant
- *(website)* Add webflow sync action (#3178) by @nalanj
- *(integration)* Adds support for Canva SCIM (#3184) by @Maina-Francis
- *(webhooks)* Enable all types by default (#3189) by @bodinsamuel
- *(integrations)* Update basic auth configuration field names (#3190) by @hassan254-prog
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/f7a51d95fb67185db9bfb016979802196dca9c53 by Hassan_Wari. Commit message: feat(lastpass): add integrations for lastpass (#159) by @github-actions[bot]
- *(integrations)* Add support for emarsys oauth (#3192) by @hassan254-prog

### Changed

- Remove old templates + polish (#3175) by @bastienbeurier
- *(eslint)* Restrict-template-expressions (#3186) by @bodinsamuel
- Api unification (#3188) by @bastienbeurier
- *(ci)* Generate docs dynamically in pre-commit hook (#3183) by @nalanj
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/70080800c8ad09181a643f4f20f85c4e5634dbbe by Khaliq. Commit message: feat(gorgias): [ext-251] gorgias ticket (#162) by @github-actions[bot]

### Fixed

- *(docs)* Update 'Build your own' link in use cases in docs (#3168) by @nalanj
- *(server)* Drastically reduce memory usage in proxy (#3172) by @nalanj
- Fix broken links (#3176) by @khaliqgant
- *(base-url)* Fix lastpass base url (#3181) by @hassan254-prog
- *(docs)* Update lastpass to new doc structure (#3182) by @nalanj
- *(api)* POST /webhook new format (#3179) by @bodinsamuel
- *(config)* Various bug fixes (#3187) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/cfeeae65e2a95eda24c3bf6a8d444a07debe57f9 by Khaliq. Commit message: fix(pagination): rename and update action param (#161) by @github-actions[bot]
- *(docs)* Fix up use case urls (#3194) by @nalanj
- *(ui)* Remove sync ui Learn More link under empty cache (#3195) by @nalanj
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/a4b5439d8a74f2d28a0c63e0958de8838b46de4f by Khaliq. Commit message: fix(notion): tweak yaml (#165) by @github-actions[bot]
- *(integrations)* Fix emarsys wsse auth (#3193) by @hassan254-prog
- *(docs)* Update read-from-an-api.mdx (#3196) by @nalanj
- *(api)* GET /connection/:id new format (#3177) by @bodinsamuel

## [v0.47.1] - 2024-12-13

### Added

- *(ui)* Connection trigger sync, new components (#3145) by @bodinsamuel
- *(fleet)* Add Render NodeProvider (#3149) by @TBonnin
- *(integrations)* Add support for Fortnox (#3136) by @bodinsamuel
- *(fleet)* Add node config overrides (#3158) by @TBonnin
- *(integrations)* Add harvest connect ui docs and a post connection script (#3148) by @hassan254-prog
- *(docs)* New docs format (#3118) by @nalanj
- *(integrations)* Add Atlas API support (#3157) by @omar-inkeep
- *(server)* Add instance identifier when logging in cloud (#3166) by @nalanj

### Changed

- More reconnect details (#3152) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/a575338d191e8abb5e24f7e39d422b028028a649 by nalanj. Commit message: chore: Fix up google drive sync description (#151) by @github-actions[bot]
- *(eslint)* Enforce err name, upgrade eslint plugins (#3153) by @bodinsamuel
- Call /rollout endpoint in deploy github action (#3161) by @TBonnin
- Keep only 10 days of deleted/terminated schedules/tasks (#3167) by @TBonnin

### Fixed

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/eaf81019dc3531323b24e90d21896532dd423a2f by Khaliq. Commit message: fix(dialpad): minor cleanup (#149) by @github-actions[bot]
- Temporarly revert connection id safety (#3154) by @bodinsamuel
- *(endUser)* Make email optional (#3159) by @bodinsamuel
- *(docs)* Fix undefined in endpoint description (#3162) by @nalanj
- *(runner)* Set render PORT (#3165) by @TBonnin
- *(docs)* Fix some edit links (#3164) by @nalanj

## [v0.47.0] - 2024-12-11

### Added

- *(docs)* Add connect-ui docs (#3106) by @hassan254-prog
- *(integrations)* Add rate limting to intercom (#3122) by @hassan254-prog
- *(integrations)* Add support for braze (#3121) by @hassan254-prog
- *(integrations)* Add support for freshteam (#3124) by @hassan254-prog
- *(integrations)* Add support for Zappier (#3126) by @dannylwe
- *(docs)* Add zendesk connect-ui docs (#3127) by @hassan254-prog
- *(docs)* Malwarebytes connect-ui docs (#3131) by @hassan254-prog
- *(docs)* Add quickbooks connect ui docs (#3133) by @hassan254-prog
- Fleet into jobs/server (#3129) by @TBonnin
- *(docs)* Connect UI Documentation  (#3107) by @dannylwe
- Reconnect (#3119) by @bodinsamuel
- *(fleet)* Ensure only one fleet supervisor is running (#3141) by @TBonnin
- *(fleet)* Add /rollout endpoint to server (#3140) by @TBonnin
- *(integrations)* Add support for Gerrit (#3144) by @hassan254-prog
- *(integration)* Add verification and remove port from remote site (#3150) by @khaliqgant
- *(integration)* Add docs and post connection script for adobe umapi (#3147) by @hassan254-prog
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/42248878536c13238318eba3d239d9bd3f942b90 by Francis Maina. Commit message: fix(dialpad): addresses the comments made in the last PR review (#147) by @github-actions[bot]

### Changed

- *(deps)* Bump nanoid from 5.0.7 to 5.0.9 (#3142) by @dependabot[bot]
- Update total APIs count (#3146) by @rguldener
- Authorize and reconnect (#3151) by @bodinsamuel

### Fixed

- *(proxy)* Lowercase incoming headers (#3128) by @bodinsamuel
- *(api)* Move more auth endpoints to new format (#3120) by @bodinsamuel
- Bigquery should be off by default by @bodinsamuel
- *(regex)* Allow special characters (#3130) by @khaliqgant
- *(ui)* Do not identify user on debug mode (#3135) by @bodinsamuel
- *(ui)* Rename add connection  (#3134) by @bodinsamuel
- Copy fleet package in server dockerfile (#3137) by @TBonnin
- Fleet connection to main db by @TBonnin
- Return 400 when /connections/:connetionId missing provider_config_key (#3139) by @nalanj
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/06c35efed384a69115c88a78620d850c7287e6ae by Khaliq. Commit message: fix(linear): fix types (#148) by @github-actions[bot]

## [v0.46.1] - 2024-12-06

### Added

- *(providers-yaml)* Add automated for additional salesforce (#3102) by @khaliqgant
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/5f28b046494e2ddaaa522bcb75bfaf78fe71db22 by Hassan_Wari. Commit message: fix(front): add cursor in request param for pagination (#135) by @github-actions[bot]
- *(connect)* Allow passing oauth_scopes (#3104) by @bodinsamuel
- *(ui)* New create connection page (#3072) by @bodinsamuel
- *(integrations)* Add API rate limiting to Front (#3101) by @hassan254-prog
- *(sdk)* Add getIntegration (#3112) by @bodinsamuel
- *(integrations)* Add support for eBay (#3099) by @cassanelligiovanni
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/17524b41a6acfe231713f26144048818893bdd87 by Khaliq. Commit message: fix(xero): add tenant id logic (#138) by @github-actions[bot]
- *(scopes)* [nan-2284] Add a few more default scopes (#3117) by @khaliqgant
- Introducing the fleet package (#3105) by @TBonnin
- *(fleet)* Add control loop and state management (#3116) by @TBonnin
- *(cli)* Take request headers, params, and body into account when saving responses (#3098) by @nalanj

### Changed

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/ef8abf3a9f6bd5c1e1afab8dc384036c66566713 by Daniel Roy Lwetabe. Commit message: feat(pennylane): Make penny lane syncs and actions into public templates (#127) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/06bf1271d4b2d7d4226f69a78d0883c51ae7f6f0 by Khaliq. Commit message: feat(avalara): Add avalara syncs and actions (#133) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/5fcc1c01fea5ae1d5dccc813b531e23d01eca301 by nalanj. Commit message: feat(zoom): Add support for recordings (#128) by @github-actions[bot]
- Fix Google drive docs (#3123) by @rguldener

### Fixed

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/cd7fcfb034ccb38b450c3c0b235a01c650bc2585 by Khaliq. Commit message: fix(lever-ashby) yaml cleanup (#131) by @github-actions[bot]
- *(server)* Load errorLog regardless of credential refresh result (#3103) by @nalanj
- *(proxy)* Handle more content-disposition edge cases (#3100) by @hassan254-prog
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/fe1184f19c3f580a309f7135699adf788e76695a by Khaliq. Commit message: fix(lever): more cleanup of endpoints (#134) by @github-actions[bot]
- *(providers)* Improve validation for connect (#3109) by @bodinsamuel
- *(providers)* Enforce lowercase headers, enforce categories by @bodinsamuel
- *(providers)* Greenhouse api domain wording (#3111) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/8216083d27fa01d8af5b65a008f8a7375cb6f702 by Khaliq. Commit message: fix(lever): fix typo (#137) by @github-actions[bot]
- *(logos)* Add white background on white logo, add better version when possible (#3114) by @bodinsamuel
- *(connect)* Enforce allowedIntegrations and connectionConfig (#3113) by @bodinsamuel
- *(linear-retries)* [nan-2309] handle linear case (#3108) by @khaliqgant
- *(providers)* Enforce lowercase headers, enforce categories (#3110) by @bodinsamuel
- *(tests)* Fix broken integration test that never fails in CI (#3115) by @nalanj
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/0ac7606862b0d3540c6ae408a5061acf0f76d821 by Khaliq. Commit message: fix(xero): bump versions (#139) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/7d5d23cbb387b51cbc17c351c8203492e8a731a2 by Khaliq. Commit message: fix(xero): clean up scopes (#140) by @github-actions[bot]

## [v0.46.0] - 2024-12-03

### Added

- *(server)* Backfill missing_fields on _nango_config (#3050) by @nalanj
- *(webapp)* Show integration issues in their settings (#3044) by @nalanj
- *(api)* Expose credentials in GET /integrations/:uniqueKey (#3074) by @bodinsamuel
- *(integrations)* Add copper integration (#3071) by @dannylwe
- *(ui)* Add Koala (#3090) by @bodinsamuel
- Adds personio_v2 provider (#3089) by @tonibardina
- *(sdk)* Automatically log http calls to API (#3081) by @bodinsamuel

### Changed

- Verify webhook signature helper (#3078) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/c816bbeb786860540d064796ec6f94319da1b5dc by Hassan_Wari. Commit message: feat(zendesk): improve zendesk tickets sync (#120) by @github-actions[bot]
- Change sample app port (#3079) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/339a89eeb81fc23139213c018b30e420d2b595af by Daniel Roy Lwetabe. Commit message: feat(lever): lever and ashby actions  (#119) by @github-actions[bot]
- Improvements to What is Nango page (#3085) by @bastienbeurier
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/a20d56a2f00b286eb18572566b9c5a51424cd681 by Khaliq. Commit message: feat(gh-app): GitHub app sync (#130) by @github-actions[bot]
- Split CLI/Node tests  (#3096) by @bodinsamuel

### Fixed

- *(cli)* Show on-events scripts in nango deploy output (#3067) by @TBonnin
- *(webapp)* Invalidate cache on deleting integrations and adding connection from integration page (#3068) by @nalanj
- *(server)* Actually only update fields that are missing data (#3073) by @nalanj
- *(CLI)* Show on-events scripts in `nango deploy` confirmation message (#3069) by @TBonnin
- Do not wait for on-event script to finish when triggering them (#3075) by @TBonnin
- *(integrations)* Configure Discourse rate limit header (#3077) by @bodinsamuel
- *(integration)* Update ashby providers.yaml (#3082) by @dannylwe
- *(integration)* Update docusign docs (#3084) by @dannylwe
- *(jobs)* Move runner flags outside shared (#3083) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/8b5866773a768bedf6ce23a7e99a9fc5d8cf3bc4 by Daniel Roy Lwetabe. Commit message: fix(ashby): update nango.yaml (#129) by @github-actions[bot]
- *(getting-started)* Revert to top of menu (#3087) by @bodinsamuel
- *(ui)* Prevent renaming integration with active connections by @bodinsamuel
- *(deploy)* Description was missing after upgrade (#3091) by @bodinsamuel
- *(providers)* Change greenhouse api key validation (#3095) by @bodinsamuel
- *(ui)* Prevent renaming integration with active connections (#3092) by @bodinsamuel
- *(api)* Improve user model usage (#3076) by @bodinsamuel
- *(providers)* Allow fields to be marked as automated (#3094) by @bodinsamuel
- *(sdk)* Expose getIntegration() (#3080) by @bodinsamuel
- *(data-ingestion)* Log end user (#3086) by @bodinsamuel

## [v0.45.1] - 2024-11-27

### Added

- Trigger pre connection deletion script on connection deletion (#3027) by @TBonnin
- *(webapp)* Surface all connection error counts (#3026) by @nalanj
- Add docs for on-events scripts (#3047) by @TBonnin
- *(integrations)* Add support for Tapclicks (#3052) by @hassan254-prog
- *(server)* Add missing fields column for integrations to db (#3045) by @nalanj
- *(ui)* Add missing page titles (#3066) by @bodinsamuel
- *(webhooks)* Send end user on connection creation (#3065) by @bodinsamuel

### Changed

- Clean up errors (#3024) by @bodinsamuel
- Update pull_request_template (#3033) by @TBonnin
- Fix docs redirects (#3055) by @bastienbeurier
- Improve Salesforce API docs (#3058) by @rguldener
- Improve authorization guide (#3064) by @bastienbeurier

### Fixed

- *(getting-started)* Feedback (#3023) by @bodinsamuel
- *(docs)* Plain update (#3029) by @khaliqgant
- *(connect-ui)* Handle two_step, and various (#3030) by @bodinsamuel
- *(connectionConfig)* Ensure user's connectionConfig takes precedence (#3031) by @hassan254-prog
- *(logs)* Correctly logs request headers, redac headers and url, log verification (#3022) by @bodinsamuel
- *(connect-ui)* Enforce session token integrations (#3032) by @bodinsamuel
- *(server)* Update query for counting errors to ensure distinct connections (#3034) by @nalanj
- *(webapp)* Layout bug on app integration settings page (#3038) by @nalanj
- *(jobs)* Execute close only once (#3036) by @TBonnin
- *(connect)* Improve greenhouse support (#3039) by @bodinsamuel
- AcquireTimeoutMillis to equal statement timeout (#3043) by @TBonnin
- Db pool acquireTimeoutMillis cannot be zero (#3046) by @TBonnin
- *(webapp)* Show separate icons for connection error types (#3040) by @nalanj
- *(ui)* Improve endpoints ordering (#3041) by @bodinsamuel
- *(docs)* Docs cleanup (#3051) by @khaliqgant
- *(docs)* Link fixes (#3053) by @khaliqgant
- Not using setInterval for otlp export config refresh (#3056) by @TBonnin
- *(server)* Remove secrets from in app integration api response (#3048) by @nalanj
- *(webapp, server)* Fix custom auth issues (#3042) by @nalanj
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/f3ce0b10745b4b814759f7ff77d7f7fb05e8b043 by Khaliq. Commit message: fix(docusign): fix username (#122) by @github-actions[bot]
- Improve on-events script logs (#3049) by @TBonnin
- *(runner)* Remove setInterval from providers reload (#3057) by @nalanj
- *(docs)* Fix some typos in docs (#3059) by @nalanj
- *(webapp)* Missing delete button (#3061) by @hassan254-prog
- *(runner)* Always truncate errors (#3063) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/d718b188f9d3e40f2dd1ec269ac9a0de4ec40e09 by Hassan_Wari. Commit message: fix(salesforce): remove last_name as it might not be configured on all salesforce accounts (#124) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/6d5d24dd5d972ba7b3653cdbf0f73f89b484b56e by Khaliq. Commit message: fix(sym-links): Add support for symlinked nango.yaml so it stays in sync (#121) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/0b4c7696fc1a009c3a3f921639efb80af00bd09f by Khaliq. Commit message: fix(aliases): Fix upload alias (#125) by @github-actions[bot]
- *(authorization)* Authorization url encoding (#3062) by @hassan254-prog
- Missing .js extension (#3070) by @bodinsamuel

## [v0.45.0] - 2024-11-21

### Added

- *(script)* Script for rolling out env vars to render runners (#2984) by @nalanj
- *(jobs)* Pass PROVIDERS_URL and PROVIDERS_RELOAD_INTERVAL to runners (#2983) by @nalanj
- *(runner)* Add monitorProviders support for runners (#2989) by @nalanj
- Rename post-connection-scripts table to on-event-scripts  (#2990) by @TBonnin
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/e63a06160ea95e05aa76a26e3de4010a397553f4 by Hassan_Wari. Commit message: feat(gorgias): add list tickets sync (#109) by @github-actions[bot]
- *(integration)* Support pulling workable subdomain through post-connection hook (#2991) by @nalanj
- *(integrations)* Add support for beehiiv (#3007) by @hassan254-prog
- *(integrations)* Add support for grain (#3017) by @hassan254-prog
- Getting started (#3001) by @bodinsamuel
- *(integration)* Add support for sage intacct xml (#3014) by @hassan254-prog
- *(integrations)* Add support for Brevo API key (#3015) by @giocass-audiencerate
- *(integrations)* Add support for Unipile  (#2998) by @gkhngyk
- *(server)* Add sync errors to connection count (#3025) by @nalanj
- Add support for on-events syntax in nango.yaml (#3021) by @TBonnin
- *(integrations)* Add Plain API support (#3028) by @omar-inkeep

### Changed

- Connect UI (#2974) by @dannylwe
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/b6e62a32a5aae45e91a54645f4b18e2d74cb7122 by Samuel Bodin. Commit message: feat: migrate to new endpoints format (#108) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/27577d6b54d26c717a549b573bd4eea51c61b0fe by Khaliq. Commit message: feat(group): Backfill Groups (#111) by @github-actions[bot]
- *(deps)* Bump cross-spawn from 7.0.3 to 7.0.5 (#3000) by @dependabot[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/95ceb42e9e07b1ece34cee6902e57a97c4573440 by Daniel Roy Lwetabe. Commit message: feat(linkedIn): LinkedIn post video action in public template (#104) by @github-actions[bot]
- *(orchestrator)* Rename PostConnectionTask to OnEventTask (#2997) by @TBonnin
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/8977157b985eaa7a68dab99e32e2cf3bd96e6468 by Daniel Roy Lwetabe. Commit message: feat(front): List conversation messages (#113) by @github-actions[bot]

### Fixed

- *(scripts)* Add more resilient rate limit handling in runner-update-env (#2988) by @nalanj
- Deprecate publicKey and HMAC (#2980) by @bodinsamuel
- *(flows)* Fix CI, remove old parsing (#2992) by @bodinsamuel
- Post-connection-script (#2993) by @TBonnin
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/290a958b0a5c24502cd35359d60ab0eb0cdc1ec3 by Khaliq. Commit message: fix(outlook): fix sender property (#112) by @github-actions[bot]
- *(flows)* Correct deduplication (#2994) by @bodinsamuel
- *(hosted)* Build connect-ui before copying (#2987) by @bodinsamuel
- *(quickbooks)* Prompt user for a realmId connection config parameter (#2999) by @hassan254-prog
- *(docs)* Fix urls for jira-basic docs (#3002) by @khaliqgant
- *(docs)* [nan-2174] update credentials to have better fields (#3003) by @khaliqgant
- *(auth)* Incorrect validation (#3004) by @bodinsamuel
- *(auth)* Remove more strict (#3009) by @bodinsamuel
- *(runner)* Do not exit the runner process when a sync is cancelled (#3008) by @TBonnin
- *(hmac)* Only handle hmac when using public_key (#3011) by @bodinsamuel
- *(webapp)* Make sure integrations list is in sync with connections (#3006) by @nalanj
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/99abe7cc4d972075cf301418b04075c39bf4c343 by Khaliq. Commit message: fix(groups): backfill quickbooks sandbox (#114) by @github-actions[bot]
- *(webapp)* Only allow one error filter at a time (#3013) by @nalanj
- *(webapp)* Clear any cache from swr/infinite (#3005) by @nalanj
- *(webapp)* Handle empty state for webhook settings coming over the wire (#3010) by @nalanj
- *(docs)* [nan-2174] update images and docs link (#3016) by @khaliqgant
- *(webapp)* Fix filterWithError default value (#3018) by @nalanj
- *(models)* Move User to DBUser (#3020) by @bodinsamuel
- *(cli)* Remove more from shared (#3019) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/f7040563aff78ab1b9978e9af8b9f7e5b13fe28f by Khaliq. Commit message: fix(groups): fix spelling error (#116) by @github-actions[bot]
- *(server)* Update query to paginate correctly against filter (#3012) by @nalanj

## [v0.44.0] - 2024-11-14

### Added

- *(authmode)* Add a new signature authmode (#2942) by @hassan254-prog
- *(integrations)* Add support for emarsys core api (#2944) by @hassan254-prog
- *(integrations)* Add support for brightcrowd (#2962) by @hassan254-prog
- *(api)* Expose providers.yaml through server (#2978) by @nalanj
- *(endpoints)* Store and use "group“ (#2966) by @bodinsamuel

### Changed

- Otlp export (#2977) by @TBonnin

### Fixed

- Lint PR github action is optional on merge queue by @TBonnin
- *(integrations)* Missing base_url for mindbody (#2981) by @bodinsamuel
- *(providers)* Fix whatsapp apiKey regex (#2982) by @hassan254-prog
- *(deploy runner)* For doesn't split json lines properly (#2985) by @TBonnin

## [v0.43.0] - 2024-11-13

### Added

- *(proxy)* Fix TikTok Ads access_token header for proxy requests (#2933) by @hassan254-prog
- Add merge_group trigger event to github action workflow by @TBonnin
- *(okta)* [nan-2124] add okta preview (#2960) by @khaliqgant
- *(okta)* Add the okta pagination configuration (#2965) by @dannylwe
- Hosea/ext 192 add twenty crm support (#2946) by @mungaihosea
- *(integrations)* Add support for mindbody fitness (#2968) by @davidosemwegie
- *(integrations)* Add connection docs (aircall-basic) (#2954) by @dannylwe
- *(xero)* Add retry header for xero (#2969) by @khaliqgant
- Show records count on connections page (#2936) by @TBonnin
- Return records count in /sync/status endpoint/sdk (#2961) by @TBonnin
- *(nango-yaml)* Support new endpoint format (#2958) by @bodinsamuel

### Changed

- Add demo video to docs and readme (#2950) by @bastienbeurier
- Deploy jobs fix (#2959) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/a79b05ad0e63ff1b7ca777752349b283a43c775a by Khaliq. Commit message: feat(okta): [nan-2124] add in okta preview (#101) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/fa19354f28f545728f578b76dea02c7e53f0721a by Daniel Roy Lwetabe. Commit message: feat(freshdesk): Update freshdesk endpoint for conversations (#100) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/436500ee9f2ed83abdf6f0233f01803e9dc074e1 by Mungai Hosea. Commit message: feat: Hosea/ext 213 dropbox file sync (#99) by @github-actions[bot]

### Fixed

- *(server)* Expose env to configure mailgun url (#2953) by @bodinsamuel
- *(webhooks)* Fix graph in homepage, correctly handle errors (#2947) by @bodinsamuel
- *(connection)* Reintroduce copy connectionId in the UI (#2956) by @bodinsamuel
- *(deploy)* Missing hash for jobs (#2963) by @bodinsamuel
- *(pagination)* Offset type casting (#2964) by @bodinsamuel
- *(package)* Pin more internal package (#2955) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/8f74f8f2e07ddd4119bf4aa170d3d712fc2579e5 by Khaliq. Commit message: fix(harvest): incremental sync for harvest users (#105) by @github-actions[bot]
- *(connect)* Explicit optional fields (#2967) by @bodinsamuel
- *(documentation)* Documentation fixes - images and ordering (#2973) by @khaliqgant
- *(connect)* Bad regex for hostname, add prefix when hostname, improve marketo validation (#2970) by @bodinsamuel
- Upsert summary race condition (#2952) by @TBonnin
- Service ID for connect-UI staging (#2975) by @TBonnin
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/1d44fff629df827b42302a532cc69864319f350a by Khaliq. Commit message: fix(intercom): update syncs and actions (#106) by @github-actions[bot]
- *(cli)* Clean up some references to shared and unused code (#2976) by @bodinsamuel
- *(connect)* Support oauth2_cc, fix password, improve bamboohr/jira display (#2979) by @bodinsamuel

## [v0.42.22] - 2024-11-06

### Added

- *(runner)* Add graceful shutdown and error handling (#2949) by @TBonnin
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/3277a8297b79ac511c738970f78099bfe711b555 by Hassan_Wari. Commit message: feat(aws-iam): add user operations (#89) by @github-actions[bot]

### Changed

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/4dea5183161008e6aec39b430104e71a6037e0e3 by Daniel Roy Lwetabe. Commit message: feat(okta): list all users (#98) by @github-actions[bot]

### Fixed

- *(cli)* Migrate-to-directories parsing issue (#2948) by @bodinsamuel
- *(jobs)* Use new docker image (#2945) by @bodinsamuel
- *(cli)* Pin all internal packages (#2951) by @bodinsamuel

## [v0.42.21] - 2024-11-06

### Added

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/903441952b0a7f47d21a7b0b39a6f7e34f71a6b5 by Andres Reales. Commit message: feat(harvest): add Harvest integration (#71) by @github-actions[bot]
- Add migration for otlp settings (#2891) by @TBonnin
- *(integrations)* Add support for keeper (#2893) by @hassan254-prog
- *(aircall-basic)* [nan-1963] add aircall basic auth provider (#2907) by @khaliqgant
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/9ffe0c90d2fec727b25a4c52985765a033fc3b40 by Khaliq. Commit message: feat(aircall): add user operations (#77) by @github-actions[bot]
- *(integrations)* Add support for google analytics (#2906) by @hassan254-prog
- *(integrations)* Add support for booking.com (#2904) by @hassan254-prog
- *(integrations)* Add support for adyen (#2902) by @hassan254-prog
- Add OpenTelemetry export (#2892) by @TBonnin
- *(connect)* Allow optional params, cosmetic fixes (#2909) by @bodinsamuel
- *(integrations)* Add support for databricks (#2895) by @hassan254-prog
- *(miro-scim)* Add miro scim (#2911) by @khaliqgant
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/27a700a6ba830b5a619d409c6d7b5bd06ebb4bf6 by Andres Reales. Commit message: feat(ring-central): add RingCentral users integration  (#78) by @github-actions[bot]
- *(integrations)* Add support for Dixa (#2899) by @hassan254-prog
- *(integrations)* Add support for chattermill (#2900) by @hassan254-prog
- *(integrations)* Add support for whatsapp business (#2903) by @hassan254-prog
- *(integrations)* Add TwoStep as a new auth_mode for Perimeter 81 (#2868) by @hassan254-prog
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/084831131c9bd9d7445632c384e9c6d22e36a1d7 by Hassan_Wari. Commit message: feat(salesforce): add salesforce integrations (#75) by @github-actions[bot]
- *(ui)* List connections refactor, show end user profile (#2897) by @bodinsamuel
- *(integrations)* Add retry header (#2917) by @khaliqgant
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/aaef56b31798bd0e97d4f3ec94ba7a669b3b1de3 by Khaliq. Commit message: fix(g-drive): add includeAllDrives query param (#87) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/deff79d1fe635fb13dec55623f6f054892011f8c by Hassan_Wari. Commit message: feat(integrations): add zendesk search action  (#86) by @github-actions[bot]
- *(trello-scim)* Add trello scim (#2926) by @khaliqgant
- Add support for record count (#2874) by @mbiddle153
- *(webapp)* Syncs Table UI (#2916) by @nalanj
- *(ui)* Display organization logo automatically (#2930) by @bodinsamuel
- Add settings for OpenTelemetry export (#2922) by @TBonnin
- *(asana-scim)* Asana scim provider (#2943) by @khaliqgant
- *(integrations)* Add support for aws-iam (#2929) by @hassan254-prog
- *(nango-yaml)* Endpoint explicit definition (#2940) by @bodinsamuel

### Changed

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/cfa56973dcc1a0c044e9e7ce5a6f50bd2012ae4f by Khaliq. Commit message: feat(expensify): expensify User operations (#79) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/a467a360bbf6191d328b10c5c8de1f7dad030f8f by Andres Reales. Commit message: feat(keeper): Add Keeper users integration (#80) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/5d68ba94b591071831e9fc4906ec0a0fa38954fb by Andres Reales. Commit message: feat(perimeter81): Add users endpoints to Perimeter81 integration (#81) by @github-actions[bot]
- Clean up packages (#2932) by @bodinsamuel
- *(server)* Slack integration to v2 (#2939) by @bodinsamuel

### Fixed

- *(db)* Drop NANGO_DB_MIGRATION_FOLDER (#2901) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/12c02183dd7f15df28464168342ec79aac9193bc by Khaliq. Commit message: fix(outlook): version bump (#76) by @github-actions[bot]
- *(expensify)* Update expensify proxy settings (#2908) by @khaliqgant
- *(integrations)* Fix auth-mode for chorus (#2915) by @hassan254-prog
- *(connect)* Document connect ui, add apiURL param (#2912) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/676a094e2a593765a84a5a2e142e3e6dbb37406c by Khaliq. Commit message: fix(xero): Fix xero endpoints & tweak precommit script to generate tests (#82) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/aa73bd21fca513021b1a5af3115bc8dac566a053 by Khaliq. Commit message: fix(salesforce): update endpoints and bump versions (#83) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/93f717de010fec4d5ba2ced563d393051c090e30 by Khaliq. Commit message: fix(drive): supportsAllDrives option (#85) by @github-actions[bot]
- *(api)* Reup search in /connections (#2921) by @bodinsamuel
- *(api)* Reup previous behavior of connectionId for GET /connection (#2923) by @bodinsamuel
- Openapi spec bad merge add CI (#2927) by @bodinsamuel
- *(ui)* Various improvments (#2928) by @bodinsamuel
- *(webapp)* Split privateKey for ghost-admin (#2913) by @hassan254-prog
- *(ui)* Connection Show refactor (#2918) by @bodinsamuel
- *(records)* Fix id comparison check in update (#2924) by @nalanj
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/03428dc4ac5fc2a16d8e631d592c1329a3a0dd56 by Hassan_Wari. Commit message: fix(zendesk): fix zendesk search ticket integration (#93) by @github-actions[bot]
- Records update webhook should be sent when coming from webhook exec (#2934) by @TBonnin
- BatchUpdate fails with query is empty if no records (#2937) by @TBonnin
- *(records)* Update records count when marking records as deleted (#2935) by @TBonnin
- *(connection page)* Tooltips and trigger menu action (#2938) by @TBonnin
- *(node-client)* Update listConnections (#2931) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/51404c068bbcaf8a9c046b66f1f833403a0c473a by Mungai Hosea. Commit message: fix: Hosea/ext 211 clean up salesforce templates (#94) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/da9bf55feee952bf70945ea87327d43f4848ffaf by Khaliq. Commit message: fix(gmail-body): update body could be empty (#95) by @github-actions[bot]
- Records update bugs and inefficiency (#2941) by @TBonnin
- *(connect)* Serve in docker image (#2914) by @bodinsamuel

## [v0.42.20] - 2024-10-25

### Added

- *(integrations)* Add support for dialpad sandbox (#2885) by @StephenCole19
- *(validations)* Add provider name and remove credentials and connection_config from interpolation checks (#2894) by @hassan254-prog
- *(integrations)* Add support for elevio (#2896) by @hassan254-prog
- *(integrations)* Add support for apaleo (#2898) by @hassan254-prog

### Changed

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/5c830a77dc088a6bfa7b600caa59de7380c004c3 by Khaliq. Commit message: feat(datadog): datadog user operations (#72) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/bbc2526b09b3d55e1dfc9bba7cce78a13349e670 by Khaliq. Commit message: feat(sharepoint-improvements): Sharepoint improvements (#73) by @github-actions[bot]

### Fixed

- *(pagination)* Handle number cursor (#2886) by @bodinsamuel
- *(flows)* Endpoint deduplication conflict (#2887) by @bodinsamuel
- Use DD_SITE env var instead of hardcoded value (#2888) by @TBonnin

## [v0.42.19] - 2024-10-25

### Added

- *(integrations)* Platform changes to add JWT as an auth_mode (#2840) by @hassan254-prog
- *(integration)* Add support for ghost APIs (#2841) by @hassan254-prog
- *(integrations)* Add support for bill (#2852) by @hassan254-prog
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/1be625c44e798c684362708d6fe6b7d34fed122f by Andres Reales. Commit message: feat(freshdesk): add Freshdesk users integration (#63) by @github-actions[bot]
- *(connection)* Add deleted_at to the upsert functions (#2864) by @hassan254-prog
- Basic/apikey credentials check cron job (#2862) by @TBonnin
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/f9b5a6da1b1cb7a095d79f8c9bf62cee32199974 by Hassan_Wari. Commit message: feat(integrations): add bill integrations (#62) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/7d7b6097fe5798bc3d64c4e6c0bb796e5a553c65 by Andres Reales. Commit message: feat(Intercom): add users syncs and actions to intercom integration (#64) by @github-actions[bot]
- *(providers)* Add proxy fields to okta (#2867) by @hassan254-prog
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/620bbfd8754dc6b242f0d2d0e0e4cda7fcbfbd69 by Hassan_Wari. Commit message: feat(integrations): add okta integrations (#65) by @github-actions[bot]
- *(ui)* Add missing script name, webhook secret update (#2865) by @bodinsamuel
- *(integrations)* Add support for sedna (#2869) by @hassan254-prog
- *(docs)* Add code snippet to ghost-admin (#2871) by @hassan254-prog
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/2b5aa3d6f42d91a6ad4f5b56dbdc7849ac3c764c by Hassan_Wari. Commit message: feat(integrations): add front integrations (#67) by @github-actions[bot]
- *(integrations)* Add support for ragie.ai (#2876) by @Marfuen
- *(webhooks)* [nan-1909] add in webhook support for airtable (#2875) by @khaliqgant
- *(integrations)* Add support for malwarebytes (#2877) by @hassan254-prog
- *(integrations)* Add support for datadog (#2879) by @hassan254-prog
- *(notion-scim)* Support notion SCIM (#2880) by @khaliqgant
- *(connections)* Add FK to end users (#2883) by @bodinsamuel
- *(connections)* Link to end_user on success (#2884) by @bodinsamuel
- *(malwarebytes)* Add malwarebytes required header (#2889) by @khaliqgant

### Changed

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/6f59edcc16a7268cee5a5d7f2857f869c9e69a38 by Khaliq. Commit message: feat(intercom): [nan-1916] add fetch article action (#60) by @github-actions[bot]
- RefreshTokens cron to use redis based locking  (#2859) by @TBonnin
- Connect UI (#2863) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/5d31fe1ef6ef48f48e36cbe6351a9dabd7c6482e by Khaliq. Commit message: feat(airtable): [nan-1909] add airtable operations (#68) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/ad5ab482e8d9386cc9058122f01b43298f2707fc by Khaliq. Commit message: feat(dropbox): Add Dropbox operations (#69) by @github-actions[bot]
- Typo in node client (#2873) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/a6f831c553f66b659b6334819e6817915c6c6bbd by Khaliq. Commit message: feat(hubspot): [nan-1888] [nan-1900] Hubspot products sync and create-property (#70) by @github-actions[bot]
- Typo in nango.yaml (#2881) by @bodinsamuel

### Fixed

- *(response-saver)* Concat paginated responses (#2857) by @khaliqgant
- *(connect-ui)* Skip integrations list when only one integration is allowed (#2837) by @bodinsamuel
- *(bill.com)* Remove version to be able to put in the script (#2860) by @khaliqgant
- Lock can be released even when not holding the lock (#2858) by @TBonnin
- *(ui)* Allow to dismiss slack banner (#2866) by @bodinsamuel
- *(connection)* GetConnectionCredentials should return credentials even on error (#2870) by @bodinsamuel
- *(api)* Rename internal api connection->connections (#2872) by @bodinsamuel
- *(ui)* Integration rename, env switch when showing one integration (#2878) by @bodinsamuel
- *(dockerfile)* Do not clean up source (#2882) by @bodinsamuel
- *(pagination)* [nan-1958] per page offset pagination (#2890) by @khaliqgant

## [v0.42.18] - 2024-10-18

### Added

- *(integrations)* Add support for umapi (#2853) by @hassan254-prog
- *(post-connection-scripts)* [nan-1901] add post connection scripts (#2856) by @khaliqgant
- Expose auth or sync errors when listing connections (#2851) by @TBonnin
- *(integration)* Add support for Apollo Oauth2 (#2847) by @hassan254-prog

### Changed

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/691f12804cae6449d6fec49c40b2a2705edc7647 by Andres Reales. Commit message: feat(docuSign): Add DocuSign and DocuSign-sandbox integration  (#52) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/37aab8f51b3c8f1cd5be1a99783385c494198533 by Khaliq. Commit message: feat(gusto): gusto user operations (#58) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/614f8ff85ebda5d79d3b46258834ba1ddbbe74d1 by Andres Reales. Commit message: feat(calendly): Add users syncs/actions (#57) by @github-actions[bot]

### Fixed

- *(adobe)* Rename umapi to adobe-umapi (#2854) by @khaliqgant
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/64d32bcb4d688a18ddf3976d76e6a8f5b5e2d613 by Khaliq. Commit message: fix(gusto): update description (#59) by @github-actions[bot]

## [v0.42.17] - 2024-10-17

### Added

- *(providers)* Add new token_url_encode parameter to provider config (#2815) by @gorets
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/d58a3a8ddcca05919b61f1a93ddff8dff7c4803e by Hassan_Wari. Commit message: feat(integrations): add outlook templates (#43) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/5e788a0cb163980fa15d239d306c865c19ae8406 by Khaliq. Commit message: fix(notion-db-action): add id of the row in the output (#47) by @github-actions[bot]
- *(integrations)* Add support for firefish (#2836) by @hilmia
- *(integrations)* Add support for workable oauth2 (#2842) by @hassan254-prog
- *(integrations)* Add support for thrivecart (#2843) by @hassan254-prog
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/e0a44f04ac2fa39a2f605d8acb1ae8e940c18e7e by Khaliq. Commit message: feat(notion): add notion database sync (#48) by @github-actions[bot]
- *(pagination)* [nan-1899] zoom operations (#2845) by @khaliqgant
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/d4501e484fa441152048d902b3bbee3e34d4ed56 by Hassan_Wari. Commit message: feat(hubspot): add hubspot integrations (#49) by @github-actions[bot]
- *(integrations)* Add support for loops.so (#2848) by @hassan254-prog

### Changed

- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/25f6f1940c36d54d9815902699f90062ab84c787 by Khaliq. Commit message: feat(hubspot): [nan-1848] additional hubspot syncs (#42) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/2d397758ee31a2ae39a0b29b268fa1e20048c37e by Khaliq. Commit message: feat(hubspot): [nan-1848] hubspot actions (#44) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/d854c2ebb84691dddde1a0f567b1081825ec9f90 by Khaliq. Commit message: feat(discourse): discourse endpoints (#46) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/8944770db7c599b723eff8d7dff41012be441a25 by Khaliq. Commit message: feat(zendesk): [nan-1884] Zendesk updates (#51) by @github-actions[bot]
- Fix typo in handle-large-datasets.mdx (#2846) by @amir-bio
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/0ae108ba0121ee1bbffe5a712c7e2e253f01ae45 by Andres Reales. Commit message: feat(box): Add box integration (#50) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/67d3f0fdbd376a3c70a6f261dde9d1fba8536545 by Khaliq. Commit message: feat(zoom-meetings): [nan-1899] zoom operations (#54) by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/8e42930a80f83cad598769521207dc43cc314b87 by Khaliq. Commit message: feat(jira): [nan-1860] add in user operations (#53) by @github-actions[bot]
- Hard delete sync jobs when a sync is deleted (#2834) by @TBonnin

### Fixed

- Dynamic getOutpout longPolling timeout (#2830) by @TBonnin
- Retry until to fetch task output instead of long-lived request (#2831) by @TBonnin
- Bump jobs/orchestrator server limit for incoming request (#2832) by @TBonnin
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/9c9b2a79b0d06d5933865534e31e8d85c7a4b0b5 by Khaliq. Commit message: fix(outlook): Tweak outlook format to be plain text instead of html (#45) by @github-actions[bot]
- Out of sync between task state and sync_job status (#2829) by @TBonnin
- Enable possibility to run remote runner (#2826) by @TBonnin
- Lower task heartbeat timeout to 5 mins (#2833) by @TBonnin
- *(connections)* Update last fetched at to be 33% (#2838) by @khaliqgant
- *(docs)* Redeploy mintlify (#2839) by @bastienbeurier
- *(proxy)* Handle 204 empty response data (#2844) by @hassan254-prog
- *(object-spec)* [nan-1908] handle nested object fields (#2849) by @khaliqgant
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/6d17af6defa25fdc07597c2f74c559f8c4159988 by Khaliq. Commit message: fix(slack-users-sync): [nan-1912] clean up slack sync (#55) by @github-actions[bot]
- *(node-client)* [nan-1915] pass the body along for a delete request if provided (#2850) by @khaliqgant

## [v0.42.15] - 2024-10-08

### Added

- *(integrations)* Add support for bitly (#2753) by @hassan254-prog
- Add keystore package (#2756) by @TBonnin
- *(connect-ui)* Handle generic auth method (#2754) by @bodinsamuel
- *(integrations)* Add support for OpenAi (#2755) by @hassan254-prog
- *(connect)* Open in dashboard, send events, polish display (#2760) by @bodinsamuel
- *(providers)* Add display name, validate doc/svg path (#2762) by @bodinsamuel
- *(integration-template-tests)* [nan-1696] update sdk so that record responses is less instrusive (#2763) by @khaliqgant
- *(integrations)* Add support for anthropic (#2764) by @hassan254-prog
- *(integrations)* Add support for replicate (#2766) by @claudfuen
- *(providers)* Add connection_config, credentials definition (#2768) by @bodinsamuel
- *(connect)* Add display name, auto generate form from connection_config (#2775) by @bodinsamuel
- Add POST /connect/sessions endpoint (#2769) by @TBonnin
- Add GET /connect/session endpoint (#2776) by @TBonnin
- Add createConnectSession to node-client + docs (#2785) by @TBonnin
- *(connect)* Require session token to load (#2787) by @bodinsamuel
- *(connect)* Add ability to document connection config and credentials (#2790) by @bodinsamuel
- *(connect)* Support for domain suffix, hidden fields, default value (#2797) by @bodinsamuel
- *(integrations)* Support for Typefully (#2800) by @Shubhamai
- *(integrations)* Add support for fal.ai (#2791) by @Shubhamai
- Add middleware to combine connect session and private key auth (#2792) by @TBonnin
- Add support for connect session token auth in frontend sdk (#2806) by @TBonnin
- *(connect)* Open beta (#2809) by @bodinsamuel
- *(integrations)* Add support for Connectwise PSA (#2817) by @hassan254-prog
- *(integrations)* Add support for Buildium (#2818) by @hassan254-prog
- *(integrations)* Add support for acuity scheduling (#2821) by @davidosemwegie
- *(db)* Add missing index for active_logs (#2823) by @bodinsamuel
- *(integrations)* Add Support for Elevenlabs (#2798) by @Shubhamai
- *(integrations)* Perplexity support (#2820) by @Shubhamai
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/3d5a116d5bae497156f12f87a09ef5094be8d7c9 by Khaliq. Commit message: feat(notion): add notion users sync and don't generate tests if mock file doesn't exist (#39) by @github-actions[bot]
- *(integrations)* Add connectwise staging (#2828) by @bodinsamuel
- *(integrations)* Rapidapi support (#2807) by @Shubhamai

### Changed

- *(deps)* Bump rollup from 4.21.2 to 4.22.4 (#2757) by @dependabot[bot]
- *(integration-template-reference)* [nan-1760] update references to integration templates to point to the new repo (#2773) by @khaliqgant
- *(integration-templates)* [nan-1170] remove integration templates (#2774) by @khaliqgant
- *(.env.example cleanup)* Remove temporal and comment out redis as it will crash if not set (#2777) by @khaliqgant
- *(integration-templates)* Automated commit updating flows.yaml from the integration-templates repo by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml from the integration-templates repo by @github-actions[bot]
- Update docs/openapi spec to describe connect session endpoints (#2784) by @TBonnin
- *(integration-templates)* Automated commit updating flows.yaml from the integration-templates repo by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml from the integration-templates repo by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml from the integration-templates repo by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml from the integration-templates repo by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml from the integration-templates repo by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml from the integration-templates repo by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml from the integration-templates repo by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml from the integration-templates repo by @github-actions[bot]
- Update api configuration (#2803) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml from the integration-templates repo by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml from the integration-templates repo by @github-actions[bot]
- Deploy connect ui (#2811) by @bodinsamuel
- *(integration-templates)* Automated commit updating flows.yaml from the integration-templates repo by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml from the integration-templates  Description: by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml from the integration-templates  Description: by @github-actions[bot]
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/2bb78a6d4f6ad98cdf0a0ad169b5d632bc505d69 by Khaliq. Commit message: feat(zod-validation): Add zod validation for all integrations (#40) by @github-actions[bot]

### Fixed

- Missing FLAG_AUTH_ENABLED in docker-compose.yaml (#2752) by @marcodeltongo
- *(integrations)* Update endpoints so entities are organized via headers (#2758) by @khaliqgant
- *(ui)* Clear cache on integration save (#2759) by @bodinsamuel
- *(pagination)* [nan-1793] use next_cursor instead of start_cursor (#2761) by @khaliqgant
- *(publish)* Missing types bump in frontend (#2772) by @bodinsamuel
- *(jobs)* Try to handle knex pool exhaustion (#2771) by @bodinsamuel
- *(ui)* Do not put metadata as input (#2778) by @bodinsamuel
- *(webhook-forward)* [nan-1813] when we arent able to validate a connection the headers should still forward (#2779) by @khaliqgant
- *(jobs)* Missing timeout value (#2781) by @bodinsamuel
- *(ci)* Do not ask for upgrade on CI (#2782) by @bodinsamuel
- *(connect)* Error screen, empty screen, handle verification error, handle quitting too soon (#2780) by @bodinsamuel
- *(integration-tests)* Fix overrides (#2786) by @hassan254-prog
- *(connect)* Fields ordering (#2788) by @bodinsamuel
- Merge fail on routes (#2796) by @bodinsamuel
- *(save-responses)* [nan-1827] save batchSave to namespace model Map and save input for action (#2795) by @khaliqgant
- *(quickbooks-sandbox)* [nan-1824] update quickbooks sandbox (#2799) by @khaliqgant
- Sync frequency can be edited to be 30s or more (#2801) by @TBonnin
- *(sdk)* Sample record validation errors (#2794) by @bodinsamuel
- *(connect)* Handle global error, global loading, fetch session (#2804) by @bodinsamuel
- 'window is already open' bug (#2808) by @TBonnin
- *(connect)* Working e2e, use default values from session (#2805) by @bodinsamuel
- *(templates)* Missing some fields when upgrading  (#2810) by @bodinsamuel
- *(deploy)* Fix quote (#2813) by @bodinsamuel
- *(connect)* Defer token creation after iframe open (#2812) by @bodinsamuel
- Zoom scope delimiter is now ',' (#2816) by @TBonnin
- *(orchestrator)* Slightly improve the timeout query (#2814) by @TBonnin
- *(enterprise-metrics)* [nan-1809] add logic for enterprise flag for datadog (#2824) by @khaliqgant
- *(providers)* Missing $ in snowflake (#2827) by @bodinsamuel
- *(orch)* Timeout to orchestrator /task/output must equal task timeout (#2825) by @TBonnin
- *(integration-templates)* Automated commit updating flows.yaml based on changes in https://github.com/NangoHQ/integration-templates/commit/f20123289442710f78f6124be9298c33af2df065 by Hassan_Wari. Commit message: fix(gmail): fix emails sync and add simple action to fetch (#41) by @github-actions[bot]

## [v0.42.12] - 2024-09-23

### Added

- Add index for sync_config_id column in sync table (#2719) by @TBonnin
- *(big-query)* [nan-1664] add internalintegrationid to bigquery tables (#2729) by @khaliqgant
- *(integration)* Add support for odoo (#2725) by @hassan254-prog
- *(integration-templates)* Add discourse integration template (#2722) by @hassan254-prog
- *(netsuite-tba)* [nan-1736] add endpoints and clarify payments endpoint (#2734) by @khaliqgant
- *(api)* Unauthenticated standard endpoint (#2735) by @bodinsamuel
- *(integration-templates)* Improve google-drive templates (#2727) by @hassan254-prog
- *(api)* GET /providers, GET /providers/:provider (#2732) by @bodinsamuel
- Connect ui (#2721) by @bodinsamuel
- *(integration-templates)* Add quickbooks actions & syncs (#2741) by @hassan254-prog
- *(docs)* Update cloud vs self-hosted page (#2748) by @rguldener
- Make connectionId optional when creating a new connection (#2746) by @TBonnin
- *(connect)* Integrations list (#2749) by @bodinsamuel
- *(sdk)* Add new endpoints (#2747) by @bodinsamuel

### Changed

- *(requestLoggerMiddleware)* Log body when error (#2718) by @TBonnin
- Trace sending webhook when sync completes (#2726) by @TBonnin
- Rename netsuite-tba in docs (#2733) by @bodinsamuel
- Typo in self-hosting instructions (#2738) by @amikofalvy
- *(deps-dev)* Bump vite from 5.3.1 to 5.4.6 (#2742) by @dependabot[bot]
- [nan-1729] netsuite-tba documentation (#2743) by @khaliqgant

### Fixed

- *(hooks)* Update jira hook (#2720) by @hassan254-prog
- *(api)* Remove unused suspend user (#2723) by @bodinsamuel
- Rename netsuite integrations template to netsuite-tba (#2724) by @TBonnin
- *(connectionId)* Missing char in regex by @bodinsamuel
- *(github-app-oauth)* [nan-1733] GitHub app missing secret and update iss in case the app-id is missing (#2730) by @khaliqgant
- *(sdk)* Handle circular json in log() (#2731) by @bodinsamuel
- *(db)* Identify pg lock (#2739) by @bodinsamuel
- *(syncs table)* Sync_config_id must be updated when new deploy (#2736) by @TBonnin
- Slow records deletion query (#2737) by @TBonnin
- *(log)* Handle large payload (#2740) by @bodinsamuel
- *(logs)* Sync_type can be empty (#2745) by @khaliqgant
- *(api)* GET /integrations + GET /integrations/:uniqueKey (#2744) by @bodinsamuel
- *(logs)* Truncate only non required properties (#2751) by @bodinsamuel

## [v0.42.10] - 2024-09-12

### Added

- *(api docs)* Add linkedin api page gotcha for refresh tokens (#2697) by @khaliqgant
- *(integrations)* Add support for manatal (#2692) by @hilmia
- Integration UI revamp (#2594) by @bodinsamuel
- *(integrations)* Add support for shipstation (#2700) by @hassan254-prog
- *(integrations)* Add support for Discourse (#2699) by @hassan254-prog
- *(integrations)* Add support for avalara (#2701) by @hassan254-prog
- *(integration-templates)* Add woocommerce integration templates (#2703) by @hassan254-prog
- *(migration)* Add sync_config_id column to sync_config table (#2711) by @TBonnin
- *(integration-templates)* [nan 1643] dynamic tests against integration templates (#2678) by @khaliqgant

### Changed

- Scripts v2 (#2702) by @bodinsamuel
- Use new sync_config_id column in sync table (#2712) by @TBonnin
- *(deps)* Bump express from 4.19.2 to 4.20.0 (#2715) by @dependabot[bot]
- *(deps)* Bump body-parser from 1.20.2 to 1.20.3 (#2714) by @dependabot[bot]

### Fixed

- Show version in NPM publish github action title (#2693) by @TBonnin
- *(internal-integrations)* [nan-1629] continue on error (#2685) by @khaliqgant
- *(internal-deployment)* Error is a string not json (#2695) by @khaliqgant
- *(internal-deployment)* Fix nango install (#2696) by @khaliqgant
- *(cli)* Handle conflicting script names (#2691) by @bodinsamuel
- *(internal-deployment)* Fix concurrency name & error exit logic (#2698) by @khaliqgant
- *(ui)* Improve code snippets (#2677) by @bodinsamuel
- *(api)* Wrong handling for createProvider return type (#2704) by @bodinsamuel
- *(integration-template-upload)* [nan-1629] update exit code specific logic and don't bail on success (#2705) by @khaliqgant
- *(xero-auth)* [nan-1684] handle multiple tenants (#2706) by @khaliqgant
- *(ui)* Script v2 feedback (#2707) by @bodinsamuel
- *(ui)* Correctly show v1 when there is no template (#2710) by @bodinsamuel
- Allow special characters in provider config key (#2713) by @TBonnin
- Axios error request method can be undefined (#2716) by @TBonnin
- *(proxy)* File upload via multipart/form-data or application/octet-stream (#2708) by @TBonnin

## [v0.42.9] - 2024-09-06

### Added

- *(integrations)* [nan-1598] add cal-v2 syncs (#2667) by @khaliqgant
- *(connection)* Delete also clean opened slack notification (#2666) by @bodinsamuel
- Add support for full log message in persist API (#2659) by @TBonnin
- *(integrations)* Add support for zoho-people (#2684) by @hassan254-prog
- *(integrations)* Add support for coupa compass (#2683) by @hassan254-prog

### Changed

- *(docs)* Github app oauth doc improvements (#2673) by @khaliqgant
- *(deps-dev)* Bump @blakeembrey/template from 1.1.0 to 1.2.0 (#2672) by @dependabot[bot]
- Update count of supported APIs (#2676) by @rguldener
- Refactor persist API to use same pattern as other services (#2658) by @TBonnin
- Pass full log messages from scripts (#2660) by @TBonnin
- Improve syncs log messages (#2687) by @TBonnin
- Lower mininum frequency interval to 30s (#2690) by @TBonnin

### Fixed

- *(logs)* Update operation messages + icons (#2670) by @bodinsamuel
- *(integrations)* Fix cal yaml (#2675) by @khaliqgant
- *(capping)* Reup capping on connection creation (#2674) by @bodinsamuel
- *(node-client)* Sync record types (#2679) by @bodinsamuel
- *(Netsuite)* Use expandSubResources to fetch all subentities (#2680) by @TBonnin
- Connectionid validation (#2688) by @bodinsamuel
- *(demo)* Reup fetch data (#2689) by @bodinsamuel

## [v0.42.8] - 2024-09-03

### Added

- *(internal-script-development)* [nan-1629] add internal deploy logic (#2655) by @khaliqgant

### Changed

- Correctly document basic auth (#2664) by @bodinsamuel

### Fixed

- *(slack)* Log operation to admin account only (#2668) by @bodinsamuel

## [v0.42.7] - 2024-09-02

### Added

- *(integrations)* Add flag auto_start (#2653) by @hassan254-prog
- *(integrations)* Add support for cal.com (#2657) by @hassan254-prog
- *(integrations)* Add support for make (#2656) by @hassan254-prog

### Fixed

- *(deps)* Upgrade botbuilder (#2649) by @bodinsamuel
- *(github-action-example)* Check for the key later based on the determined stage (#2651) by @khaliqgant
- *(cli)* Exit 1 when compilation fail (#2650) by @bodinsamuel
- *(github-app-oauth)* [nan-1628] add escape hatch for avoiding encoding params (#2652) by @khaliqgant
- *(user)* Correctly get user by token (#2654) by @bodinsamuel
- *(github-template)* Fix secret key access (#2662) by @khaliqgant
- *(cli)* Correctly compile file outside an integration (#2663) by @bodinsamuel

## [v0.42.6] - 2024-08-29

### Added

- *(integrations)* Add support for builder.io (#2637) by @hassan254-prog
- *(integrations)* Add support for google play (#2636) by @hassan254-prog
- *(api)* Prebuilt endpoints (#2642) by @bodinsamuel

### Changed

- Clarify start sync behavior (#2644) by @bastienbeurier
- *(deps)* Bump micromatch and lint-staged (#2640) by @dependabot[bot]
- Update the template list in the docs (#2635) by @hassan254-prog
- Incorrect webhook subscription example (#2633) by @bodinsamuel

### Fixed

- *(tiktok-accounts)* [nan-1233] check for nested data (#2641) by @khaliqgant
- *(ui)* Upgrade Info component with Radix (#2645) by @bodinsamuel
- *(proxy)* Correctly stream attachment (#2643) by @bodinsamuel
- *(deps)* Manual upgrade (#2647) by @bodinsamuel
- *(docs)* [nan-1511] update docs for webhooks (#2648) by @khaliqgant

## [v0.42.5] - 2024-08-27

### Added

- POST /connection: add support for OAUTH2_CC auth mode (#2607) by @TBonnin
- *(integrations)* Add support for chargebee (#2615) by @edishu
- *(integrations)* Add support for metabase (#2617) by @hassan254-prog
- *(integrations)* Add support for checkout.com (#2616) by @hassan254-prog
- Add integration provider for Holded (#2620) by @vrouet
- *(integrations)* Add support for bigcommerce (#2621) by @hassan254-prog
- *(integrations)* Add support for codeclimate (#2625) by @hassan254-prog
- Adding templates for Netsuite (#2618) by @TBonnin
- *(pagination)* [nan-1532] add offset_start_value (#2638) by @khaliqgant
- *(scripts)* Add missing native objects (#2639) by @bodinsamuel

### Changed

- Display job and stage in github action name (#2610) by @TBonnin
- Document Google Drive template on docs (#2611) by @rguldener
- *(deps)* Bump axios from 1.7.2 to 1.7.4 (#2612) by @dependabot[bot]
- Update aws s3 lib to fix fast-xml-parse vulnerability (#2626) by @TBonnin
- Allow to run templates upload gh action manually (#2629) by @TBonnin

### Fixed

- *(url)* Handle special characters in connection params (#2608) by @hassan254-prog
- Runner request to jobs /idle endpoint (#2614) by @TBonnin
- Update error message for provider key missing (#2622) by @kndwin
- *(api)* Allow disabling rate limit (#2623) by @bodinsamuel
- *(api)* DELETE integration split logic, dedicated files (#2624) by @bodinsamuel
- Upload templates github action (#2627) by @TBonnin
- Disable proxy debug log by default (#2628) by @TBonnin
- Wrong file path for schema.zod.js in templates (#2630) by @TBonnin
- *(upload templates)* Using cut instead of dirname (#2632) by @TBonnin
- Better payload for proxy logs and operations (#2631) by @TBonnin
- Action and webhook logs improvements (#2634) by @TBonnin

## [v0.42.4] - 2024-08-13

### Added

- Add TickTick OAuth provider (#2555) by @dax
- *(integrations)* Add pagination for exact-online (#2565) by @bodinsamuel
- *(integration-templates)* [nan-1518] update bamboo integration scripts (#2559) by @khaliqgant
- Add note about scale plan limit to incoming webhooks docs (#2570) by @rguldener
- *(integrations)* Add support for e-conomic (#2557) by @hassan254-prog
- *(anrok-integrations)* [nan-1527] add anrok actions (#2569) by @khaliqgant
- *(integrations)* Add support for fiserv (#2573) by @hassan254-prog
- *(integrations)* Add support for tumblr (#2578) by @hassan254-prog
- *(integrations)* Add default headers for exact-online (#2580) by @bodinsamuel
- *(integrations)* Add support for Circle So (#2577) by @hassan254-prog
- *(integrations)* Add templates for exact online (#2583) by @bodinsamuel
- *(integrations)* Add support for Workday SOAP (#2590) by @bodinsamuel
- *(proxy)* Add fallback to proxy base_url (#1873) by @hassan254-prog
- Add base_url for gitlab (#2599) by @hassan254-prog
- *(integrations)* Add support for tsheetsteam (#2598) by @hassan254-prog
- *(integration)* Add support for podium (#2601) by @hassan254-prog
- *(integrations)* Add salesforce-experience-cloud provider (#2592) by @gorets

### Changed

- Refactor runner and run.service (#2547) by @TBonnin
- Remove legacy runner code (#2572) by @TBonnin
- Log error in handlePayloadTooBigError (#2576) by @TBonnin
- *(runner)* Log version and file location (#2579) by @TBonnin
- Retry in orchestrator client (#2581) by @TBonnin
- Add company ID explanation to quickbooks doc (#2593) by @rguldener
- Typos (#2595) by @bodinsamuel

### Fixed

- *(docs)* Small fixes to the docs (#2554) by @khaliqgant
- *(jobs)* PutTask error payload is not always an Record<string, unknown> (#2558) by @TBonnin
- Sync/status type must be INCREMENTAL or INITIAL (#2560) by @TBonnin
- Webhook syncType must be INITIAL instead of FULL (#2561) by @TBonnin
- *(api)* Move GET /config to a dedicated file (#2549) by @bodinsamuel
- Actions failing with cannot convert undefined or null to object (#2563) by @TBonnin
- Compute sync metrics once sync completes (#2564) by @TBonnin
- *(insights)* Feedbacks (#2566) by @bodinsamuel
- *(webhook)* [nan-1528] operation should reflect the sync job run type not the type of sync it is (#2568) by @khaliqgant
- *(proxy)* Send no data if empty body (#2556) by @TBonnin
- *(klaviyo-integration)* [nan-1511] allow oauth to dynamically inject headers (#2571) by @khaliqgant
- Support special characters in db urls (#2575) by @TBonnin
- *(runner)* Serialize error correctly (#2567) by @bodinsamuel
- *(proxy)* Error response with no data should report failure (#2584) by @TBonnin
- *(proxy)* Consolidate error message (#2585) by @TBonnin
- *(cli)* [nan-1145] only compile and deploy single sync (#2582) by @khaliqgant
- *(runner)* Use correct Nango object for webhook (#2587) by @bodinsamuel
- *(oauth2_cc)* Accommodate expires_in for fiserv (#2574) by @hassan254-prog
- *(integrations)* Return siteId in the file-sync response (#2586) by @hassan254-prog
- *(runner)* Pass a syncJobId to webhook handler (#2589) by @bodinsamuel
- *(ui)* Wrong env in sidebar (#2591) by @bodinsamuel
- *(integrations)* Update base_url for gong-oauth (#1770) by @hassan254-prog
- *(cli)* Correct output when getConnection is 404 (#2596) by @bodinsamuel
- *(ui)* Disabled button, improv secret input, http label (#2597) by @bodinsamuel
- *(ui)* SWR types  (#2600) by @bodinsamuel
- Revert expireAt for podium (#2603) by @hassan254-prog
- *(api)* Upsert connection metadata/config (#2602) by @bodinsamuel
- *(env)* Clarify auth flag by @bodinsamuel
- *(ui)* Missing Inter font (#2606) by @bodinsamuel
- *(anrok)* Handle errors correctly, fix types (#2605) by @bodinsamuel
- *(webhook)* Allow handler to save records (#2604) by @bodinsamuel

## [v0.42.2] - 2024-07-26

### Added

- Refactor User Settings (#2513) by @bodinsamuel
- *(integrations)* Add support for contentful (#2515) by @hassan254-prog
- *(webhooks)* [nan-1432] add checkr webhook forwarding possibility (#2516) by @khaliqgant
- Add start endpoint to runner (#2524) by @TBonnin
- Invitation UI (#2520) by @bodinsamuel
- *(cli)* [nan-1309] add .gitignore to ignore dist and .env file (#2527) by @khaliqgant
- *(db)* Add index for invited_users (#2522) by @bodinsamuel
- *(integrations)* Add support for gainsight-cc (#2531) by @hassan254-prog
- *(integrations)* Add helpscout rate limiting (#2534) by @hassan254-prog
- *(server)* Add CSP, cors (#2532) by @bodinsamuel
- *(sdk)* [nan-1474] allow generics for input and output for triggerAction (#2542) by @khaliqgant
- Expose env.js from backend to frontend (#2540) by @bodinsamuel
- In product metrics (#2541) by @bodinsamuel
- *(integration-template)* Add sharepoint fetch-file action (#2551) by @hassan254-prog
- *(tableau-integrations)* Add support for tableau api (#2526) by @hassan254-prog
- *(integrations)* [nan-1195] teams integration (#2550) by @khaliqgant

### Changed

- Dryrun should not depend on run.service (#2507) by @TBonnin
- *(deps)* Manual upgrade (#2514) by @bodinsamuel

### Fixed

- Update sync frequency (#2518) by @TBonnin
- *(xero-integration-template)* [nan-1438] xero updates to match the API better (#2519) by @khaliqgant
- *(documentation)* [nan-1349] update docs (#2517) by @khaliqgant
- *(cli)* [nan-1457] auto confirm for dry run (#2528) by @khaliqgant
- *(logs)* Remove support for number (#2523) by @bodinsamuel
- *(ui)* Feedback on profile/team/invitation (#2530) by @bodinsamuel
- *(integration-templates)* Fix location of upload (#2529) by @khaliqgant
- *(team)* Forbid to remove themselves, handle invitation with wrong account (#2533) by @bodinsamuel
- *(integration-templates-xero)* Validate update-invoices correctly (#2536) by @khaliqgant
- *(auth)* Handle invitation with managed auth (#2535) by @bodinsamuel
- *(auth)* Correct email verification (#2537) by @bodinsamuel
- *(auth)* Secure cookie and allow subdomains (#2538) by @bodinsamuel
- *(team)* Update team/invitation wording (#2539) by @bodinsamuel
- *(cors)* Allow public api to be reached from a frontend (#2543) by @bodinsamuel
- *(csp)* Allow websockets (#2544) by @bodinsamuel
- *(signup)* Correctly verify email when using invitation (#2548) by @bodinsamuel
- *(ui)* Feedback on team/invitation (#2545) by @bodinsamuel
- *(ui)* Various fix (#2552) by @bodinsamuel
- *(ci)* Providers validation (#2546) by @bodinsamuel
- *(sdk)* [nan-1474] type sdk and remove return coercion (#2553) by @khaliqgant

## [v0.42.0] - 2024-07-16

### Added

- *(integrations)* Add support for the Canny API (#2499) by @keedyc
- *(integration-templates)* Improve sharepoint templates (#2495) by @hassan254-prog
- Refactor Team Settings (#2493) by @bodinsamuel

### Changed

- Remove deprecated get records (#2511) by @bodinsamuel

### Fixed

- *(proxy)* Allow empty body for POST, PUT, PATCH (#2506) by @TBonnin
- *(datadog)* Enable tcp tracing (#2510) by @bodinsamuel
- *(db)* Remove unused metrics, reduce pool size (#2509) by @bodinsamuel
- *(runner)* Get random port safely (#2508) by @bodinsamuel
- *(cli)* Handle Windows paths (#2312) (#2496) by @bburns
- *(integration-templates)* Show the link only for the future upgrade not the current integration template (#2512) by @khaliqgant

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

[v0.63.1]: https://github.com/NangoHQ/nango/compare/v0.63.0..v0.63.1
[v0.63.0]: https://github.com/NangoHQ/nango/compare/v0.62.1..v0.63.0
[v0.62.1]: https://github.com/NangoHQ/nango/compare/v0.62.0..v0.62.1
[v0.62.0]: https://github.com/NangoHQ/nango/compare/v0.61.3..v0.62.0
[v0.61.3]: https://github.com/NangoHQ/nango/compare/v0.61.2..v0.61.3
[v0.61.2]: https://github.com/NangoHQ/nango/compare/v0.61.1..v0.61.2
[v0.61.1]: https://github.com/NangoHQ/nango/compare/v0.61.0..v0.61.1
[v0.61.0]: https://github.com/NangoHQ/nango/compare/v0.60.5..v0.61.0
[v0.60.5]: https://github.com/NangoHQ/nango/compare/v0.60.4..v0.60.5
[v0.60.4]: https://github.com/NangoHQ/nango/compare/v0.60.3..v0.60.4
[v0.60.3]: https://github.com/NangoHQ/nango/compare/v0.60.2..v0.60.3
[v0.60.2]: https://github.com/NangoHQ/nango/compare/v0.60.1..v0.60.2
[v0.60.1]: https://github.com/NangoHQ/nango/compare/v0.60.0..v0.60.1
[v0.60.0]: https://github.com/NangoHQ/nango/compare/v0.59.13..v0.60.0
[v0.59.13]: https://github.com/NangoHQ/nango/compare/v0.59.12..v0.59.13
[v0.59.12]: https://github.com/NangoHQ/nango/compare/v0.59.11..v0.59.12
[v0.59.11]: https://github.com/NangoHQ/nango/compare/v0.59.8..v0.59.11
[v0.59.8]: https://github.com/NangoHQ/nango/compare/v0.59.7..v0.59.8
[v0.59.7]: https://github.com/NangoHQ/nango/compare/v0.59.3..v0.59.7
[v0.59.3]: https://github.com/NangoHQ/nango/compare/v0.59.1..v0.59.3
[v0.59.1]: https://github.com/NangoHQ/nango/compare/v0.59.0..v0.59.1
[v0.59.0]: https://github.com/NangoHQ/nango/compare/v0.58.7..v0.59.0
[v0.58.7]: https://github.com/NangoHQ/nango/compare/v0.58.6..v0.58.7
[v0.58.6]: https://github.com/NangoHQ/nango/compare/v0.58.5..v0.58.6
[v0.58.5]: https://github.com/NangoHQ/nango/compare/v0.58.4..v0.58.5
[v0.58.4]: https://github.com/NangoHQ/nango/compare/v0.58.3..v0.58.4
[v0.58.3]: https://github.com/NangoHQ/nango/compare/v0.58.2..v0.58.3
[v0.58.2]: https://github.com/NangoHQ/nango/compare/v0.58.1..v0.58.2
[v0.58.1]: https://github.com/NangoHQ/nango/compare/v0.57.6..v0.58.1
[v0.57.6]: https://github.com/NangoHQ/nango/compare/v0.57.5..v0.57.6
[v0.57.5]: https://github.com/NangoHQ/nango/compare/v0.57.4..v0.57.5
[v0.57.4]: https://github.com/NangoHQ/nango/compare/v0.57.3..v0.57.4
[v0.57.3]: https://github.com/NangoHQ/nango/compare/v0.57.2..v0.57.3
[v0.57.2]: https://github.com/NangoHQ/nango/compare/v0.57.1..v0.57.2
[v0.57.1]: https://github.com/NangoHQ/nango/compare/v0.57.0..v0.57.1
[v0.57.0]: https://github.com/NangoHQ/nango/compare/v0.56.4..v0.57.0
[v0.56.4]: https://github.com/NangoHQ/nango/compare/v0.56.3..v0.56.4
[v0.56.3]: https://github.com/NangoHQ/nango/compare/v0.56.2..v0.56.3
[v0.56.2]: https://github.com/NangoHQ/nango/compare/v0.56.1..v0.56.2
[v0.56.1]: https://github.com/NangoHQ/nango/compare/v0.56.0..v0.56.1
[v0.56.0]: https://github.com/NangoHQ/nango/compare/v0.55.0..v0.56.0
[v0.55.0]: https://github.com/NangoHQ/nango/compare/v0.54.0..v0.55.0
[v0.54.0]: https://github.com/NangoHQ/nango/compare/v0.53.2..v0.54.0
[v0.53.2]: https://github.com/NangoHQ/nango/compare/v0.53.1..v0.53.2
[v0.53.1]: https://github.com/NangoHQ/nango/compare/v0.53.0..v0.53.1
[v0.53.0]: https://github.com/NangoHQ/nango/compare/v0.52.5..v0.53.0
[v0.52.5]: https://github.com/NangoHQ/nango/compare/v0.52.4..v0.52.5
[v0.52.4]: https://github.com/NangoHQ/nango/compare/v0.52.3..v0.52.4
[v0.52.3]: https://github.com/NangoHQ/nango/compare/v0.52.2..v0.52.3
[v0.52.2]: https://github.com/NangoHQ/nango/compare/v0.52.1..v0.52.2
[v0.52.1]: https://github.com/NangoHQ/nango/compare/v0.51.0..v0.52.1
[v0.51.0]: https://github.com/NangoHQ/nango/compare/v0.50.0..v0.51.0
[v0.50.0]: https://github.com/NangoHQ/nango/compare/v0.49.0..v0.50.0
[v0.49.0]: https://github.com/NangoHQ/nango/compare/v0.48.4..v0.49.0
[v0.48.4]: https://github.com/NangoHQ/nango/compare/v0.48.3..v0.48.4
[v0.48.3]: https://github.com/NangoHQ/nango/compare/v0.48.2..v0.48.3
[v0.48.2]: https://github.com/NangoHQ/nango/compare/v0.48.1..v0.48.2
[v0.48.1]: https://github.com/NangoHQ/nango/compare/v0.48.0..v0.48.1
[v0.48.0]: https://github.com/NangoHQ/nango/compare/v0.47.1..v0.48.0
[v0.47.1]: https://github.com/NangoHQ/nango/compare/v0.47.0..v0.47.1
[v0.47.0]: https://github.com/NangoHQ/nango/compare/v0.46.1..v0.47.0
[v0.46.1]: https://github.com/NangoHQ/nango/compare/v0.46.0..v0.46.1
[v0.46.0]: https://github.com/NangoHQ/nango/compare/v0.45.1..v0.46.0
[v0.45.1]: https://github.com/NangoHQ/nango/compare/v0.45.0..v0.45.1
[v0.45.0]: https://github.com/NangoHQ/nango/compare/v0.44.0..v0.45.0
[v0.44.0]: https://github.com/NangoHQ/nango/compare/v0.43.0..v0.44.0
[v0.43.0]: https://github.com/NangoHQ/nango/compare/v0.42.22..v0.43.0
[v0.42.22]: https://github.com/NangoHQ/nango/compare/v0.42.21..v0.42.22
[v0.42.21]: https://github.com/NangoHQ/nango/compare/v0.42.20..v0.42.21
[v0.42.20]: https://github.com/NangoHQ/nango/compare/v0.42.19..v0.42.20
[v0.42.19]: https://github.com/NangoHQ/nango/compare/v0.42.18..v0.42.19
[v0.42.18]: https://github.com/NangoHQ/nango/compare/v0.42.17..v0.42.18
[v0.42.17]: https://github.com/NangoHQ/nango/compare/v0.42.15..v0.42.17
[v0.42.15]: https://github.com/NangoHQ/nango/compare/v0.42.12..v0.42.15
[v0.42.12]: https://github.com/NangoHQ/nango/compare/v0.42.10..v0.42.12
[v0.42.10]: https://github.com/NangoHQ/nango/compare/v0.42.9..v0.42.10
[v0.42.9]: https://github.com/NangoHQ/nango/compare/v0.42.8..v0.42.9
[v0.42.8]: https://github.com/NangoHQ/nango/compare/v0.42.7..v0.42.8
[v0.42.7]: https://github.com/NangoHQ/nango/compare/v0.42.6..v0.42.7
[v0.42.6]: https://github.com/NangoHQ/nango/compare/v0.42.5..v0.42.6
[v0.42.5]: https://github.com/NangoHQ/nango/compare/v0.42.4..v0.42.5
[v0.42.4]: https://github.com/NangoHQ/nango/compare/v0.42.2..v0.42.4
[v0.42.2]: https://github.com/NangoHQ/nango/compare/v0.42.0..v0.42.2
[v0.42.0]: https://github.com/NangoHQ/nango/compare/v0.41.1..v0.42.0
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
