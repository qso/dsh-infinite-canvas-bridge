# Changelog

All notable changes to `dsh-infinite-canvas-bridge` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- Remember each chat’s canvas selection, start new chats on a blank canvas by default, and offer an existing-canvas picker.
- Support per-canvas editor handoff and read-only previews on enhanced backends. Target the embedded page explicitly on stock v1.0.0.
- Verify workspace identity before reusing a server and report launch failures inside DSH.
- Import chat image attachments, return saved multimodal image blocks, and assemble the canvas instructions in DSH 0.2.2.

## [0.1.0] - 2026-11-26

### Added
- Folder-based persistent project mode via `.infinite-canvas.json` with automatic git-safe `.infinite-canvas/.gitignore`.
- Managed local Infinite Canvas v1.0+ process lifecycle supporting `local-repo` (`built` / `dev`), official `npx`, and `external` modes with dynamic port allocation and capability probing.
- Native DSH UI integration: right-sidebar persistent tab (`keepMounted: true`), composer quick-access chip, fullscreen view with single-host guard, and built-in backend settings modal.
- Conditional agent integration: 13 Infinite Canvas v1.0 built-in tools, `canvas_open`, `canvas_init_project`, dynamic canvas plugin tool forwarding, multimodal `canvas_view_image` rendering, `/canvas-init` slash command, and scoped `SKILL.md`.
- Automated Node.js test suite covering config normalization, folder scope resolution, process management, and bridge tool routing.
