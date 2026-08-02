# @athena/server

Experimental. This package is under active development and may change or be removed without notice. Its CLI, APIs, and behavior are not yet stable.

Server package for Athena.

## CLI

```bash
server --help
```

## Session server core

The package also exports the new `AthenaServer` session server. This API is additive while the legacy child-process supervisor and `server` CLI are migrated.

```ts
import type { AthenaSessionBackend } from "@athena/server";
import { createUnixServer } from "@athena/server/unix";

const backend: AthenaSessionBackend = {
  async listSessions() {
    return storage.listSessions();
  },
  async listModels() {
    return modelRegistry.listModels();
  },
  async createSession(options) {
    return storage.createAndOpen(options);
  },
  async openSession(sessionId) {
    return storage.open(sessionId);
  },
};

const server = createUnixServer(backend, {
  token: process.env.ATHENA_SERVER_TOKEN!,
  path: "/tmp/athena/server.sock",
});
await server.start();
```

`AthenaServer` composes transport listeners through the `AthenaServerListener` interface. The Unix submodule exports the `createUnixListener()` building block and `createUnixServer()` preset, keeping the common case concise without coupling the primary server to Unix sockets. The listener uses authenticated, length-prefixed CBOR messages from `@athena/protocol`. It does not yet replace the legacy JSONL IPC control plane, child-process supervisor, standalone `server` CLI, or Radius presence integration.

## Transport testing

Custom transports can use `@athena/server/testing` for deterministic protocol conformance tests. It exports `createTestServer()`, `TestSessionBackend`, `ProtocolTestClient`, and the transport-neutral `WireChannel` contract. `connectUnixTestClient()` is provided for Unix transport tests.

## `athena-ai` protocol bridge

`@athena/ai` domain objects and `@athena/protocol` wire DTOs remain independent. This package owns their boundary and exports `toProtocolModelMetadata()`, `toProtocolAssistantMessage()`, `toProtocolUserMessage()`, and `toProtocolToolResultMessage()`.

The adapters reject invalid tool inputs, identifiers, timestamps, and mismatched tool results; `toProtocolToolResultMessage()` requires the original `ToolCall` so it can verify the association and convert its arguments itself. Diagnostic details are explicitly sanitized. Closed `athena-ai` unions are mapped exhaustively, and compile-time field manifests enumerate current `athena-ai` properties so additions require an explicit review. The protocol mirrors `athena-ai` vocabulary such as `toolCall` and `toolUse` where the semantics are identical. Protocol schemas enforce consistent lifecycle states, and tests encode adapter output through the runtime schemas so incompatible changes fail in the bridging package.

## Legacy server migration

The existing IPC, supervisor, process management, persistence, and Radius modules remain available during migration. The new Unix session protocol supersedes the legacy socket framing and RPC proxy only after the coding-agent backend and CLI replacement have landed. Radius is presence and registration infrastructure, not a transport, and requires a separate integration with the new server lifecycle before the legacy supervisor can be removed.
