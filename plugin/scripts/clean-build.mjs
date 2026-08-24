import { rm } from "node:fs/promises";
import { join } from "node:path";

const bundleRoot = join(process.cwd(), "ninja.socialstream.streamdeck.sdPlugin");
const generatedPaths = [
	"bin",
	"imgs",
	"ui",
	"profiles",
	"logs",
	"manifest.json",
	"de.json",
	"en.json",
	"es.json",
	"fr.json",
	"ja.json",
	"ko.json",
	"zh_CN.json",
	"zh_TW.json"
];

for (const item of generatedPaths) {
	await rm(join(bundleRoot, item), { recursive: true, force: true });
}
