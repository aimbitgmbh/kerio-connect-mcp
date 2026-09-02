# Changelog

All notable changes to this project are documented in this file. The project
follows [Semantic Versioning](https://semver.org/).

## [0.2.1] - 2026-09-02

### Added

- Opt-in live compatibility test for OpenAI-compatible tool-calling models.
- Regression coverage for Qwen-style serialized number, boolean, and array
  arguments.

### Changed

- Made MCP tool execution tolerant of unambiguously double-serialized JSON
  values while retaining strict Zod validation for invalid values.
- Optimized shared-calendar tool descriptions so owner-qualified selectors such
  as `Timon/Team` are preserved by Qwen 3.8 27B.
- Updated the documented primary test model from gpt-oss:20b to Qwen 3.8 27B.

## [0.2.0] - 2026-09-01

### Added

- Discovery of personal, shared, remote, and public Kerio calendars.
- Unambiguous calendar selection by owner/name, owner email/name, or folder ID.
- Regression tests for calendar discovery, deduplication, API fallbacks, and
  duplicate calendar names.
- Continuous integration for Node.js 18, 20, and 22.

### Changed

- Updated runtime and development dependencies within compatible version ranges.
- Synchronized the MCP server and Kerio client version with the npm package
  version at runtime.
- Added explicit diagnostics when optional shared or public folder APIs are
  unavailable while preserving personal-calendar fallback behavior.

### Security

- Updated the dependency lockfile to resolve all reported npm audit findings.

## [0.1.0] - 2026-01-08

- Initial public release of the Kerio Connect MCP server.

[0.2.1]: https://github.com/aimbitgmbh/kerio-connect-mcp/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/aimbitgmbh/kerio-connect-mcp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/aimbitgmbh/kerio-connect-mcp/releases/tag/v0.1.0
