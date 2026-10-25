import { describe, expect, it } from "vitest";
import { getSafeNextPath } from "@/lib/safeNext";

describe("getSafeNextPath", () => {
  it("behält interne absolute Pfade bei", () => {
    expect(getSafeNextPath("/")).toBe("/");
    expect(getSafeNextPath("/invoices")).toBe("/invoices");
    expect(getSafeNextPath("/budget?tab=offers#summary")).toBe("/budget?tab=offers#summary");
  });

  it("verwirft externe oder mehrdeutige Weiterleitungsziele", () => {
    const unsafeTargets = [
      "//evil.com",
      "/\\evil.com",
      "\\evil.com",
      "https://evil.com",
      "/invoices\\evil.com",
      "",
      null,
    ];

    for (const target of unsafeTargets) {
      expect(getSafeNextPath(target)).toBe("/");
    }
  });
});
