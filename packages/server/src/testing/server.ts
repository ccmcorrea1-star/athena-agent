import { AthenaServer } from "../server.ts";
import type { AthenaServerOptions, AthenaSessionBackend } from "../types.ts";
import { TEST_TOKEN, TestSessionBackend } from "./backend.ts";

export interface TestServerOptions extends Omit<AthenaServerOptions, "token"> {
	token?: string;
	backend?: AthenaSessionBackend;
}

export interface TestServer {
	server: AthenaServer;
	backend: AthenaSessionBackend;
}

/** Create an unstarted AthenaServer with deterministic defaults for transport conformance tests. */
export function createTestServer(options: TestServerOptions): TestServer {
	const backend = options.backend ?? new TestSessionBackend();
	return {
		server: new AthenaServer(backend, {
			token: options.token ?? TEST_TOKEN,
			listeners: options.listeners,
			maxFrameLength: options.maxFrameLength,
			handshakeTimeoutMs: options.handshakeTimeoutMs,
			serverId: options.serverId,
			onError: options.onError,
		}),
		backend,
	};
}
