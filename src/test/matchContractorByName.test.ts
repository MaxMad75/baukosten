import { describe, it, expect } from "vitest";
import { matchContractorByName } from "@/hooks/useContractors";
import { Contractor } from "@/lib/types";

const contractor = (id: string, company_name: string): Contractor => ({
  id,
  household_id: "hh-1",
  company_name,
  trade: null,
  contact_person: null,
  phone: null,
  email: null,
  website: null,
  notes: null,
  rating: null,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
} as Contractor);

const pool = [
  contractor("1", "Architekt Schmidmaier"),
  contractor("2", "Bauunternehmen Schmidmaier GmbH"),
  contractor("3", "Elektro Müller GmbH"),
];

describe("matchContractorByName", () => {
  it("matches exact names case-insensitively", () => {
    expect(matchContractorByName(pool, "elektro müller gmbh")?.id).toBe("3");
    expect(matchContractorByName(pool, "  Architekt Schmidmaier  ")?.id).toBe("1");
  });

  it("does NOT match an ambiguous short name to the first candidate", () => {
    // "Schmidmaier" is a substring of two different companies — must not match either
    expect(matchContractorByName(pool, "Schmidmaier")).toBeNull();
  });

  it("accepts an unambiguous substring match", () => {
    expect(matchContractorByName(pool, "Elektro Müller")?.id).toBe("3");
  });

  it("rejects substring matches for very short names", () => {
    expect(matchContractorByName(pool, "Erd")).toBeNull();
  });

  it("returns null for unknown or empty names", () => {
    expect(matchContractorByName(pool, "Dachdecker Huber")).toBeNull();
    expect(matchContractorByName(pool, "   ")).toBeNull();
    expect(matchContractorByName([], "Elektro Müller GmbH")).toBeNull();
  });
});
