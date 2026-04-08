# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0](https://github.com/satusdev/bedrock-forge/compare/bedrock-forge-v1.0.0...bedrock-forge-v1.1.0) (2026-04-08)


### Features

* add CDN and image optimization features ([a82a0e9](https://github.com/satusdev/bedrock-forge/commit/a82a0e93fdd99b4a939634e4b16090e62a62cc76))
* add database and cache management tools ([1bbba8a](https://github.com/satusdev/bedrock-forge/commit/1bbba8a8525f438c7d82be87d3aa84919dc319b3))
* add package infrastructure and dependencies ([b4fda6f](https://github.com/satusdev/bedrock-forge/commit/b4fda6f3e2ac63b792814e2574540ee4b59784e2))
* add performance testing and optimization suite ([e311585](https://github.com/satusdev/bedrock-forge/commit/e3115857eb3f0b390effcc2466bc6f8a3a846a94))
* add real-time performance monitoring and alerting ([149d1b9](https://github.com/satusdev/bedrock-forge/commit/149d1b99793e90a9d94b096585eeefe5e6f62434))
* add Release Please for automated releases and GitHub Actions ([2ac552e](https://github.com/satusdev/bedrock-forge/commit/2ac552e7b1f732e5d13d308794627b400b88f45d))
* **api/dashboard:** extract DashboardRepository, expand health controller ([3cfc880](https://github.com/satusdev/bedrock-forge/commit/3cfc880610152e5c2a1a4827546635190a2fef27))
* **api/sync:** add skipSafetyBackup option to clone endpoint ([47f8a86](https://github.com/satusdev/bedrock-forge/commit/47f8a8680e64e4e5e5ef36120cb521be26bc9091))
* **api/worker:** detect CyberPanel version via SSH; MySQL CLI fallback for DB creation ([3ae826a](https://github.com/satusdev/bedrock-forge/commit/3ae826a6b1a32d9d567ce3f691925b7dd833451f))
* **api:** add audit-logs CRUD module ([cb5f4e0](https://github.com/satusdev/bedrock-forge/commit/cb5f4e0da4523db2cd91c5bd0c27beebb6ac9c75))
* **api:** add backup retention policy to schedules and improve backup endpoints ([3f13cf7](https://github.com/satusdev/bedrock-forge/commit/3f13cf7f4ce23356490af7fc5f345f4c1dcb209c))
* **api:** add dedicated dashboard stats module ([9805f9b](https://github.com/satusdev/bedrock-forge/commit/9805f9b61dec032846fa48115ed3802eadff75df))
* **api:** add dry-run mode and improved error handling to sync module ([5667350](https://github.com/satusdev/bedrock-forge/commit/5667350c1520e7b3944b1f0fb5b22bbf08d1d7ec))
* **api:** add full project create flow with CyberPanel provisioning and enriched project DTO ([3d9970d](https://github.com/satusdev/bedrock-forge/commit/3d9970d33e53f61c71d3358451c859917481a7c1))
* **api:** add helmet, audit interceptor, nightly maintenance, and reports modules ([9235210](https://github.com/satusdev/bedrock-forge/commit/923521031a62a5e48e8838903acef569916dea96))
* **api:** add plugin install/remove/update and change-constraint management endpoints ([975209d](https://github.com/satusdev/bedrock-forge/commit/975209daf6e5d500efa6ac31a6163596c45dd3bf))
* **api:** add users, packages, invoices, and notifications modules ([d884136](https://github.com/satusdev/bedrock-forge/commit/d88413646f7dde39638afb8224b968baa2c5e0c2))
* **api:** bootstrap NestJS app with auth, health, and WebSocket ([3e97115](https://github.com/satusdev/bedrock-forge/commit/3e97115c6adddef4460038b20b531cc95ab3b7ff))
* **api:** expand backups, analytics, and migrations ([27558d9](https://github.com/satusdev/bedrock-forge/commit/27558d959bd08c9e96598647e74a805f2d111f48))
* **api:** extend cyberpanel service with website and database provisioning operations ([67bd7fd](https://github.com/satusdev/bedrock-forge/commit/67bd7fdbb81cecfc668ac66cdadee13c33be6320))
* **api:** implement domain modules with repository pattern ([0f3358e](https://github.com/satusdev/bedrock-forge/commit/0f3358ea8493d426b9fa9b5af84fd21cbb410d4b))
* **api:** improve invoices with advanced filtering, bulk operations, and enriched DTO ([c9efb86](https://github.com/satusdev/bedrock-forge/commit/c9efb86e103f117cc7e81a45bdec7e1d0e111e9b))
* **api:** improve jobs gateway room broadcasting and auth controller ([6d2125d](https://github.com/satusdev/bedrock-forge/commit/6d2125d58d66d9392be5e503c8f624d045423792))
* **api:** include latest create-bedrock job execution in environments response ([d392036](https://github.com/satusdev/bedrock-forge/commit/d392036bb6d28cf976d571881c2c1412842792cf))
* **api:** propagate job_type on executions; add job_type and environment_ids filters ([be60587](https://github.com/satusdev/bedrock-forge/commit/be60587d359fa81f7f95c88c406eaccd3e5c0f7d))
* **api:** register DashboardModule and AuditLogsModule; add global HTTP exception filter ([091a7f1](https://github.com/satusdev/bedrock-forge/commit/091a7f18a7ab8cd75d626bbd9e0e35aa59c4e4a8))
* **api:** update API server integrations and core utilities ([5455eb7](https://github.com/satusdev/bedrock-forge/commit/5455eb76c608e7d285aa7dcb93c4e14a020a4d52))
* **api:** update routes and services ([eabb1ff](https://github.com/satusdev/bedrock-forge/commit/eabb1ff017f87ee38f29e545de8c3efd3a5e4746))
* **auth:** add PUT /auth/change-password endpoint ([a668da0](https://github.com/satusdev/bedrock-forge/commit/a668da07c08ddcab4175dea0a8b5d453e3668f17))
* **ci:** add GitHub Actions CI workflow ([05d081b](https://github.com/satusdev/bedrock-forge/commit/05d081bd91fd804bc008b6df99b04f83a7d1b060))
* **ci:** add Jenkins and Kuma integration scripts ([6f9e114](https://github.com/satusdev/bedrock-forge/commit/6f9e114f1d229da8e943006a709a5c54cc436ab8))
* **ci:** automate Jenkins pipeline registration and Kuma monitor integration ([e4d0f7e](https://github.com/satusdev/bedrock-forge/commit/e4d0f7ec29e8191593ea023cbb51fe7a0af000f5))
* **cli:** update CLI commands for deploy, performance, sync, and workflows ([cb39061](https://github.com/satusdev/bedrock-forge/commit/cb3906117433bf5b5f7b2db6fdc7a6e3d2838929))
* complete all major phases ([4f1de43](https://github.com/satusdev/bedrock-forge/commit/4f1de4305b161fd52f1e367f964d4d3c92a105ff))
* **dashboard-services:** align frontend API layer and env wiring ([bd87fda](https://github.com/satusdev/bedrock-forge/commit/bd87fdadb47e91200b2354f1728732bab57c9f0b))
* **dashboard:** centralize runtime env config and build wiring ([701f088](https://github.com/satusdev/bedrock-forge/commit/701f08816fe93a0b5b9bb1f46204f37cc21070b1))
* **dashboard:** expand pages and UI ([81bf850](https://github.com/satusdev/bedrock-forge/commit/81bf850bc159965aaa0517c022ac59d5b3998eaf))
* **dashboard:** migrate page and component structure ([de8e4b0](https://github.com/satusdev/bedrock-forge/commit/de8e4b02b756957803d47e2bcf3ab83c3cf9f022))
* **dashboard:** migrate ui primitives and navigation structure ([3954c77](https://github.com/satusdev/bedrock-forge/commit/3954c77936c8afc9a758683381978329b9fc0015))
* **dashboard:** update api clients and types ([7ef68b5](https://github.com/satusdev/bedrock-forge/commit/7ef68b592b333c1e28a4ebf3183fd7f5f18c3e2d))
* **dashboard:** update pages and UI ([4dd389e](https://github.com/satusdev/bedrock-forge/commit/4dd389e10fcfe83eb168e89bae3a95a81804a1a3))
* **db:** expand Prisma schema to full 26-table domain model ([1ad0257](https://github.com/satusdev/bedrock-forge/commit/1ad02573de621e46b30abee99ef5496e6f8b5b2f))
* **ddev:** make the flow use ddev where possible to simplify it all ([081a12c](https://github.com/satusdev/bedrock-forge/commit/081a12c17d44a41258f598be9130c2cf3e807ea1))
* **deploy:** add deploy.sh, harden install.sh and update.sh for production ([fdc6496](https://github.com/satusdev/bedrock-forge/commit/fdc6496649948a53792199dfa1a3ef820c1ca922))
* **deploy:** modularize deployment script ([c979e05](https://github.com/satusdev/bedrock-forge/commit/c979e052e1414b39bfa80e223d6a613fc7363247))
* **dns:** automate DNS with Cloudflare CLI and update docs ([ac3b0aa](https://github.com/satusdev/bedrock-forge/commit/ac3b0aa341ea21b6a77ea5320a2b179ded2dcf9c))
* enhance CLI commands with new functionality ([96cff56](https://github.com/satusdev/bedrock-forge/commit/96cff563aad701b63edbe2c5fe73e33a306777cf))
* implement comprehensive analytics and business intelligence suite ([71c6e6b](https://github.com/satusdev/bedrock-forge/commit/71c6e6bd36fe34126733fadb70a9dca98fd0d7a4))
* implement comprehensive dashboard system for ManageWP replacement ([78ae7c7](https://github.com/satusdev/bedrock-forge/commit/78ae7c77ea63ffb1a1c73194fdfef070368d3fd8))
* implement comprehensive installation system ([6912ff0](https://github.com/satusdev/bedrock-forge/commit/6912ff016aa6efb5c9072c977ae73e23c99acfbe))
* implement comprehensive plugin management system ([462deef](https://github.com/satusdev/bedrock-forge/commit/462deefecc9e4a6aceb9914490fcc2dcd1015cdc))
* implement configuration management and core constants ([c3bdc88](https://github.com/satusdev/bedrock-forge/commit/c3bdc880e73fb7feceda53a9ec8724d29b662fb5))
* implement phase 1, 2 ([e4353b1](https://github.com/satusdev/bedrock-forge/commit/e4353b1eee9f428f059579cb3f161ac469e2cf16))
* implement phase 4 ([077577c](https://github.com/satusdev/bedrock-forge/commit/077577c8583906d2b63ead9f970e45577e5d5a03))
* improve configuration and project creation workflow ([3982dca](https://github.com/satusdev/bedrock-forge/commit/3982dca6a7ab799c850a93999ade71a554ea51b6))
* **local:** automate git repo init and push for new sites ([4840870](https://github.com/satusdev/bedrock-forge/commit/484087046d5d20efd6bd16ccefeee550f4f0c340))
* **local:** automate GitHub repo creation via API ([b22bb84](https://github.com/satusdev/bedrock-forge/commit/b22bb84a8d5c14e80325c75ce090f4089c4626c5))
* **local:** automate secure .env file generation for sites ([984cfc1](https://github.com/satusdev/bedrock-forge/commit/984cfc1d992cc021c40ab714a90d93689c091c67))
* **local:** migrate site creation logic to modular script ([209fa4a](https://github.com/satusdev/bedrock-forge/commit/209fa4a831ca9cc14d2235b1c014f9bcda82a2de))
* **local:** modularize environment switching script ([b85d73c](https://github.com/satusdev/bedrock-forge/commit/b85d73c950b1a59730fdcef4b6bc4edc22290b42))
* **monitors:** add log history and paginated results endpoints ([5ac4162](https://github.com/satusdev/bedrock-forge/commit/5ac4162664568938cd777dd3b2cd65fa110f781a))
* **nest-api:** add background runners and stabilize module contracts ([2c876ec](https://github.com/satusdev/bedrock-forge/commit/2c876eccd0422a9abef75c431a3236f66da1e9d4))
* **nest-api:** add domain APIs, task-status, and websocket compatibility ([08053fe](https://github.com/satusdev/bedrock-forge/commit/08053fe587e0a31811dd2cc9895e8725238719f6))
* **nest-api:** scaffold service runtime and build tooling ([08aa1e9](https://github.com/satusdev/bedrock-forge/commit/08aa1e9eac0bb83cd305110b3edb4d7ca014323c))
* **packages:** add shared types/queues and remote-executor library ([6e1bf4a](https://github.com/satusdev/bedrock-forge/commit/6e1bf4a5f65585bda8fe68e7d3d9485d57e0657b))
* **prisma:** add MonitorLog model with state-transition tracking ([4892e8a](https://github.com/satusdev/bedrock-forge/commit/4892e8a68d342219450e3dc770eebdbb05161aa1))
* **projects:** support optional custom DB credentials in project creation ([ab18dbd](https://github.com/satusdev/bedrock-forge/commit/ab18dbd6b80eda202a7b24e90dc1e2aeffa535fb))
* **provision:** automate DNS propagation verification for A/CNAME records ([3e6c6ae](https://github.com/satusdev/bedrock-forge/commit/3e6c6ae13e90565312cd9ed34fcb5beac939a0f5))
* **provision:** automate Hetzner server creation via API ([84a17e6](https://github.com/satusdev/bedrock-forge/commit/84a17e67c004e1e26151674170624aa9ec2a751d))
* **provision:** automate Hetzner server hardening (firewall, fail2ban, updates, SSH) ([2642165](https://github.com/satusdev/bedrock-forge/commit/264216508e4fb64feca6abc5444d1682d9b669e1))
* **provision:** automate logrotate installation and config for logs directory ([b479041](https://github.com/satusdev/bedrock-forge/commit/b47904164dd4b1b45b9d26426848eec913b12f43))
* **provision:** automate rclone install and config upload on remote server ([0c430eb](https://github.com/satusdev/bedrock-forge/commit/0c430ebe32a7440e0a2c7014ac4958e301f69d5e))
* **provision:** automate SSH key generation and remote setup ([6309b34](https://github.com/satusdev/bedrock-forge/commit/6309b34c21f2797fa4a8f02827abbe7ae8766832))
* **provision:** collect and store project info after provisioning ([920c897](https://github.com/satusdev/bedrock-forge/commit/920c897cb6938c158dba937761df2e5a91aa1c3a))
* **provision:** fully automate rclone config and upload for Google Drive ([3ca5c50](https://github.com/satusdev/bedrock-forge/commit/3ca5c501b30737b0e9dda372022b99dfa178e4eb))
* **provision:** interactive Hetzner provisioning with hcloud context/token setup and improved docs ([0341110](https://github.com/satusdev/bedrock-forge/commit/03411107105a7777b5804f49e469540a8b883487))
* **provision:** modularize CyberPanel provisioning ([f1b3d69](https://github.com/satusdev/bedrock-forge/commit/f1b3d6943040d5bb889ab09e9a4e887f54019f9c))
* **provision:** store and display Hetzner server info in project ([6185557](https://github.com/satusdev/bedrock-forge/commit/6185557a457774aa2ccc2acc206b65c003b8d28b))
* **provision:** support selecting existing Hetzner server for site creation ([2e6f27a](https://github.com/satusdev/bedrock-forge/commit/2e6f27a329ca40c850c0636373d7c4def46d28b2))
* reinit project cli with python ([81bcb10](https://github.com/satusdev/bedrock-forge/commit/81bcb1004f2d86143a1034d78cf05edb06417dc3))
* rewrite entire project ([592bdab](https://github.com/satusdev/bedrock-forge/commit/592bdabab7bfb49296742913ec8041fd5fc85a19))
* **shared:** add reports queue, plugin-manage job type, and create-bedrock cyberpanel payload types ([ace161e](https://github.com/satusdev/bedrock-forge/commit/ace161e7eb7ecf12747d2608f0a432a7e128a855))
* **site-init:** add parent directory support for project creation ([0755cae](https://github.com/satusdev/bedrock-forge/commit/0755cae52b64b8b58a3eacd5c1184e9de07c4eb1))
* **site-init:** copy support scripts into new project ([cfc788c](https://github.com/satusdev/bedrock-forge/commit/cfc788cd00f98517d6728092807b57b1238ae335))
* **site-init:** per-site DB/user and isolated compose/env ([5beb41f](https://github.com/satusdev/bedrock-forge/commit/5beb41f8fb29a74ac6278ec891bd93f13c05c409))
* **sync:** add rclone GUI launcher ([cabada8](https://github.com/satusdev/bedrock-forge/commit/cabada8a7c74195fc40f5d53080201073b9f5e48))
* **sync:** implement backup and restore automation with retention policy ([2e9220b](https://github.com/satusdev/bedrock-forge/commit/2e9220b7972a4c1cadf97d7447de684130ddcb28))
* **sync:** modularize db/uploads sync scripts ([fac2ecf](https://github.com/satusdev/bedrock-forge/commit/fac2ecf2458e390443a0269fcf55d021bfdf1b2d))
* **ui:** update dashboard UI and client pages ([5f880cb](https://github.com/satusdev/bedrock-forge/commit/5f880cb30e17002f4c241df3b83e282e050c8566))
* update CLI core with version management and documentation ([f6bea3b](https://github.com/satusdev/bedrock-forge/commit/f6bea3b965ed4ef062023b81e6f2b30c20099720))
* use ddev for local site dev ([1f7d618](https://github.com/satusdev/bedrock-forge/commit/1f7d6182c16709cd494ba764c125690d223d97bf))
* **web/sync:** add sync history panel with live log expansion ([5e228e9](https://github.com/satusdev/bedrock-forge/commit/5e228e935c385c63c2ee4e20217d97fa1bb24b4f))
* **web:** add AuditLogs, ClientDetail, Domains, and MonitorDetail pages ([1d82c24](https://github.com/satusdev/bedrock-forge/commit/1d82c24e61afff7134a3b6d741802dad6e9c8e52))
* **web:** add backup retention configuration to BackupsTab, improve RestoreTab UX ([e8564af](https://github.com/satusdev/bedrock-forge/commit/e8564af3417ed2d83fb67a405c77aeeae949f1ff))
* **web:** add change-password section in SettingsPage ([1efc5d6](https://github.com/satusdev/bedrock-forge/commit/1efc5d6e33e572e1e9907fde9208e4df8d6b6d44))
* **web:** add CommandPalette and Stepper UI components ([614c8c8](https://github.com/satusdev/bedrock-forge/commit/614c8c8db57da0066f558765b5dab2f4832ef5d5))
* **web:** add CreateBedrockDialog and update app routing with new pages ([cc1b33d](https://github.com/satusdev/bedrock-forge/commit/cc1b33d47aa837d40ac1723e7ade05fad2937978))
* **web:** add execution logs to CreateBedrock dialog; fix domain expiry badge colors ([4da6674](https://github.com/satusdev/bedrock-forge/commit/4da667469cdd1cf3522ffd79480e716b90113202))
* **web:** add NotFoundPage and reusable data hooks ([9865449](https://github.com/satusdev/bedrock-forge/commit/986544986c66cbf0f8c8e7c81fd9b75e8f50e1c4))
* **web:** extend API client and websocket with new endpoints, improve DataTable UX ([6d9a2a2](https://github.com/satusdev/bedrock-forge/commit/6d9a2a24d1f07f972dc37eb0cad1bd4012faac46))
* **web:** implement React frontend with full feature coverage ([7d3a9d9](https://github.com/satusdev/bedrock-forge/commit/7d3a9d97284765221c8ebb3aabad7fcfef3edb78))
* **web:** overhaul PluginsTab with install/remove/update/constraint management and live job logs ([c1784c6](https://github.com/satusdev/bedrock-forge/commit/c1784c6156a8a9edafead8ef73f0ced4515dc807))
* **web:** overhaul SyncTab with dry-run mode, conflict detection, and structured live logs ([33d3e96](https://github.com/satusdev/bedrock-forge/commit/33d3e96ea1ba6a41778ca068a6eca1de96378c20))
* **web:** rebuild InvoicesPage with advanced filtering, grouping, and bulk status management ([17abf8c](https://github.com/satusdev/bedrock-forge/commit/17abf8c241e492a09bb6523a704d2decbae5227b))
* **web:** redesign CreateBedrockDialog as multi-step wizard ([625a7a2](https://github.com/satusdev/bedrock-forge/commit/625a7a2dfdf53c8abccd203fa43edb0ecc99f27c))
* **web:** redesign DashboardPage with live stats and activity feed ([794fb50](https://github.com/satusdev/bedrock-forge/commit/794fb506cc4b1f6ee54658179c34565a5d42c4da))
* **web:** restore history panel; dev login quick-fill button ([5d8d3ca](https://github.com/satusdev/bedrock-forge/commit/5d8d3ca8ac978f28d9c49be72dd704c1f3596d6a))
* **web:** show provisioning status on environment cards with real-time updates ([bee309d](https://github.com/satusdev/bedrock-forge/commit/bee309dcbc194ef2514f4d1f4e68cecfa036331d))
* **web:** update ProjectsPage, ServersPage, and SettingsPage with new features and UI polish ([049e36b](https://github.com/satusdev/bedrock-forge/commit/049e36b27cde7244fb496791a971ea78965350b7))
* **web:** update routing, layout and navigation for new pages ([e098015](https://github.com/satusdev/bedrock-forge/commit/e098015a743eabe8b3e7737b9762c8c72fe64872))
* **worker/monitors:** record up/down/degraded state transitions in MonitorLog ([45209c1](https://github.com/satusdev/bedrock-forge/commit/45209c1a4e7c7383545a3eb184a8d01ced5b2490))
* **worker/sync:** stored creds, --defaults-extra-file, skipSafetyBackup, robust URL search-replace ([18dc93f](https://github.com/satusdev/bedrock-forge/commit/18dc93fa2bc032f8d13f96cbe457267d8e33f0c3))
* **worker:** add cyberpanel HTTP util, composer manager script, and report processor ([31bd859](https://github.com/satusdev/bedrock-forge/commit/31bd8598d781d2d60b36456b17f20b4829c3803a))
* **worker:** extend create-bedrock processor with CyberPanel provisioning and environment clone support ([7e86d6c](https://github.com/satusdev/bedrock-forge/commit/7e86d6c76c425b3dd9d7a7f05b3e1b8ac9ac1515))
* **worker:** extend plugin-scan processor with composer-based plugin management actions ([a7fda47](https://github.com/satusdev/bedrock-forge/commit/a7fda4769832e7fb82e5dd38d35b76aeead6220e))
* **worker:** implement all BullMQ processors and services ([5010b0d](https://github.com/satusdev/bedrock-forge/commit/5010b0df12f1a6362ea6b861e18d996b023a31fa))
* **worker:** improve sync processor with dry-run mode, enforce backup retention policy, update monitor processor ([b189ed4](https://github.com/satusdev/bedrock-forge/commit/b189ed44468344b35289e36201bd55e0f4c50523))


### Bug Fixes

* add agents folder ([6dced58](https://github.com/satusdev/bedrock-forge/commit/6dced5846a9b146138176165b0259cb7a4066eaa))
* **api/backup-schedules:** use rj.id for repeatable job removal in BullMQ v5 ([54d6165](https://github.com/satusdev/bedrock-forge/commit/54d6165c32b652e55c6c375935f735f7d5440676))
* **api:** audit-logs, auth, invoices, job-executions improvements ([6981d24](https://github.com/satusdev/bedrock-forge/commit/6981d2428842b5f5ba3fd7bd65679e3b2f74fd8f))
* **api:** extract registrable root domain when auto-creating domain records ([6fffe75](https://github.com/satusdev/bedrock-forge/commit/6fffe7577082c464b4870141ddbaa9595dc34636))
* **api:** harden startup migrations and admin utility flows ([4ad75be](https://github.com/satusdev/bedrock-forge/commit/4ad75bea62234a1ed7657ad106a8668e8675540b))
* **api:** persist server status to db after ssh connection test ([fc2e3be](https://github.com/satusdev/bedrock-forge/commit/fc2e3be5ec7576f81b7a709ddb50245e461353f7))
* **api:** production startup validation and CORS hardening ([abac3bb](https://github.com/satusdev/bedrock-forge/commit/abac3bbcd50b3fd16953485fa07f417a79b950ed))
* **api:** RBAC on backup schedules, resilient maintenance, domain project relation ([0cbf7db](https://github.com/satusdev/bedrock-forge/commit/0cbf7db68d950cd805af93509cc163a22a27703d))
* **auth:** strengthen change-password validation to match RegisterDto ([e4b094b](https://github.com/satusdev/bedrock-forge/commit/e4b094b59b5549e0d830d6e450febde9c013f971))
* change folder name ([14896cb](https://github.com/satusdev/bedrock-forge/commit/14896cbc3157be537d46593e845fc560e1d66e3f))
* change release number ([614b873](https://github.com/satusdev/bedrock-forge/commit/614b873ab6aee6c6de417360832c1e49d87a7967))
* **ci:** add prisma generate step before building api and worker ([32058d2](https://github.com/satusdev/bedrock-forge/commit/32058d25d96bbe098745a719a8bf13ced3a68e92))
* **ci:** run prisma migrate from workspace root via pnpm db:deploy ([d1933a4](https://github.com/satusdev/bedrock-forge/commit/d1933a4fb05a60f570b044745e5f7dd7075b9fe4))
* **db:** add tags/roles migrations and seeding ([94fe47c](https://github.com/satusdev/bedrock-forge/commit/94fe47ce823b7fb6144d4457f04b79efd76d8a69))
* **db:** normalize enum persistence and add safety migrations ([1f8e10e](https://github.com/satusdev/bedrock-forge/commit/1f8e10e2921f97dced6fa2074b08abcea1629329))
* **domains:** deduplicate domain records with findOrCreate ([b87e19b](https://github.com/satusdev/bedrock-forge/commit/b87e19b2ac3c955a0937ee1bbaf6048d3ee9e8af))
* **entrypoint:** wait for postgres TCP before running migrations ([3392203](https://github.com/satusdev/bedrock-forge/commit/3392203f187dedf28c36eea97f74802920f755d9))
* **notifications:** improve Slack channel_not_found error message ([e8bcf3a](https://github.com/satusdev/bedrock-forge/commit/e8bcf3a49a6a6a0be683be05ec82ad0093d7c30c))
* **prisma:** add job_type column to JobExecution ([2271a36](https://github.com/satusdev/bedrock-forge/commit/2271a361a587e861b34cce4b2358dfd9589628c4))
* **remote-executor:** normalise CRLF line endings in credential parsers ([634236a](https://github.com/satusdev/bedrock-forge/commit/634236a0fb14b4fe86fd96d5bbb63ffc44c160d2))
* **scripts:** make all local scripts robust to parent dir execution by resolving PROJECT_ROOT ([1d0a3a3](https://github.com/satusdev/bedrock-forge/commit/1d0a3a3f2d9d4bac77a0e6cb8d684ee7b372931e))
* **scripts:** robust path handling for site args, Docker Compose db service structure, and related improvements ([07e8da6](https://github.com/satusdev/bedrock-forge/commit/07e8da66ad06952fb83a5b7183b7d425259432f6))
* **scripts:** use PROJECT_ROOT for all project-relative paths in all scripts ([7fd9e58](https://github.com/satusdev/bedrock-forge/commit/7fd9e583c4cc2dc692e7887327813e21ffc28a38))
* **security:** remove CORS wildcard defaults, harden health endpoint and headers ([6e4f16d](https://github.com/satusdev/bedrock-forge/commit/6e4f16d74eedff57c977ac9bc5f541c341e08e2e))
* simplify Release Please configuration to resolve versionString.match error ([a71a2fd](https://github.com/satusdev/bedrock-forge/commit/a71a2fdb86dea92711a1995f7694079a58a1b97d))
* **site-init:** make new project self-contained and add usage README ([7305703](https://github.com/satusdev/bedrock-forge/commit/7305703ed3b1f3b54645b5a3dde2c8d480544b91))
* update deploy env ([3a35a7f](https://github.com/satusdev/bedrock-forge/commit/3a35a7f280b86729c17dbc89ff9ce66934bbeb4b))
* update local site creation ([86bf6b1](https://github.com/satusdev/bedrock-forge/commit/86bf6b1449659e84fa399254b8691da13c03a150))
* updates from grok ([077d17b](https://github.com/satusdev/bedrock-forge/commit/077d17bd01f4fc7b52bf572ee6e1824f980d6932))
* **web:** align UsersPage and AuditLogsPage with API response shapes ([db7fb33](https://github.com/satusdev/bedrock-forge/commit/db7fb337caaa131a51693b9aa4f2baccde8d39e4))
* **web:** fix destructive badge contrast in dark mode ([ef16681](https://github.com/satusdev/bedrock-forge/commit/ef16681322f715568c08199227e3e41f0162dd8a))
* **web:** token refresh mutex, websocket hardening, ErrorBoundary ([316b490](https://github.com/satusdev/bedrock-forge/commit/316b4902102b34efbddbce2b77dc9283e63dc036))
* **web:** use neutral text-foreground on badge variants; add info variant; add Bedrock Jobs dialog ([70d3056](https://github.com/satusdev/bedrock-forge/commit/70d30566e75aef4813019aa66c3c015df523dd0c))
* **worker/backup:** wipe docroot before restore; self-clean orphaned repeatable jobs ([8c85aaa](https://github.com/satusdev/bedrock-forge/commit/8c85aaa3a1cc22cbe575f334b21467f863126a5a))
* **worker/step-tracker:** include stderr and exit code in error log lines ([fd83497](https://github.com/satusdev/bedrock-forge/commit/fd834971bf1d640999857fa979d9b5fb6a3e87c4))
* **worker:** improve CyberPanel error handling and rollback local DB on failure ([3f777ca](https://github.com/satusdev/bedrock-forge/commit/3f777ca9fafdf6f016e6d841a8709c1258ae10c3))
* **worker:** pass explicit authTagLength to AES-256-GCM decipher ([6e89d3d](https://github.com/satusdev/bedrock-forge/commit/6e89d3d9cba49b6a78d5db63bbf786270f324640))


### Performance Improvements

* **worker:** cap BullMQ concurrency on all processors for CX23 ([6efa1ca](https://github.com/satusdev/bedrock-forge/commit/6efa1ca2b123f2db4a95f46fec8597bd97538a40))

## [2.0.0] - 2026-04-06

### Added

- **Server Management** — SSH key vault with AES-256-GCM encryption, CyberPanel
  auto-login, server scanning to bulk-import WordPress environments
- **Project & Client Management** — Clients, projects, tags, hosting packages,
  and support packages with full CRUD
- **Environment Management** — Production / staging per project, DB credential
  vault, environment scanning
- **Backup & Restore** — Full / DB-only / files-only backups via BullMQ queue,
  Google Drive upload via rclone, scheduled backups, restore from any backup
- **Plugin Scanning** — On-demand WordPress plugin scan, enable/disable/delete
  actions
- **Environment Sync** — Cross-server file + database sync via rsync / mysqldump
- **Uptime Monitoring** — Configurable interval, response time tracking, uptime
  percentage, alert logs
- **Domain WHOIS** — Expiry tracking, cached WHOIS data
- **Bedrock Provisioning** — Create fresh Bedrock WordPress + CyberPanel site
  via background job
- **Invoices & Billing** — Yearly invoice generation per project, status
  tracking
- **Slack Notifications** — Per-event channel subscriptions, delivery logs
- **Activity & Audit Logs** — BullMQ job trail + user action audit log
- **Dashboard** — Stats summary, recent job feed via WebSocket
- **Auth & RBAC** — JWT with refresh token rotation, 3-tier role system
  (admin/manager/client)
- **Reports** — Weekly summary report generation
- **Real-time Updates** — WebSocket gateway for live job progress streaming
- **Docker Deployment** — Single-command install via `install.sh`, Docker
  Compose with PostgreSQL + Redis

[2.0.0]: https://github.com/satusdev/bedrock-forge/releases/tag/v2.0.0
