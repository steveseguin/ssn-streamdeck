# Stream Deck 0.2.3.10 release validation

Tested September 7, 2026. No release-blocking plugin issue was found in the checks below. This supports releasing the plugin with the stated compatibility requirements; it is not a claim that every physical device or destination website was tested.

## Artifact and installed host

The downloadable `v0.2.3.10` GitHub release was extracted into an isolated QA directory and tested without rebuilding its executable code. Its manifest and starter profile versions match. The pinned Elgato CLI 1.9.0 validated the package successfully. All eight packaged locale catalogs contain the commerce controls.

The previous installed 0.2.2 plugin was backed up. The released 0.2.3.10 files were installed and byte-verified, then restarted through the Elgato CLI. The real Windows Stream Deck host launched the plugin using its bundled Node 20.20.0 runtime with version 0.2.3.10 in its launch metadata. Existing user profiles and session settings were not edited.

The release workflow also passed Windows, macOS and Linux verification before publishing. Those CI runs do not substitute for a manual macOS Stream Deck host check.

## Coverage

| Area | Result and scope |
| --- | --- |
| Packaged command inventory | All 69 presets and five action types passed runtime event/feedback checks in eight languages. |
| Real SSApp integration | All 51 SSN presets and 13 supported desktop-source presets passed routing through the running Electron app over both WebSocket and P2P. Five unsupported desktop presets correctly refused execution. |
| Dock and featured overlay | Actual `dock.html` and `featured.html` in SSApp: seed and queue a message, query queue size, feature the next message, clear the visible overlay, pin a message, and feature the next pinned message through plugin presses. Clear was verified by the overlay's rendered opacity, since it retains hidden DOM content. |
| Commerce | Show/Next/Hide/Resume and Get Product State passed against actual saved SSApp products, with selected URL and scheduled/pinned/hidden state assertions. Both transports exercised the commands. |
| Desktop sources | List/get/add/update/remove, start/stop/restart, mute, visibility, and connection mode; actual isolated source lifecycle and credential redaction passed. |
| Setup and compatibility | Connection testing, API enable/disable, legacy settings migration, P2P while the remote API toggle is off, and iframe/P2P routing passed. |
| Timer and chat actions | Timer dial gestures, chat review gestures, selection stability, bounded chat buffer, query feedback, custom commands, and action settings passed. Fake key/dial events drive the released plugin; no physical knobs were operated. |
| Credits, chat, waitlist, polls and map | Preset dispatch through actual SSApp handlers passed. Credits snapshots, outgoing-chat payloads and waitlist download invocation were asserted. Outgoing chat/download destinations were intercepted; rendered credits, poll and map presentations were not individually reviewed. |
| Inspector UI | Released HTML rendered in isolated SSApp Electron windows. All 69 advertised presets, five settings panels and eight languages passed selection/layout checks at 350 px. Product selection/refresh, saved action values, timer settings, session-link/password import, ID masking and private diagnostics passed. Host settings messages used a local fixture. |
| Real network transport | Eight live P2P tests passed: ordered bursts, 64 KiB payload, client/publisher signaling loss, forced TURN relay, wrong/correct password, transport switching, absent publisher timeout, and repeated connect/disconnect. All sessions were synthetic. |
| Packaged P2P | The released executable passed command delivery, chat feedback, and signaling recovery over the production signaling service using an isolated session. |
| Wake and error behavior | Packaged runtime checks exercised wake/reconnect of command and chat channels. Supporting tests covered request timeouts, HTTP fallback, stale callbacks, rapid presses, confirmations and Multi Actions. |
| Supporting checks | 133 unit tests, TypeScript check, starter profile validation, and Elgato bundle validation passed. `npm audit --omit=dev` reported zero known vulnerabilities at test time. |

## Remaining limits

- Physical Stream Deck keys, knobs, touch strip, USB disconnect and actual OS sleep/resume were not manually operated. Their protocol events and wake notifications were exercised.
- macOS had CI validation; no manual macOS host installation was performed in this Windows session. The minimum supported Stream Deck 6.9 host was not separately installed.
- The actual Chrome extension runtime and every live chat/payment provider were not retested here. SSApp integration used isolated data and source pages. No messages were posted to real channels and no orders or payments were made.
- Settings-panel layout checks were automated in Electron, not a manual visual review of every language in Stream Deck's Qt inspector. Screenshot capture was unavailable in that isolated runtime; no unreviewed screenshots were added to the guide.

## Repeating the checks

From `plugin/`, use `npm test`, `npm run check`, `npm run test:runtime`, `npm run test:p2p:live`, and `npm run test:p2p:runtime-live`. The two live suites create their own test sessions.

For a published artifact, unpack it into a temporary plugin directory alongside the test scripts, source registry and dependencies. Copy its released manifest to the test directory's `manifest.json` so the profile validator compares against the stamped release version. Do not rebuild or clean the installed plugin directory while Stream Deck is using it.

The optional `scripts/property-inspector-ssapp.cjs` requires local Playwright and the sibling SSApp checkout. Set `SSAPP_REPO` if needed and `SSN_STREAMDECK_BUNDLE` to the extracted `.sdPlugin` directory. This helper does not ship in the plugin.

The sibling SSApp tests are `tests/electron/streamdeck-plugin-e2e.js` and `tests/electron/streamdeck-bridge-e2e.js`. The plugin test now accepts `SSN_STREAMDECK_BUNDLE`, includes the commerce command inventory, and verifies the real dock/featured views before its exhaustive transport matrix. The plugin inspector test and this report are included in the subsequent 0.2.4 release source. The sibling SSApp test additions remain in the SSApp checkout; they are not part of the plugin package.
