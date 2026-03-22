import { createServer, type Server, type Socket } from "node:net";
import type { Logger } from "../../logger.types";
import { successResponse, errorResponse } from "./oauth.gateway.html";

const PORT_START = 49152;
const PORT_END = 49162;
const TIMEOUT_MS = 600_000;

export interface OAuthGateway {
  listen(preferredPort?: number): Promise<{ port: number; callbackPromise: Promise<{ code: string; socket: Socket }> }>;
  respondSuccess(socket: Socket): void;
  respondError(socket: Socket): void;
}

function extractCode(raw: string): string | null {
  const match = raw.match(/[?&]code=([^&\s]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function createOAuthGateway(log: Logger): OAuthGateway {
  log.info("OAuth gateway created");
  return {
    async listen(preferredPort?: number) {
      return new Promise((resolveSetup, rejectSetup) => {
        let resolved = false;
        let server: Server | null = null;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const cleanup = () => {
          if (timer) { clearTimeout(timer); timer = null; }
          if (server) { server.close(); server = null; log.info("OAuth gateway stopped"); }
        };

        const callbackPromise = new Promise<{ code: string; socket: Socket }>((resolveCallback, rejectCallback) => {
          const tryPort = (port: number) => {
            const isFixed = preferredPort != null && port === preferredPort;
            if (!isFixed && port > PORT_END) {
              rejectSetup(new Error(`All OAuth ports (${PORT_START}–${PORT_END}) are in use`));
              return;
            }

            const srv = createServer((socket) => {
              let buf = "";
              socket.on("data", (chunk) => {
                buf += chunk.toString();
                const code = extractCode(buf);
                if (code && !resolved) {
                  log.debug("OAuth callback received", { codeLength: code.length });
                  resolved = true;
                  cleanup();
                  resolveCallback({ code, socket });
                }
              });
            });

            srv.once("error", () => {
              if (isFixed) {
                rejectSetup(new Error(`OAuth port ${port} is already in use`));
              } else {
                tryPort(port + 1);
              }
            });
            srv.listen(port, "localhost", () => {
              server = srv;
              timer = setTimeout(() => {
                if (!resolved) {
                  resolved = true;
                  rejectCallback(new Error("OAuth callback timeout"));
                }
                cleanup();
              }, TIMEOUT_MS);

              const addr = srv.address();
              const actualPort = typeof addr === "object" && addr ? addr.port : port;
              log.info("OAuth gateway listening", { port: actualPort });
              resolveSetup({ port: actualPort, callbackPromise });
            });
          };

          tryPort(preferredPort ?? PORT_START);
        });
      });
    },

    respondSuccess(socket) {
      socket.end(successResponse);
    },

    respondError(socket) {
      socket.end(errorResponse);
    },
  };
}
