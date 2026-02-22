import { loadDotEnv } from "./env.js";
import { createAutoTrader, readConfigFromEnv } from "./autotrader.js";

loadDotEnv();
const trader = createAutoTrader(readConfigFromEnv());

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

function writeMessage(payload: unknown): void {
  const body = JSON.stringify(payload);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
}

function ok(id: number | string | null | undefined, result: unknown): void {
  if (id === undefined) return;
  writeMessage({ jsonrpc: "2.0", id, result });
}

function fail(id: number | string | null | undefined, code: number, message: string): void {
  if (id === undefined) return;
  writeMessage({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handleRequest(req: JsonRpcRequest): Promise<void> {
  try {
    if (req.method === "initialize") {
      ok(req.id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "de-polymarket-mcp", version: "0.1.0" },
      });
      return;
    }

    if (req.method === "ping") {
      ok(req.id, {});
      return;
    }

    if (req.method === "tools/list") {
      ok(req.id, {
        tools: [
          {
            name: "start_auto_trader",
            description: "Start continuous polling and auto-trading loop.",
            inputSchema: { type: "object", properties: {}, additionalProperties: false },
          },
          {
            name: "stop_auto_trader",
            description: "Stop running auto-trading loop.",
            inputSchema: { type: "object", properties: {}, additionalProperties: false },
          },
          {
            name: "get_auto_trader_status",
            description: "Get runtime status and in-memory position count.",
            inputSchema: { type: "object", properties: {}, additionalProperties: false },
          },
          {
            name: "tick_auto_trader",
            description: "Run one trading cycle manually.",
            inputSchema: { type: "object", properties: {}, additionalProperties: false },
          },
        ],
      });
      return;
    }

    if (req.method === "tools/call") {
      const toolName = String(req.params?.name ?? "");
      if (toolName === "start_auto_trader") {
        const status = await trader.start();
        ok(req.id, { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] });
        return;
      }
      if (toolName === "stop_auto_trader") {
        const status = trader.stop();
        ok(req.id, { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] });
        return;
      }
      if (toolName === "get_auto_trader_status") {
        const status = trader.getStatus();
        ok(req.id, { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] });
        return;
      }
      if (toolName === "tick_auto_trader") {
        await trader.tick();
        const status = trader.getStatus();
        ok(req.id, { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] });
        return;
      }

      fail(req.id, -32601, `Unknown tool: ${toolName}`);
      return;
    }

    fail(req.id, -32601, `Method not found: ${req.method}`);
  } catch (error) {
    fail(req.id, -32000, error instanceof Error ? error.message : "Unknown server error");
  }
}

let rawBuffer = Buffer.alloc(0);
process.stdin.on("data", async (chunk: Buffer) => {
  rawBuffer = Buffer.concat([rawBuffer, chunk]);

  while (true) {
    const headerEnd = rawBuffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;

    const headerText = rawBuffer.slice(0, headerEnd).toString("utf8");
    const match = headerText.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      rawBuffer = rawBuffer.slice(headerEnd + 4);
      continue;
    }

    const contentLength = Number(match[1]);
    const messageStart = headerEnd + 4;
    const messageEnd = messageStart + contentLength;
    if (rawBuffer.length < messageEnd) break;

    const jsonText = rawBuffer.slice(messageStart, messageEnd).toString("utf8");
    rawBuffer = rawBuffer.slice(messageEnd);

    try {
      const req = JSON.parse(jsonText) as JsonRpcRequest;
      await handleRequest(req);
    } catch {
      writeMessage({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    }
  }
});
