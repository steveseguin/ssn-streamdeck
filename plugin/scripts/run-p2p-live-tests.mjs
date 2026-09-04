import { spawn } from "node:child_process";
import { join } from "node:path";

const vitest = join(process.cwd(), "node_modules", "vitest", "vitest.mjs");
const child = spawn(process.execPath, [vitest, "run", "src/api/p2p-live.test.ts", "--reporter=verbose"], {
	cwd: process.cwd(),
	env: { ...process.env, SSN_LIVE_P2P: "1" },
	stdio: "inherit"
});

child.once("error", error => {
	console.error(error);
	process.exitCode = 1;
});
child.once("exit", (code, signal) => {
	if (signal) {
		console.error(`Live P2P tests terminated by ${signal}`);
		process.exitCode = 1;
		return;
	}
	process.exitCode = code ?? 1;
});
