# Stream Deck, Event Flow and API review — 10 September 2026

Named workflows now work through the Stream Deck plugin, WebSocket, hosted HTTP POST/GET and P2P. Functional tests exercised the actual SSApp editor, database, background transport and workflow execution, ending in real HTTP requests to a local receiver. The updated development plugin was built and reloaded in Steve's existing linked install.

## What was fixed

| Finding | Result |
| --- | --- |
| Event Flow had no discoverable, named public workflow command. The existing `eventFlowEvent` route served internal/OBS bridge events. | Added the **Run from Stream Deck / API** trigger, disabled starter template, `getWorkflowTriggers`, `triggerWorkflow`, capability descriptors and callback errors. Existing bridge events retain their behavior. |
| Stream Deck could not browse callable flows. | Added **Run Workflow** and **List Workflows** presets, workflow icons, an enabled/saved-flow picker and count feedback. The picker preserves missing selections and custom data instead of choosing another workflow. |
| A webhook containing only nested template variables sent the placeholders literally. | Corrected the webhook placeholder detection to match the existing nested-variable renderer. Actual HTTP receiver tests verify supplied values and JSON encoding. |
| The timer hint did not distinguish dial holds from touchscreen holds. | Added a second on-device hint, explicit inspector instructions in all eight locales and illustrated gesture cards. Turning while pressing the dial uses six times the configured step; holding the touchscreen resets. |
| New Spotify/TTS volume actions showed defaults that were absent from their saved configuration. Spotify also displayed zero as 50. | New nodes now store 50/100 respectively. Spotify displays and preserves zero through editor save/reload. Existing unrelated settings are unchanged. |
| The icon contact sheet did not explain commands or values. | Added an offline guide containing all 77 preset names, icons, API IDs, required-value labels and defaults, generated from the command registry during builds. |
| API reference timer examples described an unsupported named-timer model. | Updated examples to the shared SSN timer and actual callback shape, seconds values, confirmed resets and dial gestures. |

## Inventory reviewed

| Surface | Coverage |
| --- | --- |
| Stream Deck action types | Setup, Preset Command, Custom Command, Timer Dial, Chat Review; all five exercised in runtime checks. |
| Preset catalogue | 77 commands, 75 distinct icons; all presets exercised in each of eight runtime locales. Waitlist-message aliases intentionally share an icon. Waitlist winner and managed-giveaway draw share a trophy motif but distinct titles/actions. |
| Event Flow triggers | All 45 palette entries across nine groups: API, stream events, OBS, chat, message properties, user/source, timing/voice, MIDI, advanced/custom code. |
| Event Flow actions | All 67 palette entries across nine groups: message processing, integrations, media, OBS, Spotify, TTS, MIDI, user memory, state control. |
| Logic/state | Five logic and four state nodes, including the distinction between a Rate Limiter cooldown and a Delay action. |
| Editor wiring | Palette definitions checked against runtime handlers and property panels; every advertised entry has a handler and panel. Optional configuration and no-setting actions were distinguished from missing defaults. |
| Integrations | Documented destination/setup requirements for Flow Actions, OBS, dock/featured messages, webhooks, source replies, products, giveaways/points, TTS, Spotify, printing and MIDI. |
| Controls and feedback | Single press, dial down/up/rotation, held rotation, tap/hold, query titles, connection state, two-press credits reset, confirmed payloads, Multi Action ordering and capability gating. |

The [workflow guide](https://socialstream.ninja/beta/docs/streamdeck-event-flow.html#palette) includes the complete Event Flow palette reference. The [offline control guide](../plugin/ui/guide.html#catalog) includes every Stream Deck command and icon.

## Functional validation

`tests/streamdeck-workflow-ssapp.e2e.cjs` uses the real SSApp Electron runtime with a separate temporary profile and hidden windows. It uses fictional data and a loopback HTTP receiver. With `--live-transports`, only an ephemeral test session uses the hosted SSN HTTP/signaling services.

Passed:

- Import the actual disabled template, edit its trigger field, enable, save, reopen and reload flows from the database.
- Create both volume nodes without touching the sliders; persist their defaults; save/reopen Spotify volume zero.
- Fresh packaged plugin SDK key event → actual SSN WebSocket → saved workflow → HTTP receiver with the supplied nested values.
- Discovery through the real plugin inspector service, workflow-count title and successful/failed key feedback.
- Three repeated presses create three separate effects; unrelated chat flows do not execute.
- Unversioned API requests and JSON-string values, missing names, disabled flows and malformed data.
- A delayed workflow acknowledges acceptance before completing its later HTTP request.
- Hosted HTTP POST and URL-encoded GET execute the same saved workflow and deliver the expected data.
- Actual plugin P2P connection executes the workflow while SSN's remote WebSocket API is disabled.
- Real packaged inspector HTML: workflow selection, preserving missing targets and custom data, all eight locales, narrow layout and readable controls.
- Both guides rendered in hidden Electron; 77 catalogue icons loaded, narrow layouts fit, and offline guide light/dark rendering was visually inspected. Local guide links resolve.

Latest full transport run artifacts: `C:\Users\steve\AppData\Local\Temp\ssn-workflow-e2e-OUAegX`.
Latest additional public-guide/layout run artifacts: `C:\Users\steve\AppData\Local\Temp\ssn-workflow-e2e-igHFql`.

Supporting checks: 139 plugin tests passed, TypeScript checks and build passed, starter profiles passed V3 validation, and runtime checks passed for all 77 presets/five actions in all eight locales. Focused parent-repo checks passed (31 reported tests, including standalone scripts containing their own assertions). A broader 84-test run passed 83; the unrelated existing Kick badge test fails because its VM harness strips `export` but does not handle the module's `import`. Kick source/test behavior was not changed for this task.

Physical-device coverage from the preceding session remains recorded in [the hardware report](physical-device-validation-2026-09-09.md): queue advancement, timer rotation, push/pause, held rotation, touchscreen reset and reconnect. The new workflow was exercised with SDK key events in the functional suite; Steve was not asked to repeat every command physically.

## Scope and remaining limits

- A named call selects only saved, enabled flows with that exact trigger. All normal conditions/branches inside those selected flows still apply. Ordinary chat cannot forge the named-trigger authority. Separate unrelated automations into separate flows.
- Acceptance is not external completion. Repeated requests may overlap; there is no execution-status queue or automatic retry guarantee. A Rate Limiter can suppress closely spaced runs.
- No live OBS broadcast, real chat post, payment, Spotify playback, physical printer job or external MIDI action was executed. Those providers/devices still require their own connection and output checks; inventory/runtime checks do not establish live compatibility for every service.
- Electron global flags, profiles, authentication, source behavior and the local SSApp AI/MCP API were not changed. The only general Event Flow runtime correction is recognition of nested variables in webhook JSON string values.
- The existing plugin junction was verified and backed up before rebuilding. Elgato's [stop](https://docs.elgato.com/streamdeck/cli/commands/stop/) and [restart](https://docs.elgato.com/streamdeck/cli/commands/restart/) commands reloaded the local plugin; the new process runs under Elgato's bundled Node 20.20.0. The installed build matches the tested build after normalizing bundler dependency-path labels.
- Reopen SSApp, or reload the development extension, to load the changed Social Stream editor/API assets. The current production host may not advertise the new commands until those assets are published. No commit, push, release or website publication was performed.

Start with **Event Flow → template: Stream Deck / API button**, save and enable it, then **Stream Deck → Preset Command → Run workflow → Refresh workflows**. Use the [workflow guide](https://socialstream.ninja/beta/docs/streamdeck-event-flow.html) for the complete setup.
