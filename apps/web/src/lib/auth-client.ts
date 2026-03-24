import type { auth } from "@repo/auth";
import { ac, roles } from "@repo/shared/permissions";
import {
  adminClient,
  genericOAuthClient,
  inferAdditionalFields,
} from "better-auth/client/plugins";
import type { AccessControl } from "better-auth/plugins/access";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields<typeof auth>(),
    genericOAuthClient(),
    adminClient({
      ac: ac as AccessControl,
      roles,
    }),
  ],
});

type ErrorTypes = Partial<
  Record<keyof typeof authClient.$ERROR_CODES | (string & {}), string>
>;

const errorCodes = {
  ACCOUNT_NOT_FOUND: "Cuenta no encontrada",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "",
  EMAIL_CAN_NOT_BE_UPDATED: "",
  EMAIL_NOT_VERIFIED: "Email no verificado",
  FAILED_TO_CREATE_SESSION: "Fallo al crear la sesión",
  FAILED_TO_CREATE_USER: "Fallo al crear el usuario",
  FAILED_TO_GET_SESSION: "Fallo al obtener la sesión",
  FAILED_TO_GET_USER_INFO: "Fallo al obtener la información del usuario",
  FAILED_TO_UNLINK_LAST_ACCOUNT: "Fallo al desvincular la última cuenta",
  FAILED_TO_UPDATE_USER: "Fallo al actualizar el usuario",
  ID_TOKEN_NOT_SUPPORTED: "Token de identificación no soportado",
  INVALID_EMAIL: "Email inválido",
  INVALID_EMAIL_OR_PASSWORD: "Email o contraseña inválidos",
  INVALID_PASSWORD: "Contraseña inválida",
  INVALID_TOKEN: "Token inválido",
  PASSWORD_TOO_LONG: "Contraseña demasiado larga",
  PASSWORD_TOO_SHORT: "Contraseña demasiado corta",
  PROVIDER_NOT_FOUND: "Proveedor no encontrado",
  SESSION_EXPIRED: "Sesión expirada",
  SOCIAL_ACCOUNT_ALREADY_LINKED: "Cuenta social ya vinculada",
  USER_ALREADY_EXISTS: "El usuario ya existe",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "El usuario ya existe, usa otro email",
  USER_ALREADY_HAS_PASSWORD: "El usuario ya tiene una contraseña",
  USER_EMAIL_NOT_FOUND: "Email del usuario no encontrado",
  USER_NOT_FOUND: "Usuario no encontrado",
} satisfies ErrorTypes;

export function getAuthErrorMessage(code: string | undefined) {
  if (!code) {
    return;
  }

  if (code in errorCodes) {
    return errorCodes[code as keyof typeof errorCodes];
  }

  return code;
}
