export type TwoFactorMethod = "otp" | "totp";

export const getInitialTwoFactorMethod = (methods: string[]): TwoFactorMethod =>
  methods.includes("totp") ? "totp" : "otp";

export const canUseBackupCode = (methods: string[]) =>
  methods.includes("backup") || methods.includes("totp");

export const getTotpSecret = (uri: string): string | undefined => {
  try {
    const parsedUri = new URL(uri);
    return parsedUri.protocol === "otpauth:"
      ? (parsedUri.searchParams.get("secret") ?? undefined)
      : undefined;
  } catch {
    return undefined;
  }
};

export const getTwoFactorMethods = (data: unknown): string[] | undefined => {
  if (
    !data ||
    typeof data !== "object" ||
    !("twoFactorRedirect" in data) ||
    data.twoFactorRedirect !== true
  ) {
    return;
  }

  if (!("twoFactorMethods" in data) || !Array.isArray(data.twoFactorMethods)) {
    return [];
  }

  return data.twoFactorMethods.filter(
    (method): method is string => typeof method === "string"
  );
};
