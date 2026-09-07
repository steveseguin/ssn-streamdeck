# Social Stream Remote Control API

This document is the single source of truth for how the Stream Deck plugin should call Social Stream Ninja and how `social_stream` routes SSN and SSApp control commands.

## Scope and intent

- Define current callable command surface for Stream Deck.
- Explain message format and channel routing.
- Document how requests are built and handled by the plugin client today.
- Define a v1-compatible API contract for SSApp source control through `social_stream`.

## Non-negotiable routing contract

`social_stream` is the single API router and this is mandatory.

- All clients connect to `social_stream`.
- `social_stream` receives every command, validates it, and decides route:
  - SSN action: handled by Social Stream extension handlers.
  - SSApp action: handled through the SSApp bridge when `social_stream` is running inside SSApp.
  - both: executed in both surfaces where defined by contract.
- `social_stream` preserves command shape and correlation fields when forwarding.
- All responses and events are emitted back through `social_stream`.
- Stream Deck only uses the `social_stream` API.
- The SSApp bridge is an internal implementation detail of `social_stream`.

## Capability Advertisement

`social_stream` publishes runtime capabilities through the same Stream Deck connection.

- After connect, Stream Deck requests capabilities with `getCapabilities`.
- `social_stream` returns the capability packet through the normal callback path when the request includes `get`.
- Capabilities include SSApp availability and SSApp-specific command support.
- In SSApp, `available` is true and the SSApp command surface is listed.
- Outside SSApp, `available` is false and SSApp command support is empty or false.
- Stream Deck uses the advertised capabilities as the source of truth for which actions to show.
- Stream Deck still sends every command to `social_stream`.
- The SSApp capability object is projected by `social_stream` for remote use. SSApp's broader local API and internal bridge capabilities are not the Stream Deck contract.

```json
{
  "type": "capabilities",
  "version": 1,
  "runtime": "electron",
  "ssapp": {
    "available": true,
    "runtime": "electron",
    "version": "1.0.0",
    "appControls": false,
    "sourceControls": {
      "list": true,
      "get": true,
      "add": true,
      "remove": true,
      "update": true,
      "start": true,
      "stop": true,
      "restart": true
    },
    "bulkControls": {},
    "visibility": {
      "get": true,
      "set": true,
      "toggle": true
    },
    "mute": {
      "get": true,
      "set": true,
      "toggle": true
    },
    "connectionMode": {
      "get": true,
      "set": true,
      "values": ["classic", "websocket", "tiktok-websocket", "tiktok-legacy"]
    },
    "sourceStatus": {
      "get": true,
      "values": ["inactive", "activating", "active", "error"]
    },
    "settings": false
  },
  "ssn": {
    "actions": {
      "nextInQueue": true,
      "clearOverlay": true,
      "getQueueSize": true,
      "sendChat": true,
      "sendEncodedChat": true,
      "drawmode": true,
      "pin": true,
      "unpin": true,
      "nextPinned": true,
      "resetwaitlist": true,
      "selectwinner": true,
      "removefromwaitlist": true,
      "highlightwaitlist": true,
      "stopentries": true,
      "startentries": true,
      "openentries": true,
      "resumeentries": true,
      "waitlistmessage": true,
      "setwaitlistmessage": true,
      "downloadwaitlist": true,
      "resetpoll": true,
      "closepoll": true
    }
  }
}
```

When `social_stream` is not running inside SSApp:

```json
{
  "type": "capabilities",
  "version": 1,
  "runtime": "web",
  "ssapp": {
    "available": false,
    "runtime": null,
    "version": null,
    "sourceControls": {},
    "bulkControls": {},
    "visibility": false,
    "mute": false,
    "connectionMode": false,
    "sourceStatus": false,
    "settings": false,
    "platforms": {}
  }
}
```

## Routing rules (hard requirements)

