# Social Stream Ninja Stream Deck Plugin

[![Status](https://img.shields.io/badge/status-template-f59e0b)](#status)
[![Stream Deck](https://img.shields.io/badge/Stream%20Deck-6.8%2B-00aeef)](#requirements)
[![SDK](https://img.shields.io/badge/SDK-v2-38bdf8)](https://docs.elgato.com/streamdeck/sdk/)
[![Runtime](https://img.shields.io/badge/runtime-Node%2020-22c55e)](#requirements)
[![Social Stream Ninja](https://img.shields.io/badge/Social%20Stream-Ninja-4a90e2)](https://socialstream.ninja/)

Starter workspace for a native Elgato Stream Deck plugin for Social Stream Ninja.

This is intentionally a template, not a finished release. It borrows the same plugin shape used by the VDO.Ninja Stream Deck work: official Stream Deck SDK, TypeScript source, generated icon assets, a property inspector, centralized command payload builders, and focused unit tests.

## Status

Current workspace capabilities:

- Connection Status action.
- Preset SSN Command action.
- Custom Command action.
- Global session/API configuration in the property inspector.
- WebSocket client for `wss://io.socialstream.ninja`.
- Optional HTTP fallback for simple request/response commands.
- A command registry seeded with common SSN commands from `../api.md`.
- Capability-aware SSApp source controls when Social Stream advertises SSApp support.

## Suggested Actions

| Action | Purpose | Starting commands |
| --- | --- | --- |
| Connection Status | Configure session ID and show API connection state | WebSocket send channel 1, listen channel 2 |
| SSN Command | Button presets for common remote controls and advertised SSApp source controls | `clearOverlay`, `nextInQueue`, `getQueueSize`, `drawmode`, `resetpoll`, `closepoll`, `selectwinner`, `startSource`, `stopSource` |
| Custom Command | Send any `{ action, target, value }` payload | Power-user and development testing |

## API Assumptions

Based on `../api.md`:

- WebSocket host: `wss://io.socialstream.ninja`
- HTTP host: `https://io.socialstream.ninja`
- Remote-control send channel: channel 1 by default
- Remote-control callback/capability listen channel: channel 2 by default
- Chat-listener channel: channel 4, if the user enables chat message relay
- Simple command shape: `{ "action": "clearOverlay" }`
- Value command shape: `{ "action": "sendChat", "value": "Hello" }`
- SSApp controls use the same Social Stream API socket; the plugin does not connect to SSApp directly.

## Requirements

- Stream Deck desktop app 6.8 or newer.
- Node.js 20+ for local development.
- Social Stream Ninja session ID with remote API control enabled.

## Development

```bash
cd plugin
npm install
npm test
npm run check
npm run build
npx @elgato/cli@latest validate ninja.socialstream.streamdeck.sdPlugin --no-update-check
```

Generated Stream Deck bundle:

```text
plugin/ninja.socialstream.streamdeck.sdPlugin/
```

Link locally:

```bash
cd plugin
npm run build
npx @elgato/cli@latest link ninja.socialstream.streamdeck.sdPlugin
npx @elgato/cli@latest restart ninja.socialstream.streamdeck
```

## Next Work

- Expand preset actions around queue, waitlist, poll, timer, overlay, and chat commands.
- Add live feedback from channel 4 for last message, message counts, and active platform.
- Add safer command grouping and second-press guards for destructive commands.
- Add README screenshots once a real Stream Deck profile exists.
