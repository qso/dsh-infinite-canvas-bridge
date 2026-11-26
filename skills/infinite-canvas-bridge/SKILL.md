---
name: infinite-canvas-bridge
description: Operate the embedded Infinite Canvas (v1.0+) side-by-side inside DeepSeek Harness. Use when the session working directory contains .infinite-canvas.json and the user wants to brainstorm, arrange nodes, inspect canvas selection/images, or trigger image/video/audio/text generation directly through canvas nodes.
---

# Infinite Canvas Bridge Workflow

You are collaborating with the user on a local persistent Infinite Canvas embedded directly in DeepSeek Harness. The user chats with you while watching the canvas update live.

## Core Loop

1. **Ensure canvas connection**:
   - Call `canvas_get_state` first.
   - If the canvas is not open or disconnected, call `canvas_open` to open the right-sidebar Infinite Canvas tab, then call `canvas_get_state`.
   - Default open resumes this session or creates its first blank canvas. Use explicit new or choose only when requested. A read-only preview requires a handoff from the current editor before tools can run.
   - Always remember `projectId` from `canvas_get_state` and pass it on subsequent calls so edits never land on the wrong canvas.

2. **Understand context & selection**:
   - When the user refers to "this", "selected nodes", or "these images", call `canvas_get_state({ selectedOnly: true })` and `canvas_get_nodes({ ids })`.
   - To place an image from this DSH chat, use canvas_list_references and pass its attachmentId to canvas_insert_media.
   - When you need to visually evaluate generated artwork or reference images, call `canvas_view_image({ nodeId })` or `canvas_view_image({ storageKey })`.

3. **Generate through canvas nodes (Node-First Generation)**:
   - Call `canvas_list_models({ capability })` before generating so you always pass valid configured model IDs (never guess model IDs).
   - Use `canvas_create_generation_flow` with `mode` (`text` | `image` | `video` | `audio`), `referenceNodeIds` (existing node or group IDs), and `autoRun: true` to create the visual flow and trigger generation directly via the canvas node.
   - For a dedicated music node, discover the backend music command with canvas_list_plugin_tools. Once submitted, poll generation_get_status by nodeId.
   - To re-run an existing node after updating its prompt or parameters, use `canvas_apply_ops` (`update_node` + `run_generation`).
   - `submittedNodeIds` means queued/submitted, NOT completed. Poll `generation_get_status({ nodeIds })` before reporting completion or retrying paid generations.

4. **Clean spatial layout**:
   - Use `canvas_create_text_nodes` for structured notes, scripts, and prompt cards.
   - Use `canvas_apply_ops` for batch edits (`add_node`, `update_node`, `move_nodes`, `group_nodes`, `connect_nodes`, `delete_node`, `set_viewport`).
   - Keep adequate spacing between newly placed nodes and group related shots or iterations using real `group_nodes` rather than text headers.
   - After modifying the canvas, concisely summarize which nodes were created, updated, connected, or triggered.
