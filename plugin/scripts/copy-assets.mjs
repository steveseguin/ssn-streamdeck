import { copyFile, cp, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

const files = [
	["manifest.json", "ninja.socialstream.streamdeck.sdPlugin/manifest.json"],
	["ui/action-settings.html", "ninja.socialstream.streamdeck.sdPlugin/ui/action-settings.html"]
];

for (const [source, destination] of files) {
	const dest = join(process.cwd(), destination);
	await mkdir(dirname(dest), { recursive: true });
	await copyFile(join(process.cwd(), source), dest);
}

const sourceImageDir = join(process.cwd(), "imgs");
const destinationImageDir = join(process.cwd(), "ninja.socialstream.streamdeck.sdPlugin/imgs");
await rm(destinationImageDir, { recursive: true, force: true });
await mkdir(destinationImageDir, { recursive: true });

for (const file of await readdir(sourceImageDir)) {
	if (file.endsWith(".png")) {
		await copyFile(join(sourceImageDir, file), join(destinationImageDir, file));
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
