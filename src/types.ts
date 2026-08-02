/** Runtime configuration for a directory server instance. */
export interface ServerConfig {
  readonly rootDirectory: string;
  readonly publicDirectory: string;
  readonly host: string;
  readonly port: number;
  readonly showHidden: boolean;
  readonly accessToken: string | null;
  readonly accessMode: "read-only" | "upload";
  readonly logRequests: boolean;
  readonly maxUploadBytes: number;
}

/** A serializable item returned by the directory-listing API. */
export interface DirectoryItem {
  readonly name: string;
  readonly path: string;
  readonly type: "directory" | "file";
  readonly size: number;
  readonly modifiedAt: string;
}

/** Authenticated capabilities exposed to the browser. */
export interface SessionInfo {
  readonly authenticated: boolean;
  readonly authenticationRequired: boolean;
  readonly accessMode: "read-only" | "upload";
  readonly maxUploadBytes: number;
}

/** Result of resolving a user-provided path against the configured root. */
export type PathResolution =
  | { readonly status: "resolved"; readonly absolutePath: string; readonly relativePath: string }
  | { readonly status: "forbidden"; readonly reason: string }
  | { readonly status: "not_found"; readonly reason: string };
