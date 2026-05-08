const FALLBACK_ERROR_MESSAGES: Record<string, string> = {
  BAD_REQUEST: "La solicitud no se pudo procesar.",
  FORBIDDEN: "No tienes permisos para realizar esta accion.",
  INTERNAL_SERVER_ERROR: "Ocurrio un error interno. Intentalo nuevamente.",
  NOT_FOUND: "No encontramos el recurso solicitado.",
  RATE_LIMITED:
    "Estas realizando demasiadas acciones seguidas. Espera un momento e intentalo de nuevo.",
  UNAUTHORIZED: "Necesitas iniciar sesion para continuar.",
};

function getErrorCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return null;
}

function getErrorDataMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    typeof error.data === "object" &&
    error.data !== null &&
    "message" in error.data &&
    typeof error.data.message === "string" &&
    error.data.message.trim().length > 0
  ) {
    return error.data.message;
  }

  return null;
}

export function getClientErrorMessage(
  error: unknown,
  fallback = "Ocurrio un error. Intentalo nuevamente."
) {
  const dataMessage = getErrorDataMessage(error);

  if (dataMessage) {
    return dataMessage;
  }

  const code = getErrorCode(error);
  const message = error instanceof Error ? error.message : null;
  const messageCode =
    message && FALLBACK_ERROR_MESSAGES[message] ? message : null;

  if (message && message !== code && !messageCode) {
    return message;
  }

  if (code && FALLBACK_ERROR_MESSAGES[code]) {
    return FALLBACK_ERROR_MESSAGES[code];
  }

  if (messageCode) {
    return FALLBACK_ERROR_MESSAGES[messageCode];
  }

  return message ?? fallback;
}
