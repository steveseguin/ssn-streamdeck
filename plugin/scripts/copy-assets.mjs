import { copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { formatDeviceTitle } from "../src/device-title.js";

const files = [
	["../LICENSE", "ninja.socialstream.streamdeck.sdPlugin/LICENSE.txt"],
	["manifest.json", "ninja.socialstream.streamdeck.sdPlugin/manifest.json"],
	["ui/action-settings.html", "ninja.socialstream.streamdeck.sdPlugin/ui/action-settings.html"],
	["ui/guide.html", "ninja.socialstream.streamdeck.sdPlugin/ui/guide.html"],
	["THIRD_PARTY_NOTICES.txt", "ninja.socialstream.streamdeck.sdPlugin/THIRD_PARTY_NOTICES.txt"]
];

for (const [source, destination] of files) {
	const dest = join(process.cwd(), destination);
	await mkdir(dirname(dest), { recursive: true });
	await copyFile(join(process.cwd(), source), dest);
}

const localeSourceDir = join(process.cwd(), "locales");
const localeCatalogs = {};
for (const file of await readdir(localeSourceDir)) {
	if (!file.endsWith(".json")) continue;
	const source = join(localeSourceDir, file);
	const destination = join(process.cwd(), "ninja.socialstream.streamdeck.sdPlugin", file);
	const locale = file.slice(0, -5);
	const contents = JSON.parse(await readFile(source, "utf8"));
	const localization = { ...(contents.Localization || {}) };
	for (const [key, value] of Object.entries(localization)) {
		if (!key.startsWith("command.") || typeof value !== "string") continue;
		const deviceKey = `deviceCommand_${key.slice("command.".length)}`;
		if (!localization[deviceKey]) localization[deviceKey] = formatDeviceTitle(value);
	}
	contents.Localization = localization;
	await writeFile(destination, `${JSON.stringify(contents, null, 2)}\n`, "utf8");
	localeCatalogs[locale] = localization;
}
await writeFile(
	join(process.cwd(), "ninja.socialstream.streamdeck.sdPlugin", "ui", "locales.js"),
	`window.SSN_STREAMDECK_LOCALES = ${JSON.stringify(localeCatalogs)};\n`,
	"utf8"
);

const sourceImageDir = join(process.cwd(), "imgs");
const destinationImageDir = join(process.cwd(), "ninja.socialstream.streamdeck.sdPlugin/imgs");
await rm(destinationImageDir, { recursive: true, force: true });
await mkdir(destinationImageDir, { recursive: true });

for (const file of await readdir(sourceImageDir)) {
	if (file.endsWith(".png")) {
		await copyFile(join(sourceImageDir, file), join(destinationImageDir, file));
	}
}

const sourceCommandIconDir = join(sourceImageDir, "commands");
const destinationCommandIconDir = join(destinationImageDir, "commands");
await mkdir(destinationCommandIconDir, { recursive: true });

for (const file of await readdir(sourceCommandIconDir)) {
	if (file.endsWith(".png")) {
		await copyFile(join(sourceCommandIconDir, file), join(destinationCommandIconDir, file));
	}
}

const sourceActionIconDir = join(sourceImageDir, "actions");
const destinationActionIconDir = join(destinationImageDir, "actions");
await mkdir(destinationActionIconDir, { recursive: true });

for (const file of await readdir(sourceActionIconDir)) {
	if (file.endsWith(".svg")) {
		await copyFile(join(sourceActionIconDir, file), join(destinationActionIconDir, file));
	}
}

await cp(join(process.cwd(), "layouts"), join(process.cwd(), "ninja.socialstream.streamdeck.sdPlugin", "layouts"), { recursive: true });
await cp(join(process.cwd(), "profiles"), join(process.cwd(), "ninja.socialstream.streamdeck.sdPlugin", "profiles"), { recursive: true });

const runtimePackages = [
	"@vdoninja/sdk",
	"node-datachannel",
	"detect-libc",
	"ws",
	"abort-controller",
	"event-target-shim"
];
for (const packageName of runtimePackages) {
	await copyRuntimePackage(packageName);
}

const nativeScope = join(process.cwd(), "node_modules", "@node-datachannel");
for (const packageName of await readdir(nativeScope)) {
	await copyRuntimePackage(`@node-datachannel/${packageName}`);
}

async function copyRuntimePackage(packageName) {
	const source = join(process.cwd(), "node_modules", ...packageName.split("/"));
	const destination = join(process.cwd(), "ninja.socialstream.streamdeck.sdPlugin", "node_modules", ...packageName.split("/"));
	await mkdir(dirname(destination), { recursive: true });
	await cp(source, destination, { recursive: true });
}
