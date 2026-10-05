// Generated from src/api/command-registry.ts.
window.SSN_STREAMDECK_COMMANDS = {
  "getCommerceState": {
    "scope": "ssn",
    "icon": "product-info",
    "defaultAwaitResponse": true,
    "keyTitle": "Product\nState"
  },
  "triggerWorkflow": {
    "scope": "ssn",
    "icon": "workflow-play",
    "valueLabel": "Trigger name or workflow JSON",
    "defaultAwaitResponse": true,
    "keyTitle": "Workflow\nRun"
  },
  "getWorkflowTriggers": {
    "scope": "ssn",
    "icon": "workflow-list",
    "defaultAwaitResponse": true,
    "resultKind": "workflows",
    "keyTitle": "Workflows\nList"
  },
  "startgiveaway": {
    "scope": "ssn",
    "icon": "trophy-play",
    "defaultValue": {
      "giveawayId": "default"
    },
    "valueLabel": "Giveaway ID/config JSON",
    "defaultAwaitResponse": true,
    "resultKind": "giveaway",
    "keyTitle": "Giveaway\nOpen"
  },
  "closegiveaway": {
    "scope": "ssn",
    "icon": "trophy-pause",
    "defaultValue": {
      "giveawayId": "default"
    },
    "valueLabel": "Giveaway ID JSON",
    "defaultAwaitResponse": true,
    "resultKind": "giveaway",
    "keyTitle": "Giveaway\nClose"
  },
  "drawgiveaway": {
    "scope": "ssn",
    "icon": "trophy-highlight",
    "defaultValue": {
      "giveawayId": "default"
    },
    "valueLabel": "Giveaway ID JSON",
    "defaultAwaitResponse": true,
    "resultKind": "giveaway",
    "keyTitle": "Giveaway\nDraw"
  },
  "cancelgiveaway": {
    "scope": "ssn",
    "icon": "trophy-stop",
    "defaultValue": {
      "giveawayId": "default"
    },
    "valueLabel": "Giveaway ID JSON",
    "defaultAwaitResponse": true,
    "resultKind": "giveaway",
    "keyTitle": "Cancel &\nRefund"
  },
  "resetgiveaway": {
    "scope": "ssn",
    "icon": "trophy-reset",
    "defaultValue": {
      "giveawayId": "default"
    },
    "valueLabel": "Giveaway ID JSON",
    "defaultAwaitResponse": true,
    "resultKind": "giveaway",
    "keyTitle": "Giveaway\nNew round"
  },
  "getgiveawaystate": {
    "scope": "ssn",
    "icon": "trophy-info",
    "defaultValue": {
      "giveawayId": "default"
    },
    "valueLabel": "Giveaway ID JSON",
    "defaultAwaitResponse": true,
    "resultKind": "giveaway",
    "keyTitle": "Giveaway\nState"
  },
  "commerceShow": {
    "scope": "ssn",
    "icon": "product-play",
    "valueType": "text",
    "valueLabel": "Saved product URL (optional)",
    "defaultAwaitResponse": true,
    "keyTitle": "Show\nproduct"
  },
  "commerceNext": {
    "scope": "ssn",
    "icon": "product-next",
    "defaultValue": "0",
    "valueLabel": "Seconds (0 = until changed)",
    "defaultAwaitResponse": true,
    "keyTitle": "Next\nproduct"
  },
  "commerceHide": {
    "scope": "ssn",
    "icon": "product-hide",
    "defaultValue": "0",
    "valueLabel": "Seconds (0 = until changed)",
    "defaultAwaitResponse": true,
    "keyTitle": "Hide\nproducts"
  },
  "commerceResume": {
    "scope": "ssn",
    "icon": "product-resume",
    "defaultAwaitResponse": true,
    "keyTitle": "Resume\nproducts"
  },
  "nextInQueue": {
    "scope": "ssn",
    "icon": "queue-next",
    "keyTitle": "Next\nQueue"
  },
  "clearOverlay": {
    "scope": "ssn",
    "icon": "overlay-clear",
    "keyTitle": "Clear\nOverlay"
  },
  "clearDock": {
    "scope": "ssn",
    "icon": "dock-clear",
    "keyTitle": "Clear\nDock"
  },
  "clear": {
    "scope": "ssn",
    "icon": "message-clear",
    "keyTitle": "Clear\nMessages"
  },
  "clearAll": {
    "scope": "ssn",
    "icon": "messages-clear",
    "keyTitle": "Clear All"
  },
  "clearHistory": {
    "scope": "ssn",
    "icon": "history-clear",
    "defaultValue": "confirm",
    "valueLabel": "Type confirm",
    "defaultAwaitResponse": true,
    "keyTitle": "Clear\nHistory"
  },
  "creditsStart": {
    "scope": "ssn",
    "icon": "credits-play",
    "defaultAwaitResponse": true,
    "keyTitle": "Credits\nStart"
  },
  "creditsPreview": {
    "scope": "ssn",
    "icon": "credits-preview",
    "defaultAwaitResponse": true,
    "keyTitle": "Credits\nPreview"
  },
  "creditsTest": {
    "scope": "ssn",
    "icon": "credits-test",
    "defaultAwaitResponse": true,
    "keyTitle": "Credits\nTest"
  },
  "creditsReset": {
    "scope": "ssn",
    "icon": "credits-reset",
    "defaultAwaitResponse": true,
    "keyTitle": "Reset\nCredits"
  },
  "resetleaderboard": {
    "scope": "ssn",
    "icon": "leaderboard-reset",
    "keyTitle": "Reset\nLeaders"
  },
  "getQueueSize": {
    "scope": "ssn",
    "icon": "queue-count",
    "defaultAwaitResponse": true,
    "resultKind": "queue",
    "keyTitle": "Queue\nSize"
  },
  "sendChat": {
    "scope": "ssn",
    "icon": "message-send",
    "defaultValue": "Hello from Stream Deck",
    "valueType": "text",
    "valueLabel": "Message",
    "keyTitle": "Send\nChat"
  },
  "sendEncodedChat": {
    "scope": "ssn",
    "icon": "encoded-send",
    "defaultValue": "Hello%20from%20Stream%20Deck",
    "valueType": "text",
    "valueLabel": "Encoded message",
    "keyTitle": "Send\nEncoded"
  },
  "pin": {
    "scope": "ssn",
    "icon": "pin-add",
    "valueLabel": "Message ID or JSON message",
    "keyTitle": "Pin\nMessage"
  },
  "unpin": {
    "scope": "ssn",
    "icon": "pin-remove",
    "valueLabel": "Message ID",
    "keyTitle": "Unpin\nMessage"
  },
  "nextPinned": {
    "scope": "ssn",
    "icon": "pin-next",
    "keyTitle": "Next\nPinned"
  },
  "drawmode": {
    "scope": "ssn",
    "icon": "draw-toggle",
    "defaultValue": "toggle",
    "valueLabel": "true, false, or toggle",
    "keyTitle": "Draw\nMode"
  },
  "removefromwaitlist": {
    "scope": "ssn",
    "icon": "waitlist-remove",
    "defaultValue": "1",
    "valueLabel": "Entry number",
    "keyTitle": "Remove\nWaitlist"
  },
  "highlightwaitlist": {
    "scope": "ssn",
    "icon": "waitlist-highlight",
    "defaultValue": "1",
    "valueLabel": "Entry number",
    "keyTitle": "Highlight\nWaitlist"
  },
  "resetwaitlist": {
    "scope": "ssn",
    "icon": "waitlist-reset",
    "keyTitle": "Reset\nWaitlist"
  },
  "stopentries": {
    "scope": "ssn",
    "icon": "waitlist-stop",
    "keyTitle": "Waitlist\nStop"
  },
  "startentries": {
    "scope": "ssn",
    "icon": "waitlist-play",
    "keyTitle": "Waitlist\nStart"
  },
  "openentries": {
    "scope": "ssn",
    "icon": "waitlist-open",
    "keyTitle": "Waitlist\nOpen"
  },
  "resumeentries": {
    "scope": "ssn",
    "icon": "waitlist-resume",
    "keyTitle": "Waitlist\nResume"
  },
  "waitlistmessage": {
    "scope": "ssn",
    "icon": "waitlist-message",
    "defaultValue": "Type !join to enter!",
    "valueType": "text",
    "valueLabel": "Message",
    "keyTitle": "Set Join\nMessage"
  },
  "setwaitlistmessage": {
    "scope": "ssn",
    "icon": "waitlist-message",
    "defaultValue": "Type !join to enter!",
    "valueType": "text",
    "valueLabel": "Message",
    "keyTitle": "Set Join\nMessage"
  },
  "downloadwaitlist": {
    "scope": "ssn",
    "icon": "waitlist-download",
    "keyTitle": "Download\nWaitlist"
  },
  "selectwinner": {
    "scope": "ssn",
    "icon": "trophy-highlight",
    "defaultValue": "1",
    "valueLabel": "Winner count",
    "keyTitle": "Select\nWinner"
  },
  "starttimer": {
    "scope": "ssn",
    "icon": "timer-play",
    "keyTitle": "Timer\nStart"
  },
  "pausetimer": {
    "scope": "ssn",
    "icon": "timer-pause",
    "keyTitle": "Timer\nPause"
  },
  "toggletimer": {
    "scope": "ssn",
    "icon": "timer-playpause",
    "keyTitle": "Timer\nToggle"
  },
  "resettimer": {
    "scope": "ssn",
    "icon": "timer-reset",
    "defaultValue": {
      "confirm": true
    },
    "keyTitle": "Timer\nReset"
  },
  "timeradd": {
    "scope": "ssn",
    "icon": "timer-add",
    "defaultValue": "30",
    "valueLabel": "Seconds",
    "keyTitle": "Timer\n+ Time"
  },
  "timersubtract": {
    "scope": "ssn",
    "icon": "timer-remove",
    "defaultValue": "30",
    "valueLabel": "Seconds",
    "keyTitle": "Timer\n- Time"
  },
  "settimer": {
    "scope": "ssn",
    "icon": "timer-edit",
    "defaultValue": {
      "seconds": 300
    },
    "valueLabel": "Timer JSON",
    "keyTitle": "Timer\nSet"
  },
  "gettimerstate": {
    "scope": "ssn",
    "icon": "timer-info",
    "defaultAwaitResponse": true,
    "resultKind": "timer",
    "keyTitle": "Timer\nStatus"
  },
  "loadpoll": {
    "scope": "ssn",
    "icon": "poll-load",
    "valueLabel": "{\"pollId\":\"...\"}",
    "keyTitle": "Poll\nLoad"
  },
  "setpollsettings": {
    "scope": "ssn",
    "icon": "poll-settings",
    "valueLabel": "Poll settings JSON",
    "keyTitle": "Poll\nSettings"
  },
  "getpollpresets": {
    "scope": "ssn",
    "icon": "poll-list",
    "defaultAwaitResponse": true,
    "resultKind": "polls",
    "keyTitle": "Poll\nPresets"
  },
  "createpoll": {
    "scope": "ssn",
    "icon": "poll-add",
    "valueLabel": "Poll definition JSON",
    "keyTitle": "Poll\nCreate"
  },
  "resetpoll": {
    "scope": "ssn",
    "icon": "poll-reset",
    "keyTitle": "Poll\nReset"
  },
  "closepoll": {
    "scope": "ssn",
    "icon": "poll-clear",
    "keyTitle": "Poll\nClose"
  },
  "startmap": {
    "scope": "ssn",
    "icon": "map-play",
    "keyTitle": "Map\nStart"
  },
  "pausemap": {
    "scope": "ssn",
    "icon": "map-pause",
    "keyTitle": "Map\nPause"
  },
  "resetmap": {
    "scope": "ssn",
    "icon": "map-reset",
    "keyTitle": "Map\nReset"
  },
  "getSources": {
    "scope": "ssapp",
    "icon": "sources-list",
    "capabilityPath": [
      "sourceControls",
      "list"
    ],
    "defaultAwaitResponse": true,
    "resultKind": "sources",
    "keyTitle": "Sources\nList"
  },
  "getSource": {
    "scope": "ssapp",
    "icon": "source-info",
    "capabilityPath": [
      "sourceControls",
      "get"
    ],
    "valueLabel": "Source ID",
    "defaultAwaitResponse": true,
    "resultKind": "source",
    "sourceValue": "id",
    "keyTitle": "Source\nDetails"
  },
  "addSource": {
    "scope": "ssapp",
    "icon": "source-add",
    "capabilityPath": [
      "sourceControls",
      "add"
    ],
    "valueLabel": "Source JSON",
    "defaultAwaitResponse": true,
    "keyTitle": "Source\nAdd"
  },
  "updateSource": {
    "scope": "ssapp",
    "icon": "source-edit",
    "capabilityPath": [
      "sourceControls",
      "update"
    ],
    "valueLabel": "{\"sourceId\":\"...\",\"updates\":{...}}",
    "defaultAwaitResponse": true,
    "keyTitle": "Source\nUpdate"
  },
  "removeSource": {
    "scope": "ssapp",
    "icon": "source-remove",
    "capabilityPath": [
      "sourceControls",
      "remove"
    ],
    "valueLabel": "{\"sourceId\":\"...\",\"confirm\":true}",
    "defaultAwaitResponse": true,
    "keyTitle": "Source\nRemove"
  },
  "startSource": {
    "scope": "ssapp",
    "icon": "source-play",
    "capabilityPath": [
      "sourceControls",
      "start"
    ],
    "valueLabel": "Source ID",
    "defaultAwaitResponse": true,
    "sourceValue": "id",
    "keyTitle": "Source\nStart"
  },
  "stopSource": {
    "scope": "ssapp",
    "icon": "source-stop",
    "capabilityPath": [
      "sourceControls",
      "stop"
    ],
    "valueLabel": "Source ID",
    "defaultAwaitResponse": true,
    "sourceValue": "id",
    "keyTitle": "Source\nStop"
  },
  "restartSource": {
    "scope": "ssapp",
    "icon": "source-restart",
    "capabilityPath": [
      "sourceControls",
      "restart"
    ],
    "valueLabel": "Source ID",
    "defaultAwaitResponse": true,
    "sourceValue": "id",
    "keyTitle": "Source\nRestart"
  },
  "startAllSources": {
    "scope": "ssapp",
    "icon": "sources-play",
    "capabilityPath": [
      "bulkControls",
      "startAll"
    ],
    "defaultValue": {},
    "valueLabel": "Filter JSON",
    "defaultAwaitResponse": true,
    "keyTitle": "All Sources\nStart"
  },
  "stopAllSources": {
    "scope": "ssapp",
    "icon": "sources-stop",
    "capabilityPath": [
      "bulkControls",
      "stopAll"
    ],
    "defaultValue": {
      "confirm": true
    },
    "valueLabel": "Filter JSON",
    "defaultAwaitResponse": true,
    "keyTitle": "All Sources\nStop"
  },
  "restartAllSources": {
    "scope": "ssapp",
    "icon": "sources-restart",
    "capabilityPath": [
      "bulkControls",
      "restartAll"
    ],
    "defaultValue": {
      "confirm": true
    },
    "valueLabel": "Filter JSON",
    "defaultAwaitResponse": true,
    "keyTitle": "All Sources\nRestart"
  },
  "setSourceMute": {
    "scope": "ssapp",
    "icon": "mute-edit",
    "capabilityPath": [
      "mute",
      "set"
    ],
    "valueLabel": "{\"sourceId\":\"...\",\"isMuted\":true}",
    "defaultAwaitResponse": true,
    "sourceValue": "isMuted",
    "keyTitle": "Source\nSet Mute"
  },
  "toggleSourceMute": {
    "scope": "ssapp",
    "icon": "speaker-toggle",
    "capabilityPath": [
      "mute",
      "toggle"
    ],
    "valueLabel": "Source ID",
    "defaultAwaitResponse": true,
    "sourceValue": "id",
    "keyTitle": "Source\nMute Toggle"
  },
  "setSourceVisibility": {
    "scope": "ssapp",
    "icon": "eye-edit",
    "capabilityPath": [
      "visibility",
      "set"
    ],
    "valueLabel": "{\"sourceId\":\"...\",\"isVisible\":false}",
    "defaultAwaitResponse": true,
    "sourceValue": "isVisible",
    "keyTitle": "Source\nSet Visible"
  },
  "toggleSourceVisibility": {
    "scope": "ssapp",
    "icon": "eye-toggle",
    "capabilityPath": [
      "visibility",
      "toggle"
    ],
    "valueLabel": "Source ID",
    "defaultAwaitResponse": true,
    "sourceValue": "id",
    "keyTitle": "Source\nVisibility"
  },
  "setSourceConnectionMode": {
    "scope": "ssapp",
    "icon": "plug-edit",
    "capabilityPath": [
      "connectionMode",
      "set"
    ],
    "valueLabel": "{\"sourceId\":\"...\",\"mode\":\"websocket\"}",
    "defaultAwaitResponse": true,
    "keyTitle": "Source\nConn Mode"
  },
  "getSettings": {
    "scope": "ssapp",
    "icon": "settings-info",
    "capabilityPath": [
      "settings",
      "get"
    ],
    "defaultAwaitResponse": true,
    "keyTitle": "App\nSettings"
  },
  "updateSettings": {
    "scope": "ssapp",
    "icon": "settings-edit",
    "capabilityPath": [
      "settings",
      "update"
    ],
    "valueLabel": "Settings JSON",
    "defaultAwaitResponse": true,
    "keyTitle": "App\nSet Config"
  }
};
