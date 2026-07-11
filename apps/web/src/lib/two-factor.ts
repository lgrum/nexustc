export type TwoFactorMethod = "otp" | "totp";

export const getInitialTwoFactorMethod = (methods: string[]): TwoFactorMethod =>
  methods.includes("totp") ? "totp" : "otp";

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
