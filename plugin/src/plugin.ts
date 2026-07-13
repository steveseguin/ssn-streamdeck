import streamDeck from "@elgato/streamdeck";
import { ChatFeedAction } from "./actions/chat-feed.js";
import { ConnectionStatusAction } from "./actions/connection-status.js";
import { CustomCommandAction } from "./actions/custom-command.js";
import { SsnCommandAction } from "./actions/ssn-command.js";
import { TimerDialAction } from "./actions/timer-dial.js";
import { initializeServices } from "./services.js";

streamDeck.actions.registerAction(new ConnectionStatusAction());
streamDeck.actions.registerAction(new SsnCommandAction());
streamDeck.actions.registerAction(new CustomCommandAction());
streamDeck.actions.registerAction(new TimerDialAction());
streamDeck.actions.registerAction(new ChatFeedAction());

await streamDeck.connect();
await initializeServices();