1. Resolve by action scope metadata in `social_stream`.
   - `scope: "ssn"` routes only to SSN handlers.
   - `scope: "ssapp"` routes only to the SSApp bridge.
   - `scope: "both"` executes both paths when required.
2. Fallback rules when scope is missing:
   - `target === "ssapp"` routes to SSApp.
   - `action` prefixed `ssapp.` routes to SSApp.
   - all other commands route to SSN.
3. Route decisions must not depend on the caller.
4. If a command requires SSApp and `ssapp.available` is false, return `SSAPP_UNAVAILABLE`.
5. If a command requires an advertised SSApp sub-capability that is false or missing, return `UNSUPPORTED_ACTION`.

```json
{
  "action": "startSource",
  "value": "source-id",
  "apiid": "SESSION_ID",
  "get": "source-start-1"
}
```

is routed to SSApp by scope/fallback.

```json
{ "action": "nextInQueue", "apiid": "SESSION_ID" }
```

is routed to SSN by scope/fallback.

## Core surface by module

### Stream Deck plugin (`ssn-streamdeck`)

Current shipped capabilities:

- `Connection Status` action:
  - reads and saves global settings.
  - shows `SSN Online/Offline/Setup`.
- `SSN Command` action:
  - prebuilt dropdown list using command registry.
  - sends one normalized payload per press.
- `Custom Command` action:
  - sends arbitrary `{ action, target, value }` for quick testing.
- Global settings:
  - `sessionId`, `apiHost`, `useTls`, `httpFallback`, `inChannel`, `outChannel`, `requestTimeoutMs`.

Current plugin command coverage:

- `nextInQueue`
- `clearOverlay`
- `getQueueSize`
- `sendChat`
- `sendEncodedChat`
- `pin`
- `unpin`
- `nextPinned`
- `drawmode`
- `removefromwaitlist`
- `highlightwaitlist`
- `resetwaitlist`
- `stopentries`
- `startentries`
- `waitlistmessage`
- `downloadwaitlist`
- `selectwinner`
- `resetpoll`
- `closepoll`
- advertised SSApp source commands when available:
  - `getSources`, `getSource`
  - `addSource`, `updateSource`, `removeSource`
  - `startSource`, `stopSource`, `restartSource`
  - `setSourceVisibility`, `toggleSourceVisibility`
  - `setSourceMute`, `toggleSourceMute`
  - `setSourceConnectionMode`

The command registry is a capability-gated superset for compatibility. Definitions for local-only or legacy commands are hidden when their capability is not advertised, and `social_stream` rejects attempts to send them remotely.

### Social Stream Ninja extension/API (`social_stream`)

Observed action handlers support more than the plugin currently exposes:

- Queue: `nextInQueue`, `getQueueSize`, `clear`, `clearAll`
- Chat/message: `sendChat`, `sendEncodedChat`, `blockUser`, `extContent`, `autoShow`
- Waitlist: `resetwaitlist`, `selectwinner`, `removefromwaitlist`, `highlightwaitlist`, `stopentries`, `startentries`, `openentries`, `resumeentries`, `waitlistmessage`, `setwaitlistmessage`, `downloadwaitlist`
- Poll: `loadpoll`, `setpollsettings`, `getpollpresets`, `createpoll`, `resetpoll`, `closepoll`
- Timer: `starttimer`, `pausetimer`, `toggletimer`, `resettimer`, `timeradd`, `timersubtract`, `settimer`, `gettimerstate`
- Runtime state: `drawmode`, `emoteonly`, `getHype`

### Remote SSApp command surface

- Source list/status/control for the SSApp runtime:
  - `getSources`, `getSource`
  - `addSource`, `updateSource`, `removeSource`
  - `startSource`, `stopSource`, `restartSource`
  - `setSourceVisibility`, `toggleSourceVisibility`
  - `setSourceMute`, `toggleSourceMute`
  - `setSourceConnectionMode`

