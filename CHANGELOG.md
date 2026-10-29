# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-10-29

### Added

- `upload_attachment` tool: uploads a local file and attaches it to an issue.
- `list_time_entries` tool: lists time entries filtered by issue, project, user (`"me"`) and date range.
- `update_time_entry` tool: changes hours, activity, comment, date or issue of a time entry.
- `delete_time_entry` tool: deletes a time entry.
- `cancel_timer` tool: discards a running timer without logging time.
- Optional `hours` parameter in `stop_timer` to log a value other than the elapsed time.
- `REDMINE_DEFAULT_ACTIVITY_ID` environment variable.
- Test suite with `node:test` (`npm test`).

### Changed

- `log_time`, `stop_timer` and `create_or_update_issue` resolve a missing `activity_id` from `REDMINE_DEFAULT_ACTIVITY_ID`, then from Redmine's default activity. If neither exists they return an error that lists the available activities instead of failing with HTTP 422.
- `zod` is now declared in `dependencies`.
- `bin` path normalized to `index.js`.

## [1.2.6] - 2026-10-29

### Changed

- `repository`, `homepage` and `bugs` in `package.json` point to the GitHub repository.

## [1.2.5] and earlier

Published to npm before this repository existed. No changelog was kept.

[1.3.0]: https://github.com/IOSolutions-IT/Redmine-MCP-Server/compare/v1.2.6...v1.3.0
[1.2.6]: https://github.com/IOSolutions-IT/Redmine-MCP-Server/releases/tag/v1.2.6
