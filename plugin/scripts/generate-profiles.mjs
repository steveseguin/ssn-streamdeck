import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";

const outputDir = join(process.cwd(), "profiles");
const pluginUuid = "ninja.socialstream.streamdeck";
const commandUuid = `${pluginUuid}.command`;
const setupUuid = `${pluginUuid}.connection`;
const timerUuid = `${pluginUuid}.timer-dial`;
const chatUuid = `${pluginUuid}.chat-feed`;
const pluginManifest = JSON.parse(await readFile(join(process.cwd(), "manifest.json"), "utf8"));
const pluginVersion = pluginManifest.Version;

const standardActions = {
	"0,0": setupAction(),
	"1,0": commandAction("Credits Start", "creditsStart", true),
	"2,0": commandAction("Credits Preview", "creditsPreview", true),
	"3,0": commandAction("Credits Test", "creditsTest", true),
	"4,0": commandAction("Next In Queue", "nextInQueue"),
	"0,1": commandAction("Clear Overlay", "clearOverlay"),
	"1,1": commandAction("Clear Dock", "clearDock"),
	"2,1": commandAction("Next Pinned", "nextPinned"),
	"3,1": commandAction("Start Waitlist", "startentries"),
	"4,1": commandAction("Stop Waitlist", "stopentries"),
	"0,2": commandAction("Timer Start", "starttimer"),
	"1,2": commandAction("Timer Toggle", "toggletimer"),
	"2,2": commandAction("Download Waitlist", "downloadwaitlist"),
	"3,2": commandAction("Select Winner", "selectwinner"),
	"4,2": commandAction("Close Poll", "closepoll")
};

const plusKeyActions = {
	"0,0": setupAction(),
	"1,0": commandAction("Credits Start", "creditsStart", true),
	"2,0": commandAction("Credits Preview", "creditsPreview", true),
	"3,0": commandAction("Credits Test", "creditsTest", true),
	"0,1": commandAction("Next In Queue", "nextInQueue"),
	"1,1": commandAction("Clear Overlay", "clearOverlay"),
	"2,1": commandAction("Next Pinned", "nextPinned"),
	"3,1": commandAction("Select Winner", "selectwinner")
};

const plusDialActions = {
	"0,0": action("Timer Dial", timerUuid, { stepSeconds: 10 }),
	"1,0": action("Chat Review", chatUuid, {})
};

await mkdir(outputDir, { recursive: true });

await writeProfile(
	"Social Stream Ninja.streamDeckProfile",
	profileEntries({
		archiveId: "5EAD9A1F-8246-49D9-A49E-B802C80E9BA4",
		currentPageId: "767C9763-D983-44B5-9061-DC0D21AEF719",
		defaultPageId: "9C388265-4184-420C-9D9D-2016E184850F",
		deviceModel: "20GBA9901",
		name: "Social Stream Ninja",
		keyActions: standardActions
	})
);

await writeProfile(
	"Social Stream Ninja Plus.streamDeckProfile",
	profileEntries({
		archiveId: "F7F4F805-BAC7-410D-9BC3-788196AF01DA",
		currentPageId: "741CC4EA-26F2-44B4-923F-F38162CC8F72",
		defaultPageId: "53D1A3A4-C635-4A5A-A17D-C588123043C7",
		deviceModel: "20GBD9901",
		name: "Social Stream Ninja Plus",
		keyActions: plusKeyActions,
		dialActions: plusDialActions
	})
);

await writeProfile("Social Stream Ninja Giveaways.streamDeckProfile", profileEntries({
    archiveId: "4C4D5F16-616A-4CAB-B47F-22A5239A96DC",
    currentPageId: "336CF5D5-A900-451D-82A8-55AA80F84E58",
    defaultPageId: "CBE31E93-AF2A-41D4-B57E-70E5C9DF84FB",
    deviceModel: "20GBA9901", name: "Social Stream Ninja Giveaways",
    keyActions: { "0,0":setupAction(), "1,0":commandAction("Giveaway State","getgiveawaystate",true),
        "0,1":commandAction("Open Giveaway","startgiveaway",true), "1,1":commandAction("Close Giveaway","closegiveaway",true),
        "2,1":commandAction("Draw Giveaway","drawgiveaway",true), "3,1":commandAction("Cancel and Refund","cancelgiveaway",true),
        "4,1":commandAction("New Round","resetgiveaway",true) }
}));
console.log("Generated Stream Deck starter profiles");

function setupAction() {
	return action("Setup", setupUuid, {});
}

function commandAction(name, command, awaitResponse = false) {
	return action(name, commandUuid, { command, awaitResponse });
}

function action(name, uuid, settings) {
	return {
		name,
		settings,
		UUID: uuid
	};
}