Bulk source operations, SSApp settings, and app lifecycle operations are local-only. They remain available to same-machine automation through SSApp's local `/api/v1` and MCP interfaces but are not advertised or accepted through the Stream Deck remote route.

## Core message structures

### Global settings

Stored under Stream Deck plugin global settings:

```ts
{
  sessionId: string,           // required to connect
  apiHost: string,             // default io.socialstream.ninja
  useTls: boolean,             // default true
  httpFallback: boolean,       // default true
  inChannel: number,           // default 2 (callback/capability listen channel)
  outChannel: number,          // default 1 (plugin currently defaults to 1)
  requestTimeoutMs: number      // default 5000
}
```

### Command payload from plugin

```ts
{
  action: string;               // required
  apiid?: string;               // set by client
  target?: JsonValue;
  value?: JsonValue;
  tabId?: number;               // optional exact source routing for chat
  get?: string;                 // for async callback correlation
}
```

### Source model (SSApp)

```ts
{
  id: string,
  target: string,
  tabId: number | null,
  username: string,
  videoId: string,
  connectionMode: "classic" | "websocket" | "tiktok-websocket" | "tiktok-legacy",
  activeConnectionMode: "classic" | "websocket" | "tiktok-websocket" | "tiktok-legacy" | null,
  status: "inactive" | "activating" | "active" | "error",
  isVisible: boolean,
  isMuted: boolean,
  autoActivate: boolean,
  groupId?: string
}
```

Source URLs stay inside SSApp and must not be returned over the session WebSocket. Stream Deck stores `id`, then refreshes `getSource` when a key is pressed so a restarted source's new `tabId` is used.

## Data handling model in plugin code

### Parsing and normalization rules

Message presets (`sendChat`, `sendEncodedChat`, `waitlistmessage`, and `setwaitlistmessage`) preserve their values as text, including literal `false`, `null`, and JSON text. Other controls and custom commands keep the existing normalization:

- `true`, `false`, `null` become booleans/null.
- JSON-looking strings parse into objects/arrays.
- Numeric and numeric-like text stay text unless JSON parse applies.
- Preset commands can define default values (`sendChat`, `drawmode`, etc.).

`buildSsnCommandPayload` and `buildCustomCommandPayload` both create `SsnCommandPayload` from settings and attach only fields that are present.

### Message flow

1. Plugin starts and reads global settings.
2. On valid `sessionId`, it uses the selected transport:

- P2P (default): join the session room, view the session's data-only publisher, and advertise the `streamdeck` label.
- WebSocket: open the hosted relay and send:

```json
{ "join": "SESSION_ID", "in": IN_CHANNEL, "out": OUT_CHANNEL }
```

3. On `action` press:

- action payload is built from settings.
- `apiid` is injected with the current `sessionId`.
- command is sent over the selected P2P or WebSocket transport.
- in WebSocket mode only, if no socket and fallback is allowed, command is sent via HTTPS path.
- success shows green `OK`, failure shows red `Alert`.

4. Incoming messages from the selected transport are stored as `lastMessage` in session state; WebSocket text is parsed as JSON when possible.
5. The client reconnects after transport loss or system wake and periodically refreshes capabilities so SSN/SSApp restarts are detected.

Connection tests also verify HTTP fallback when a WebSocket handshake fails, if fallback is enabled. Responses from an earlier connection cannot change the current connection's state or capabilities.
6. Support diagnostics expose only versions, connection state, runtime, protocol, and a sanitized error; they never include the session ID.

### Current limitations worth calling out

- Chat Review is available on Stream Deck + encoders; key-only devices do not show the recent-chat browser.
- Generic SSN requests use the first matching callback; capability and SSApp requests additionally reject unrelated same-channel replies.
- `requestTimeoutMs` is enforced for P2P/WebSocket callbacks and HTTP fallback requests.

## Transport and endpoint behavior

### Client transport

