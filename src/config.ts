import path from "node:path";
import { type ServerConfig } from "./types";

const DEFAULT_PORT = 8000;
const DEFAULT_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

function parsePort(rawPort: string | undefined): number {
  if (rawPort === undefined || rawPort.trim() === "") return DEFAULT_PORT;
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error("PORT must be an integer from 0 through 65535.");
  }
  return port;
}

function parseBoolean(rawValue: string | undefined): boolean {
  return rawValue?.toLowerCase() === "true";
}

function parsePositiveInteger(rawValue: string | undefined, fallback: number, name: string): number {
  if (rawValue === undefined || rawValue.trim() === "") return fallback;
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  return value;
}

function parseAccessMode(rawValue: string | undefined): "read-only" | "upload" {
  const value = rawValue?.trim().toLowerCase() || "read-only";
  if (value !== "read-only" && value !== "upload") {
    throw new Error("ACCESS_MODE must be read-only or upload.");
  }
  return value;
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host.toLowerCase() === "localhost";
}

/**
 * Builds and validates server configuration from environment variables.
 * DIRECTORY_ROOT defaults to the current working directory.
 */
export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
  currentDirectory: string = process.cwd(),
): ServerConfig {
  const rootDirectory = path.resolve(environment.DIRECTORY_ROOT ?? currentDirectory);
  const host = environment.HOST?.trim() || "127.0.0.1";
  const accessToken = environment.ACCESS_TOKEN?.trim() || null;
  if (!isLoopbackHost(host) && accessToken === null) {
    throw new Error("ACCESS_TOKEN is required when HOST is not a loopback address.");
  }
  if (accessToken !== null && accessToken.length < 16) {
    throw new Error("ACCESS_TOKEN must contain at least 16 characters.");
  }
  return {
    rootDirectory,
    publicDirectory: path.resolve(__dirname, "..", "..", "public"),
    host,
    port: parsePort(environment.PORT),
    showHidden: parseBoolean(environment.SHOW_HIDDEN),
    accessToken,
    accessMode: parseAccessMode(environment.ACCESS_MODE),
    logRequests: parseBoolean(environment.LOG_REQUESTS),
    maxUploadBytes: parsePositiveInteger(environment.MAX_UPLOAD_BYTES, DEFAULT_MAX_UPLOAD_BYTES, "MAX_UPLOAD_BYTES"),
  };
}
