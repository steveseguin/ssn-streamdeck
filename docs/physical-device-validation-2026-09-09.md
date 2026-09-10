# Physical Stream Deck validation — September 9, 2026

The installed Social Stream Ninja plugin 0.2.4.0 passed the physical workflows below on Steve's Stream Deck +. Steve operated the keys, dial and touchscreen; command logs and the actual SSApp receiver state verified the results.

## Environment

- Stream Deck host 7.5.0.22885, bundled Node 20.20.0, Windows.
- The installed plugin is linked to this workspace's generated bundle. Both executable hashes matched: `A050B3AF149162DED6630F22EB5495DCD0AFF152E863327DBC3C1E5FE916FAA5`.
- Actual SSApp 0.4.28, launched in a separate temporary profile with the local Social Stream source, actual dock and featured pages, a loopback WebSocket relay and three synthetic queued messages.
- Existing device assignments were used: Next in queue at key column 0, row 1; Setup at column 3, row 1; Timer Dial at encoder column 3. No profiles or action assignments were replaced.
- The plugin initially had no session configured. It was temporarily connected to the isolated receiver. No real chat channel or outgoing chat destination was used.

## Physical results

| Input | Verified result |
| --- | --- |
| Next in queue, once | Exactly one command; message 1 rendered in the featured overlay at opacity 1; queue count changed from 3 to 2. |
| Clockwise dial rotation, one tick | Exactly one `timeradd` with value 10; paused timer changed from 5:00 to 5:10. Steve confirmed 5:10 on the device. |
| Dial push, wait, push again | Exactly two `toggletimer` commands; countdown ran for 4.296 seconds and paused at 305,704 ms. Steve confirmed the displayed 5:05. |
| Hold dial down, rotate clockwise one tick, release | Exactly one `timeradd` with value 60; timer changed to 365,704 ms and stayed paused. No unwanted toggle was sent on release. Steve confirmed 6:05. |
| Hold touchscreen above timer dial | Exactly one confirmed `resettimer`; timer returned to 300,000 ms and remained paused. Steve confirmed 5:00. |
| Next in queue after receiver reconnection | Exactly one additional command; message 2 rendered in the featured overlay; queue count changed from 2 to 1. |

For the reconnection check, the isolated SSApp background and dock WebSockets were closed. Both created new open connections automatically within approximately 203 ms, preserving the queue. This exercises receiver reconnection, not a physical USB disconnect or a dropped plugin-side connection.

## Supporting checks

- 136 unit checks passed; eight optional live P2P checks were skipped.
- TypeScript checking and starter-profile validation passed.
- Packaged runtime smoke passed all 75 presets and five action types in English under Elgato's actual Node 20.20.0 executable. Those protocol events were simulated and are separate from the physical results above.

## Cleanup and limits

The temporary session was cleared; connection mode, host and TLS were returned to their original settings. The isolated receiver and relay were shut down. Existing source changes were left untouched; no plugin fix was needed.

This run did not exercise physical counterclockwise rotation, Chat Review, every preset on hardware, USB reconnect, OS sleep/wake, macOS, or the P2P transport. Earlier reports describe separate integration coverage and should not be read as physical coverage from this run.

Local harness and logs: `plugin/node_modules/.cache/physical-qa-20260909/` (ignored generated files; not part of the plugin).