- P2P: `wss://wss.socialstream.ninja` signaling plus a direct WebRTC data channel
- WebSocket: `wss://io.socialstream.ninja`
- HTTP: `https://io.socialstream.ninja`
- The same `{ action, target, value, get, apiid }` payload shape is used for commands.
- Stream Deck sends commands to `social_stream` over the selected P2P or WebSocket path.
- SSApp routing happens inside `social_stream`; it is not a Stream Deck transport.

### Channel routing

Recommended defaults:

- Control sender/listener: `out:1`, `in:2`
- Optional chat/feed listener: `in:4`

Plugin defaults are currently `inChannel=2`, `outChannel=1` for callback/capability reliability.

## HTTP fallback request shape

For ordinary commands, the client builds a GET request:

```text
/{SESSION_ID}/{action}/{target}/{value}
```

Segments are URL encoded and values use string conversion with `null` as text for missing fields.

Example:

```text
https://io.socialstream.ninja/my-session/resetpoll
```

```text
https://io.socialstream.ninja/my-session/sendchat/twitch/hello%20deck
```

Commands with additional fields, such as `tabId` for a selected chat source, use a JSON POST to `/{SESSION_ID}` so the full payload is preserved. Both GET and POST include `?channel=...` when the configured send channel differs from the default channel 1.

JSON responses are checked for structured errors regardless of `awaitResponse`. Successful responses retain the existing return format: parsed JSON when `awaitResponse` is enabled, otherwise response text.

## Request/response patterns

### Command-only success

Most commands are fire-and-forget and may return no payload.

### Callback-style (if available)

If a command includes `get`, listeners expect:

```json
{
  "callback": {
    "get": "token-123",
    "result": { "running": true, "secondsLeft": 120 }
  }
}
```

### Event-style push from pages/components

The extension and related pages emit state-like payloads as normal messages:

- `{ "queueLength": 3 }`
- `{ "hype": 7 }`
- `{ "event": "viewer_updates", "meta": { "youtube": 815, "twitch": 221 } }`

### Normalized response envelope

Commands that return a structured response should use:

```json
{
  "ok": true,
  "request": "token-123",
  "payload": { "status": "running" }
}
```

Structured errors should use:

```json
{
  "ok": false,
  "request": "token-123",
  "error": {
    "code": "INVALID_TARGET",
    "message": "missing source id"
  }
}
```

### Required error codes

Errors should be stable strings so Stream Deck can render predictable feedback:

| Code | Meaning |
| --- | --- |
| `SSAPP_UNAVAILABLE` | Command requires SSApp but `ssapp.available` is false. |
| `SOURCE_NOT_FOUND` | Command references a source ID that does not exist. |
| `UNSUPPORTED_ACTION` | Command is not supported by the advertised capability packet. |
| `INVALID_TARGET` | Command has a missing or invalid target/value. |

## Core action matrix with request examples

### Queue and overlay

- `nextInQueue`:

```json
{ "action": "nextInQueue", "apiid": "SESSION_ID" }
```

- `clearOverlay`:

```json
{ "action": "clearOverlay", "apiid": "SESSION_ID" }
```

- `getQueueSize`:

```json
{ "action": "getQueueSize", "get": "queue-1", "apiid": "SESSION_ID" }
```

Expected event:

```json
{ "queueLength": 3 }
```

### Chat

- `sendChat`:

```json
{ "action": "sendChat", "value": "hello", "apiid": "SESSION_ID" }
```

- `sendChat` for one target:

```json
{ "action": "sendChat", "target": "twitch", "value": "hello", "apiid": "SESSION_ID" }
```

- `sendChat` for one open SSApp source:

```json
{ "action": "sendChat", "target": "twitch", "tabId": 42, "value": "hello", "apiid": "SESSION_ID" }
```

- `sendEncodedChat`:

```json
{ "action": "sendEncodedChat", "value": "<b>Hi</b>", "apiid": "SESSION_ID" }
```

- `blockUser`:

```json
{ "action": "blockUser", "value": "bad_user", "apiid": "SESSION_ID" }
```

