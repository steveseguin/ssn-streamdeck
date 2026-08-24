import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";

const pluginRoot = process.cwd();
const profilesRoot = join(pluginRoot, "ninja.socialstream.streamdeck.sdPlugin", "profiles");
const pluginManifest = JSON.parse(await readFile(join(pluginRoot, "manifest.json"), "utf8"));

await validateProfile("Social Stream Ninja.streamDeckProfile", {
	deviceModel: "20GBA9901",
	controllers: { Keypad: 15 }
});
await validateProfile("Social Stream Ninja Plus.streamDeckProfile", {
	deviceModel: "20GBD9901",
	controllers: { Keypad: 8, Encoder: 2 }
});

console.log("Stream Deck starter profiles passed V3 schema validation");

async function validateProfile(fileName, expected) {
	const entries = readZip(await readFile(join(profilesRoot, fileName)));
	const manifests = new Map(
		Array.from(entries, ([name, data]) => [name, JSON.parse(data.toString("utf8"))])
			.filter(([name]) => name.endsWith("/manifest.json"))
	);
	const rootEntry = Array.from(manifests).find(([name]) => name.split("/").length === 2);
	assert(rootEntry, `${fileName}: missing root manifest`);
	const [rootPath, root] = rootEntry;
	assert(root.Version === "3.0", `${fileName}: expected profile version 3.0`);
	assert(root.Device?.Model === expected.deviceModel, `${fileName}: unexpected device model`);
	assert(root.Device?.UUID === "", `${fileName}: package must not contain a hardware UUID`);
	assert(root.InstalledByPluginUUID === pluginManifest.UUID, `${fileName}: missing plugin ownership`);
	assert(root.Pages?.Current && root.Pages?.Default, `${fileName}: current/default page metadata missing`);
	assert(Array.isArray(root.Pages?.Pages) && root.Pages.Pages.includes(root.Pages.Current), `${fileName}: current page is not listed`);

	const archiveRoot = rootPath.slice(0, -"/manifest.json".length);
	const page = pageManifest(manifests, archiveRoot, root.Pages.Current);
	pageManifest(manifests, archiveRoot, root.Pages.Default);
	const actualControllers = Object.fromEntries((page.Controllers || []).map(controller => [
		controller.Type,
		controller.Actions ? Object.keys(controller.Actions).length : 0
	]));
	assert(JSON.stringify(actualControllers) === JSON.stringify(expected.controllers), `${fileName}: unexpected controllers/actions ${JSON.stringify(actualControllers)}`);

	const actionIds = [];
	for (const controller of page.Controllers || []) {
		for (const action of Object.values(controller.Actions || {})) {
			actionIds.push(action.ActionID);
			assert(action.Plugin?.UUID === pluginManifest.UUID, `${fileName}: action plugin UUID mismatch`);
			assert(action.Plugin?.Version === pluginManifest.Version, `${fileName}: action plugin version mismatch`);
			assert(typeof action.UUID === "string" && action.UUID.startsWith(`${pluginManifest.UUID}.`), `${fileName}: foreign action UUID`);
			assert(Array.isArray(action.States) && action.States.length > 0, `${fileName}: action states missing`);
		}
	}
	assert(new Set(actionIds).size === actionIds.length, `${fileName}: duplicate action IDs`);
}

function pageManifest(manifests, archiveRoot, pageId) {
	const suffix = `/Profiles/${String(pageId).toUpperCase()}/manifest.json`;
	const entry = Array.from(manifests).find(([name]) => name.toUpperCase() === `${archiveRoot}${suffix}`.toUpperCase());
	assert(entry, `Missing page manifest for ${pageId}`);
	return entry[1];
}

function readZip(buffer) {
	const entries = new Map();
	let offset = 0;
	while (offset + 4 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
		const method = buffer.readUInt16LE(offset + 8);
		const compressedSize = buffer.readUInt32LE(offset + 18);
		const nameLength = buffer.readUInt16LE(offset + 26);
		const extraLength = buffer.readUInt16LE(offset + 28);
		const nameStart = offset + 30;
		const dataStart = nameStart + nameLength + extraLength;
		const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
		const name = buffer.subarray(nameStart, nameStart + nameLength).toString("utf8");
		assert(method === 8, `${name}: unsupported ZIP compression method ${method}`);
		entries.set(name, inflateRawSync(compressed));
		offset = dataStart + compressedSize;
	}
	assert(entries.size > 0, "Profile package has no ZIP entries");
	return entries;
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
}
