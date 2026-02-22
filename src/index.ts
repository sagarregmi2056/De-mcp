import { loadDotEnv } from "./env.js";
import { createInterface } from "node:readline";
import { createAutoTrader, readConfigFromEnv } from "./autotrader.js";

loadDotEnv();
const trader = createAutoTrader(readConfigFromEnv());

function printHelp(): void {
  console.log("DE Trader Controller ready.");
  console.log("Commands: start | stop | status | tick | help | exit");
}

async function handleCommand(cmd: string): Promise<boolean> {
  const normalized = cmd.trim().toLowerCase();

  if (normalized === "start") {
    const status = await trader.start();
    console.log(JSON.stringify(status, null, 2));
    return true;
  }

  if (normalized === "stop") {
    const status = trader.stop();
    console.log(JSON.stringify(status, null, 2));
    return true;
  }

  if (normalized === "status") {
    console.log(JSON.stringify(trader.getStatus(), null, 2));
    return true;
  }

  if (normalized === "tick") {
    await trader.tick();
    console.log(JSON.stringify(trader.getStatus(), null, 2));
    return true;
  }

  if (normalized === "help") {
    printHelp();
    return true;
  }

  if (normalized === "exit" || normalized === "quit") {
    trader.stop();
    return false;
  }

  console.log("Unknown command. Type 'help'.");
  return true;
}

async function main(): Promise<void> {
  printHelp();

  if ((process.env.AUTO_START ?? "false").toLowerCase() === "true") {
    const status = await trader.start();
    console.log("Auto-started", JSON.stringify(status, null, 2));
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });

  rl.on("line", async (line) => {
    try {
      const keepGoing = await handleCommand(line);
      if (!keepGoing) {
        rl.close();
      }
    } catch (error) {
      console.error("Command failed", error);
    }
  });

  rl.on("close", () => {
    trader.stop();
    process.exit(0);
  });
}

void main();