### Waitlist

- `selectwinner`:

```json
{ "action": "selectwinner", "value": 1, "apiid": "SESSION_ID" }
```

- `resetwaitlist`:

```json
{ "action": "resetwaitlist", "apiid": "SESSION_ID" }
```

- `removefromwaitlist`:

```json
{ "action": "removefromwaitlist", "value": 1, "apiid": "SESSION_ID" }
```

- `highlightwaitlist`:

```json
{ "action": "highlightwaitlist", "value": 1, "apiid": "SESSION_ID" }
```

- `stopentries`:

```json
{ "action": "stopentries", "apiid": "SESSION_ID" }
```

- `startentries`, `openentries`, and `resumeentries`:

```json
{ "action": "startentries", "apiid": "SESSION_ID" }
```

- `waitlistmessage` and `setwaitlistmessage`:

```json
{ "action": "waitlistmessage", "value": "Type !join to enter!", "apiid": "SESSION_ID" }
```

- `downloadwaitlist`:

```json
{ "action": "downloadwaitlist", "apiid": "SESSION_ID" }
```

### Poll

- `loadpoll`:

```json
{ "action": "loadpoll", "value": { "question": "Pick one", "options": ["A", "B"] }, "apiid": "SESSION_ID" }
```

- `setpollsettings`:

```json
{ "action": "setpollsettings", "value": { "duration": 30, "mode": "single" }, "apiid": "SESSION_ID" }
```

- `getpollpresets`:

```json
{ "action": "getpollpresets", "get": "poll-presets-1", "apiid": "SESSION_ID" }
```

- `createpoll`:

```json
{ "action": "createpoll", "value": "{...pollDefinition...}", "apiid": "SESSION_ID" }
```

- `resetpoll`:

```json
{ "action": "resetpoll", "apiid": "SESSION_ID" }
```

- `closepoll`:

```json
{ "action": "closepoll", "apiid": "SESSION_ID" }
```

### Timer

- `starttimer`:

```json
{ "action": "starttimer", "value": "main", "apiid": "SESSION_ID" }
```

- `pausetimer`:

```json
{ "action": "pausetimer", "value": "main", "apiid": "SESSION_ID" }
```

- `toggletimer`:

```json
{ "action": "toggletimer", "value": "main", "apiid": "SESSION_ID" }
```

- `settimer`:

```json
{ "action": "settimer", "value": 120, "target": "main", "apiid": "SESSION_ID" }
```

- `gettimerstate`:

```json
{ "action": "gettimerstate", "get": "timer-main-1", "value": "main", "apiid": "SESSION_ID" }
```

Expected event:

```json
{ "running": true, "secondsLeft": 95, "secondsTotal": 300, "target": "main" }
```

### Modes and utility

- `drawmode`:

```json
{ "action": "drawmode", "value": true, "apiid": "SESSION_ID" }
```

- `emoteonly`:

```json
{ "action": "emoteonly", "value": false, "apiid": "SESSION_ID" }
```

- `autoShow`:

```json
{ "action": "autoShow", "value": true, "apiid": "SESSION_ID" }
```

### SSApp source control

SSApp source-control commands should include `target: "ssapp"` so they do not collide with existing targeted SSN/API messages.

- `getSources`:

```json
{ "action": "getSources", "target": "ssapp", "get": "sources-1", "apiid": "SESSION_ID" }
```

Expected callback result:

```json
{ "callback": { "get": "sources-1", "result": { "sources": [ ... ] } } }
```

- `getSource`:

```json
{ "action": "getSource", "target": "ssapp", "value": "source-id-123", "get": "source-1", "apiid": "SESSION_ID" }
```

- `addSource`:

```json
{ "action": "addSource", "target": "ssapp", "value": { "target": "twitch", "username": "channel_name", "connectionMode": "websocket", "isVisible": true, "isMuted": true, "autoActivate": false, "idempotencyKey": "deck-source-1" }, "get": "add-source-1", "apiid": "SESSION_ID" }
```

