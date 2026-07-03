# Social Stream Ninja Stream Deck Workspace

## Scope
- This folder is a self-contained native Stream Deck plugin starter for Social Stream Ninja.
- Do not edit parent Social Stream Ninja files from this workspace unless Steve explicitly asks. The only expected parent edit for this scaffold is adding `ssn-streamdeck/` to the parent `.gitignore`.
- Keep generated plugin output and dependency folders local to this directory.

## Product Direction
- Build a native Elgato Stream Deck plugin that controls Social Stream Ninja through the documented API in `../api.md`.
- Treat the Social Stream session ID as private. Do not hard-code or commit real session IDs.
- Default remote-control commands should target `io.socialstream.ninja`, send on channel 1, and listen for callbacks/capabilities on channel 2 unless a user explicitly configures another host/channel.
- Keep command definitions centralized in `plugin/src/api/command-registry.ts` so actions, presets, and docs stay aligned.

## Compatibility
- Stream Deck plugin code can use the official Stream Deck SDK and Node 20 runtime.
- Do not add runtime dependencies to the parent Social Stream Ninja app.
- Keep browser-facing Social Stream Ninja code outside this folder untouched unless Steve asks for integration work later.

## Good First Targets
- Add more command presets from `../api.md`.
- Add feedback from chat-listener channel 4 for live message counts and last-message titles.
- Add Stream Deck + dials for timer, poll, or queue-style numeric controls once the command semantics are confirmed.
