import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { build } from "esbuild";

// The catalogue uses the same definitions as key dispatch and icon generation.
const compiled = await build({ entryPoints: ["src/api/command-registry.ts"], bundle: true, write: false, platform: "node", format: "esm", logLevel: "silent" });
const { COMMANDS, getCommandKeyTitle } = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));
const inspectorCommands = Object.fromEntries(COMMANDS.map(({ id, label, ...definition }) => [id, { ...definition, keyTitle: getCommandKeyTitle(id) }]));
await writeFile("ui/commands.js", "// Generated from src/api/command-registry.ts.\nwindow.SSN_STREAMDECK_COMMANDS = " + JSON.stringify(inspectorCommands, null, 2) + ";\n");
const escape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const rows = COMMANDS.map(command => {
    const value = command.defaultValue === undefined ? "—" : typeof command.defaultValue === "string" ? command.defaultValue : JSON.stringify(command.defaultValue);
    const valueLabel = command.sourceValue === "id" ? "Choose a source" : command.sourceValue === "isMuted" ? "Choose a source, then Mute or Unmute" : command.sourceValue === "isVisible" ? "Choose a source, then Show or Hide" : command.valueLabel || (command.defaultValue === undefined ? "No value needed" : "Preset value included");
    return `<tr><td><img class="icon" src="../imgs/commands/${escape(command.icon)}.png" alt="" loading="lazy"></td><td><strong>${escape(command.label)}</strong><br><code>${escape(command.id)}</code>${command.scope === "ssapp" ? '<br><small class="tag">Desktop app</small>' : ""}</td><td>${escape(valueLabel)}${command.defaultValue === undefined ? "" : `<br><code>${escape(value)}</code>`}</td></tr>`;
}).join("\n");
const table = `<div class="table-wrap"><table id="commandCatalog" class="catalog" aria-labelledby="catalogTitle"><thead><tr><th scope="col">Icon</th><th scope="col">Command</th><th scope="col">Value / default</th></tr></thead><tbody>\n${rows}\n</tbody></table></div>`;
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
    // Keep the public page's SEO head and relative back link; the plugin copy links to the live site instead.
    const destinationGuide = join(destination, "guide.html");
    const publicHead = (await readFile(destinationGuide, "utf8").catch(() => "")).replaceAll("\r\n", "\n").match(/\s*<meta name="description"[\s\S]*?<meta name="twitter:image:alt"[^>]*>/);
    let publicGuide = rendered.replaceAll("../imgs/commands/", "images/commands/").replace('<a class="back" href="https://socialstream.ninja/streamdeck/">', '<a class="back" href="./">');
    if (publicHead) publicGuide = publicGuide.replace('<meta charset="utf-8">', '<meta charset="utf-8">' + publicHead[0]);
    await writeFile(destinationGuide, publicGuide);
    console.log(`Exported the public controls guide to ${destination}`);
}
