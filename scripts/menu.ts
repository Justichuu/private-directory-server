import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

interface MenuAction {
  readonly label: string;
  readonly run: () => void;
}

function runNpm(args: readonly string[]): void {
  const result = spawnSync("npm", args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) console.error(`Command failed: npm ${args.join(" ")}`);
}

function startServer(): void {
  console.log("Starting the server. Open http://127.0.0.1:8000 in your browser once it says it is listening.");
  console.log("Press Ctrl+C to stop it.\n");
  const result = spawnSync(process.execPath, ["dist/src/server.js"], { stdio: "inherit" });
  if (result.status !== 0 && result.signal !== "SIGINT") console.error("The server exited with an error.");
}

const actions: readonly MenuAction[] = [
  { label: "Start the server", run: startServer },
  { label: "Run the tests", run: () => runNpm(["test"]) },
  { label: "Type-check the code", run: () => runNpm(["run", "check"]) },
  { label: "Build only", run: () => runNpm(["run", "build"]) },
  { label: "Create a release package (release/)", run: () => runNpm(["run", "package"]) },
];

async function main(): Promise<void> {
  const rl = createInterface({ input, output });
  try {
    for (;;) {
      console.log("\nPrivate Directory Server — what do you want to do?\n");
      actions.forEach((action, index) => console.log(`  ${index + 1}) ${action.label}`));
      console.log(`  ${actions.length + 1}) Quit`);
      const answer = (await rl.question("\nType a number and press Enter: ")).trim().toLowerCase();
      if (answer === "q" || answer === String(actions.length + 1)) break;
      const action = actions[Number(answer) - 1];
      if (!action) {
        console.log("Not a valid choice — try again.");
        continue;
      }
      action.run();
    }
  } finally {
    rl.close();
  }
  console.log("Goodbye.");
}

void main();
