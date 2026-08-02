import { promises as fs } from "node:fs";
import { createServer, type Server } from "node:http";
import { createRequestHandler } from "./app";
import { loadConfig } from "./config";

function closeServer(server: Server, signal: NodeJS.Signals): void {
  console.log(`Received ${signal}; shutting down.`);
  server.close((error) => {
    if (error !== undefined) {
      console.error("Shutdown failed", error);
      process.exitCode = 1;
    }
  });
}

async function main(): Promise<void> {
  const config = loadConfig();
  const stats = await fs.stat(config.rootDirectory).catch(() => null);
  if (stats === null || !stats.isDirectory()) {
    throw new Error(`DIRECTORY_ROOT is not an accessible directory: ${config.rootDirectory}`);
  }

  const server = createServer(createRequestHandler(config));
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  server.on("clientError", (_error, socket) => socket.end("HTTP/1.1 400 Bad Request\r\n\r\n"));
  server.on("error", (error) => {
    console.error("Server failed", error);
    process.exitCode = 1;
  });
  server.listen(config.port, config.host, () => {
    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : config.port;
    console.log(`Private Directory Server is ready at http://${config.host}:${port}`);
    console.log(`Sharing read-only directory: ${config.rootDirectory}`);
  });
  process.once("SIGINT", (signal) => closeServer(server, signal));
  process.once("SIGTERM", (signal) => closeServer(server, signal));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Startup failed.");
  process.exitCode = 1;
});
