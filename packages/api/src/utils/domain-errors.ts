import type { protectedProcedure } from "../index";

export type ProcedureErrors = Parameters<
  Parameters<typeof protectedProcedure.handler>[0]
>[0]["errors"];

interface DomainError {
  code: string;
  message: string;
}

export interface DomainErrorMapping<TError extends DomainError> {
  badRequestIncludesCode?: boolean;
  conflictCodes?: readonly TError["code"][];
  errorClass: abstract new (...args: never[]) => TError;
  forbiddenCodes?: readonly TError["code"][];
  notFoundCodes?: readonly TError["code"][];
  toBadRequestData?: (error: TError) => unknown;
}

/**
 * Single translation path from typed service-domain errors to declared oRPC
 * errors. Each router declares its domain's code-to-status mapping once and
 * delegates here instead of repeating the instanceof cascade per procedure.
 */
export function translateDomainError<TError extends DomainError>(
  error: unknown,
  errors: ProcedureErrors,
  mapping: DomainErrorMapping<TError>
): never {
  const domainError = error instanceof mapping.errorClass ? error : undefined;
  if (!domainError) {
    throw error;
  }
  if (mapping.notFoundCodes?.includes(domainError.code)) {
    throw errors.NOT_FOUND({ message: domainError.message });
  }
  if (mapping.forbiddenCodes?.includes(domainError.code)) {
    throw errors.FORBIDDEN({ message: domainError.message });
  }
  if (mapping.conflictCodes?.includes(domainError.code)) {
    throw errors.PROFILE_CUSTOMIZATION_CONFLICT({
      message: domainError.message,
    });
  }
  throw errors.BAD_REQUEST({
    ...(mapping.toBadRequestData
      ? { data: mapping.toBadRequestData(domainError) }
      : {}),
    message: mapping.badRequestIncludesCode
      ? `${domainError.code}: ${domainError.message}`
      : domainError.message,
  });
}