- `updateSource`:

```json
{ "action": "updateSource", "target": "ssapp", "value": { "sourceId": "source-id-123", "updates": { "username": "new_channel_name", "connectionMode": "classic" } }, "get": "update-source-1", "apiid": "SESSION_ID" }
```

- `removeSource`:

```json
{ "action": "removeSource", "target": "ssapp", "value": { "sourceId": "source-id-123" }, "get": "remove-source-1", "apiid": "SESSION_ID" }
```

Remote source creation accepts `target`, `username`, `videoId`, `url`, `connectionMode`, `isVisible`, `isMuted`, `autoActivate`, and `idempotencyKey`. Remote updates accept `url`, `username`, `videoId`, `connectionMode`, `isVisible`, `isMuted`, and `autoActivate`. URLs are intentionally not restricted to a matching host or domain, including loopback hosts; they must be valid HTTP(S) URLs and must not embed sign-in credentials.

- `startSource`:

```json
{ "action": "startSource", "target": "ssapp", "value": "source-id-123", "apiid": "SESSION_ID" }
```

- `stopSource`:

```json
{ "action": "stopSource", "target": "ssapp", "value": "source-id-123", "apiid": "SESSION_ID" }
```

- `restartSource`:

```json
{ "action": "restartSource", "target": "ssapp", "value": "source-id-123", "apiid": "SESSION_ID" }
```

- `setSourceVisibility`:

```json
{ "action": "setSourceVisibility", "target": "ssapp", "value": { "sourceId": "source-id-123", "isVisible": false }, "apiid": "SESSION_ID" }
```

- `toggleSourceVisibility`:

```json
{ "action": "toggleSourceVisibility", "target": "ssapp", "value": "source-id-123", "apiid": "SESSION_ID" }
```

- `setSourceMute`:

```json
{ "action": "setSourceMute", "target": "ssapp", "value": { "sourceId": "source-id-123", "isMuted": true }, "apiid": "SESSION_ID" }
```

- `toggleSourceMute`:

```json
{ "action": "toggleSourceMute", "target": "ssapp", "value": "source-id-123", "apiid": "SESSION_ID" }
```

- `setSourceConnectionMode`:

```json
{ "action": "setSourceConnectionMode", "target": "ssapp", "value": { "sourceId": "source-id-123", "mode": "websocket" }, "apiid": "SESSION_ID" }
```

## Message data lifecycle and validation rules

### Validation priorities

- Always require `sessionId` before connect.
- Commands should avoid sending raw undefined/empty fields where possible.
- Use explicit `target` when platform behavior varies by provider.
- Keep `source` identifiers stable across process lifecycle for action retries.

### Parse and coercion

The property inspector may pass strings. Except for the message presets described above, the plugin converts:

- `"true"`/`"false"` to boolean
- `"null"` to null
- JSON-looking objects/arrays to parsed JSON
- otherwise keep string

### Error and safety policy

- Use confirmation flow for destructive SSN actions such as `clearOverlay` and `resetwaitlist`.
- Show explicit feedback on each key event (OK/Alert) regardless of callback presence.
- Never hard-code session IDs.

## Data flow summary

```
Stream Deck UI -> plugin settings/press event -> SsnClient.sendCommand -> social_stream socket/http -> social_stream router -> SSN handler or internal SSApp bridge -> callback/event through social_stream -> plugin sessionStore.lastMessage -> UI/action rendering
```

## Recommended defaults for v1

- Channel: control on `out:1`, callbacks/events on `in:2`.
- API host: `io.socialstream.ninja`.
- Await response for query-style commands and SSApp source commands.
- Stream Deck should never require a separate SSApp endpoint.

## Open implementation gaps

- `value` typing in command registry should be stricter when writing presets that use nested fields.
- Last-message visibility could be used by a future feedback action.
