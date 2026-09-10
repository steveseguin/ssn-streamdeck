# Connected Stream Deck validation — September 8, 2026

The connected Windows setup has Stream Deck host 7.5.0.22885 running the installed Social Stream Ninja plugin 0.2.3.10 under Elgato's bundled Node 20.20.0. Present Elgato USB/HID interfaces report OK. Existing profiles, button settings, session settings and plugin installation were not changed.

## Completed checks

- Copied the exact installed plugin to a temporary directory and ran `ssapp/tests/electron/streamdeck-plugin-e2e.js` with `SSN_STREAMDECK_BUNDLE` pointing to that copy. This prevents the test process from sharing installed plugin log files or altering the installed bundle.
- All 51 SSN presets and 13 supported desktop-source presets passed against isolated actual SSApp over both WebSocket and P2P. Five unsupported desktop commands refused execution as expected.
- Commerce Get State, Show, Next, Hide and Resume returned the expected selected product URL and scheduled/pinned/hidden state.
- Actual dock and featured pages passed queue, feature, clear and pinned-message workflows. API toggle behavior, legacy settings migration, iframe/P2P routing and credential redaction passed.
- The built plugin executable matched the installed executable by SHA-256. Runtime smoke under the actual Elgato Node 20.20.0 executable passed all 69 presets and five action types in English.
- Test channels and source pages were isolated fixtures. No real source channel, payment or user profile was used.

## Practical limits

These tests simulate Stream Deck protocol key/dial events. They do not prove that a physical key switch, knob, display or USB unplug/reconnect works. Windows device presence and the live host/plugin process were verified separately; test commands were not injected into the user's selected hardware profile.

The host has an existing September 7 warning that stored SSN global settings could not be decrypted. No credentials were inspected or changed, and the isolated configuration tests passed. If the installed Connection action requests setup again, re-enter its connection details rather than assuming a receiver or commerce failure.

No plugin fix or update was necessary for the tested commerce functionality. Commerce callbacks confirm SSN control state, not OBS scene/source visibility.

Local logs: `%TEMP%/ssn-deck-installed-e2e.log` and `%TEMP%/ssn-deck-hostnode-smoke.log`.
