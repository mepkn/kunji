import { describe, expect, it } from "vitest";
import { friendly } from "./auth-errors";

describe("friendly", () => {
  it("explains the allowlist", () => {
    expect(friendly(new Error("Uncaught ConvexError: This email is not on the allowlist."), "signUp")).toBe(
      "This email is not on the allowlist.",
    );
  });

  it("reports a bad code on the code steps", () => {
    expect(friendly(new Error("Could not verify code"), "verify")).toBe("That code is wrong or has expired.");
    expect(friendly(new Error("Invalid code"), "reset")).toBe("That code is wrong or has expired.");
  });

  it("reports a wrong password on sign-in", () => {
    expect(friendly(new Error("InvalidSecret"), "signIn")).toBe("Wrong email or password.");
  });

  it("falls back per step", () => {
    expect(friendly("boom", "signUp")).toBe("Could not create the account.");
  });
});
