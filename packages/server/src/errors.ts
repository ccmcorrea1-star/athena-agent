import type { JsonValue, ProtocolErrorCode } from "@athena/protocol";

export type AthenaServerOperationErrorCode = Extract<
	ProtocolErrorCode,
	"busy" | "session_locked" | "not_found" | "invalid_request"
>;

/** A backend/runtime error that can safely cross the protocol boundary. */
export class AthenaServerError extends Error {
	readonly code: AthenaServerOperationErrorCode;
	readonly details: JsonValue | undefined;

	constructor(code: AthenaServerOperationErrorCode, message: string, details?: JsonValue) {
		super(message);
		this.name = "AthenaServerError";
		this.code = code;
		this.details = details;
	}
}

export class SessionBusyError extends AthenaServerError {
	constructor(message = "Session is busy", details?: JsonValue) {
		super("busy", message, details);
		this.name = "SessionBusyError";
	}
}

export class SessionLockedError extends AthenaServerError {
	constructor(message = "Session is locked", details?: JsonValue) {
		super("session_locked", message, details);
		this.name = "SessionLockedError";
	}
}

export class SessionNotFoundError extends AthenaServerError {
	constructor(message = "Session was not found", details?: JsonValue) {
		super("not_found", message, details);
		this.name = "SessionNotFoundError";
	}
}
