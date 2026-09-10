import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { build } from "esbuild";

// The catalogue uses the same definitions as key dispatch and icon generation.
const compiled = await build({ entryPoints: ["src/api/command-registry.ts"], bundle: true, write: false, platform: "node", format: "esm", logLevel: "silent" });
const { COMMANDS } = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));
const escape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const rows = COMMANDS.map(command => {
    const value = command.defaultValue === undefined ? "—" : typeof command.defaultValue === "string" ? command.defaultValue : JSON.stringify(command.defaultValue);
    return `<tr><td><img class="icon" src="../imgs/commands/${escape(command.icon)}.png" alt="${escape(command.label)} icon" loading="lazy"></td><td><strong>${escape(command.label)}</strong><br><code>${escape(command.id)}</code><br><small>${command.scope === "ssapp" ? "Desktop app" : "Social Stream"}</small></td><td>${escape(command.valueLabel || "No value field required")}<br><code>${escape(value)}</code></td></tr>`;
}).join("\n");
const table = `<div class="table-wrap"><table class="catalog"><thead><tr><th>Icon</th><th>Command</th><th>Value / default</th></tr></thead><tbody>\n${rows}\n</tbody></table></div>`;
const file = "ui/guide.html";
const guide = await readFile(file, "utf8");
const rendered = guide.replace(/<!-- COMMAND_CATALOG_START -->[\s\S]*?<!-- COMMAND_CATALOG_END -->/, `<!-- COMMAND_CATALOG_START -->\n${table}\n<!-- COMMAND_CATALOG_END -->`);
await writeFile(file, rendered);
console.log(`Generated guide catalogue for ${COMMANDS.length} presets`);

// Publishing is explicit; ordinary plugin builds never modify another repository.
const publicRootArgument = process.argv.find(argument => argument.startsWith("--public-root="));
if (publicRootArgument) {
    const publicRoot = resolve(publicRootArgument.slice("--public-root=".length));
    await readFile(join(publicRoot, "AGENTS.md"), "utf8");
    const destination = join(publicRoot, "streamdeck");
    const icons = join(destination, "images", "commands");
    await mkdir(icons, { recursive: true });
    for (const icon of new Set(COMMANDS.map(command => command.icon))) {
        await copyFile(join("imgs", "commands", `${icon}.png`), join(icons, `${icon}.png`));
    }
    await writeFile(join(destination, "guide.html"), rendered.replaceAll("../imgs/commands/", "images/commands/"));
    console.log(`Exported the public controls guide to ${destination}`);
}