function profileEntries({ archiveId, currentPageId, defaultPageId, deviceModel, name, keyActions, dialActions = null }) {
	const currentPage = currentPageId.toLowerCase();
	const defaultPage = defaultPageId.toLowerCase();
	const controllers = [
		{ Actions: streamDeckActions(name, "Keypad", keyActions), Type: "Keypad" }
	];
	if (dialActions) controllers.push({ Actions: streamDeckActions(name, "Encoder", dialActions), Type: "Encoder" });
	return [
		{
			name: `${archiveId}.sdProfile/manifest.json`,
			data: {
				Device: { Model: deviceModel, UUID: "" },
				InstalledByPluginUUID: pluginUuid,
				Name: name,
				Pages: { Current: currentPage, Default: defaultPage, Pages: [currentPage] },
				PreconfiguredName: name,
				Version: "3.0"
			}
		},
		{
			name: `${archiveId}.sdProfile/Profiles/${currentPageId}/manifest.json`,
			data: { Controllers: controllers, Icon: "", Name: "" }
		},
		{
			name: `${archiveId}.sdProfile/Profiles/${defaultPageId}/manifest.json`,
			data: {
				Controllers: controllers.map(controller => ({ Actions: null, Type: controller.Type })),
				Icon: "",
				Name: ""
			}
		}
	];
}

function streamDeckActions(profileName, controller, actions) {
	return Object.fromEntries(Object.entries(actions).map(([coordinate, definition]) => [
		coordinate,
		{
			ActionID: stableUuid(`${profileName}/${controller}/${coordinate}/${definition.UUID}`),
			LinkedTitle: false,
			Name: definition.name,
			Plugin: { Name: "Social Stream Ninja", UUID: pluginUuid, Version: pluginVersion },
			Resources: null,
			Settings: definition.settings,
			State: 0,
			States: actionStates(definition.UUID, controller),
			UUID: definition.UUID
		}
	]));
}

function actionStates(uuid, controller) {
	const state = {
		FontFamily: "",
		FontSize: 10,
		FontStyle: "",
		FontUnderline: false,
		OutlineThickness: 2,
		ShowTitle: controller === "Keypad",
		TitleAlignment: "bottom",
		TitleColor: "#ffffff"
	};
	return uuid === setupUuid ? [state, { ...state }] : [state];
}

function stableUuid(value) {
	const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
	hex[12] = "4";
	hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
	return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

async function writeProfile(fileName, entries) {
	const archiveEntries = entries.map(entry => ({
		name: entry.name,
		data: Buffer.from(JSON.stringify(entry.data), "utf8")
	}));
	await writeFile(join(outputDir, fileName), createZip(archiveEntries));
}

function createZip(entries) {
	const localParts = [];
	const centralParts = [];
	let offset = 0;
	for (const entry of entries) {
		const name = Buffer.from(entry.name, "utf8");
		const compressed = deflateRawSync(entry.data, { level: 9 });
		const checksum = crc32(entry.data);
		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(0x0800, 6);
		local.writeUInt16LE(8, 8);
		local.writeUInt16LE(0, 10);
		local.writeUInt16LE(0x5821, 12);
		local.writeUInt32LE(checksum, 14);
		local.writeUInt32LE(compressed.length, 18);
		local.writeUInt32LE(entry.data.length, 22);
		local.writeUInt16LE(name.length, 26);
		local.writeUInt16LE(0, 28);
		localParts.push(local, name, compressed);

		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4);
		central.writeUInt16LE(20, 6);
		central.writeUInt16LE(0x0800, 8);
		central.writeUInt16LE(8, 10);
		central.writeUInt16LE(0, 12);
		central.writeUInt16LE(0x5821, 14);
		central.writeUInt32LE(checksum, 16);
		central.writeUInt32LE(compressed.length, 20);
		central.writeUInt32LE(entry.data.length, 24);
		central.writeUInt16LE(name.length, 28);
		central.writeUInt16LE(0, 30);
		central.writeUInt16LE(0, 32);
		central.writeUInt16LE(0, 34);
		central.writeUInt16LE(0, 36);
		central.writeUInt32LE(0, 38);
		central.writeUInt32LE(offset, 42);
		centralParts.push(central, name);
		offset += local.length + name.length + compressed.length;
	}

	const centralDirectory = Buffer.concat(centralParts);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(0, 4);
	end.writeUInt16LE(0, 6);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(centralDirectory.length, 12);
	end.writeUInt32LE(offset, 16);
	end.writeUInt16LE(0, 20);
	return Buffer.concat([...localParts, centralDirectory, end]);
}

function crc32(buffer) {
	let value = 0xffffffff;
	for (const byte of buffer) {
		value ^= byte;
		for (let bit = 0; bit < 8; bit += 1) {
			value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
		}
	}
	return (value ^ 0xffffffff) >>> 0;
}
