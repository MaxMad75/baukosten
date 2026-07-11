import { describe, it, expect } from 'vitest';
import { applyPrincipalRedistribution, PersonPayments } from '@/components/invoices/PaymentsByPersonCard';

const profiles = [
  { id: 'p-a', name: 'Anna' },
  { id: 'p-b', name: 'Basti' },
  { id: 'p-k', name: 'Kredit' },
];

const person = (profileId: string, name: string, total: number): PersonPayments => ({
  profileId, name, total, sharePercent: 0, items: [],
});

describe('applyPrincipalRedistribution (SRS 4.4 — Tilgung als Vermögensverschiebung)', () => {
  const persons = [
    person('p-k', 'Kredit', 100000),
    person('p-a', 'Anna', 60000),
    person('p-b', 'Basti', 40000),
  ];
  // 20.000 Tilgung, Anteile 50/50
  const principalByProfile = new Map([
    ['p-a', 10000],
    ['p-b', 10000],
  ]);

  it('verschiebt die Tilgung vom Kredit auf die Kreditnehmer, Gesamtsumme bleibt gleich', () => {
    const adjusted = applyPrincipalRedistribution(persons, profiles, principalByProfile);
    const byId = new Map(adjusted.map((p) => [p.profileId, p]));

    expect(byId.get('p-k')?.total).toBe(80000);   // 100.000 − 20.000
    expect(byId.get('p-a')?.total).toBe(70000);   // 60.000 + 10.000
    expect(byId.get('p-b')?.total).toBe(50000);   // 40.000 + 10.000

    const sum = adjusted.reduce((s, p) => s + p.total, 0);
    expect(sum).toBe(200000); // keine Kosten entstehen oder verschwinden
  });

  it('weist die Deltas aus (Kredit negativ, Kreditnehmer positiv)', () => {
    const adjusted = applyPrincipalRedistribution(persons, profiles, principalByProfile);
    const byId = new Map(adjusted.map((p) => [p.profileId, p]));
    expect(byId.get('p-k')?.principalDelta).toBe(-20000);
    expect(byId.get('p-a')?.principalDelta).toBe(10000);
  });

  it('berechnet die Anteile auf Basis der unveränderten Gesamtsumme neu', () => {
    const adjusted = applyPrincipalRedistribution(persons, profiles, principalByProfile);
    const byId = new Map(adjusted.map((p) => [p.profileId, p]));
    expect(byId.get('p-k')?.sharePercent).toBe(40);   // 80.000 / 200.000
    expect(byId.get('p-a')?.sharePercent).toBe(35);   // 70.000 / 200.000
  });

  it('nimmt Kreditnehmer ohne eigene Zahlungen mit auf', () => {
    const onlyCredit = [person('p-k', 'Kredit', 50000)];
    const adjusted = applyPrincipalRedistribution(onlyCredit, profiles, new Map([['p-a', 5000]]));
    const anna = adjusted.find((p) => p.profileId === 'p-a');
    expect(anna?.total).toBe(5000);
    expect(adjusted.find((p) => p.profileId === 'p-k')?.total).toBe(45000);
  });

  it('ohne Kredit-Profil unter den Personen bleibt die Verteilung additiv korrekt', () => {
    // Randfall: Zahlungen nur von Personen, Tilgung trotzdem erfasst —
    // der Kredit-Anteil kann nicht negativ verteilt werden, taucht aber
    // mangels total>0 nicht auf; Kreditnehmer erhalten ihre Anteile.
    const noCredit = [person('p-a', 'Anna', 1000)];
    const adjusted = applyPrincipalRedistribution(noCredit, profiles, new Map([['p-b', 500]]));
    expect(adjusted.find((p) => p.profileId === 'p-b')?.total).toBe(500);
  });
});
