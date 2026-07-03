import streamDeck from "@elgato/streamdeck";
import { ConnectionStatusAction } from "./actions/connection-status.js";
import { CustomCommandAction } from "./actions/custom-command.js";
import { SsnCommandAction } from "./actions/ssn-command.js";
import { initializeServices } from "./services.js";

streamDeck.actions.registerAction(new ConnectionStatusAction());
streamDeck.actions.registerAction(new SsnCommandAction());
streamDeck.actions.registerAction(new CustomCommandAction());

await streamDeck.connect();
await initializeServices();
