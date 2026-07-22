import { passwordSchema } from "./security-section";

describe(passwordSchema, () => {
  const values = {
    confirmNewPassword: "new-password",
    currentPassword: "current-password",
    email: "user@example.com",
    newPassword: "new-password",
  };

  it("accepts matching valid passwords", () => {
    expect(passwordSchema.safeParse(values).success).toBe(true);
  });

  it("reports confirmation mismatches on the confirmation field", () => {
    const result = passwordSchema.safeParse({
      ...values,
      confirmNewPassword: "other-password",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          message: "Las contraseñas no coinciden",
          path: ["confirmNewPassword"],
        })
      );
    }
  });
});
