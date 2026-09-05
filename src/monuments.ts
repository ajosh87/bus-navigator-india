/**
 * Monument catalogue.
 *
 * Fees and timings are indicative public information and drift over time — ASI
 * revises them periodically. A production build should read these from the
 * booking provider (see `booking.ts`) rather than trusting this file, which
 * exists so the concierge has something real to talk about offline.
 */

export type Authority = 'ASI' | 'State' | 'Trust';

export interface Monument {
  id: string;
  name: string;
  city: string;
  state: string;
  authority: Authority;
  /** Indicative fee in rupees for an Indian national. */
  feeIndian: number;
  /** Indicative fee in rupees for a foreign national. */
  feeForeign: number;
  /** Extra ticket some sites charge on top (e.g. the Taj mausoleum). */
  surcharge?: { label: string; amount: number };
  /** Free below this age. */
  freeUnderAge: number;
  /** Day of week the site is shut, 0 = Sunday. */
  closedDay?: number;
  opens: string;
  closes: string;
  /** One line the concierge can read aloud. */
  blurb: string;
}

export const MONUMENTS: Monument[] = [
  {
    id: 'taj-mahal',
    name: 'Taj Mahal',
    city: 'Agra', state: 'Uttar Pradesh', authority: 'ASI',
    feeIndian: 50, feeForeign: 1100,
    surcharge: { label: 'Main mausoleum', amount: 200 },
    freeUnderAge: 15, closedDay: 5,
    opens: 'sunrise', closes: 'sunset',
    blurb: 'The marble mausoleum built by Shah Jahan. Closed on Fridays.',
  },
  {
    id: 'agra-fort',
    name: 'Agra Fort',
    city: 'Agra', state: 'Uttar Pradesh', authority: 'ASI',
    feeIndian: 40, feeForeign: 650,
    freeUnderAge: 15,
    opens: '06:00', closes: '18:00',
    blurb: 'The red sandstone fort that served as the main Mughal residence.',
  },
  {
    id: 'fatehpur-sikri',
    name: 'Fatehpur Sikri',
    city: 'Agra', state: 'Uttar Pradesh', authority: 'ASI',
    feeIndian: 50, feeForeign: 610,
    freeUnderAge: 15,
    opens: '06:00', closes: '18:00',
    blurb: 'Akbar’s abandoned capital, with the Buland Darwaza gateway.',
  },
  {
    id: 'red-fort',
    name: 'Red Fort',
    city: 'Delhi', state: 'Delhi', authority: 'ASI',
    feeIndian: 35, feeForeign: 500,
    freeUnderAge: 15, closedDay: 1,
    opens: '09:30', closes: '16:30',
    blurb: 'The Mughal fort where the Prime Minister speaks each Independence Day.',
  },
  {
    id: 'qutub-minar',
    name: 'Qutub Minar',
    city: 'Delhi', state: 'Delhi', authority: 'ASI',
    feeIndian: 35, feeForeign: 550,
    freeUnderAge: 15,
    opens: '07:00', closes: '17:00',
    blurb: 'A 73-metre brick minaret begun in 1199.',
  },
  {
    id: 'humayuns-tomb',
    name: 'Humayun’s Tomb',
    city: 'Delhi', state: 'Delhi', authority: 'ASI',
    feeIndian: 35, feeForeign: 550,
    freeUnderAge: 15,
    opens: '06:00', closes: '18:00',
    blurb: 'The garden tomb that was the template for the Taj Mahal.',
  },
  {
    id: 'ajanta',
    name: 'Ajanta Caves',
    city: 'Aurangabad', state: 'Maharashtra', authority: 'ASI',
    feeIndian: 40, feeForeign: 600,
    freeUnderAge: 15, closedDay: 1,
    opens: '09:00', closes: '17:30',
    blurb: 'Rock-cut Buddhist caves with second-century BCE paintings.',
  },
  {
    id: 'ellora',
    name: 'Ellora Caves',
    city: 'Aurangabad', state: 'Maharashtra', authority: 'ASI',
    feeIndian: 40, feeForeign: 600,
    freeUnderAge: 15, closedDay: 2,
    opens: '06:00', closes: '18:00',
    blurb: 'Thirty-four monasteries and temples cut into a basalt cliff.',
  },
  {
    id: 'konark',
    name: 'Konark Sun Temple',
    city: 'Puri', state: 'Odisha', authority: 'ASI',
    feeIndian: 40, feeForeign: 600,
    freeUnderAge: 15,
    opens: '06:00', closes: '20:00',
    blurb: 'A thirteenth-century temple shaped as the sun god’s chariot.',
  },
  {
    id: 'hampi',
    name: 'Hampi',
    city: 'Hampi', state: 'Karnataka', authority: 'ASI',
    feeIndian: 40, feeForeign: 600,
    freeUnderAge: 15,
    opens: '08:30', closes: '17:30',
    blurb: 'The boulder-strewn ruins of the Vijayanagara capital.',
  },
  {
    id: 'mysore-palace',
    name: 'Mysore Palace',
    city: 'Mysuru', state: 'Karnataka', authority: 'State',
    feeIndian: 100, feeForeign: 200,
    freeUnderAge: 10,
    opens: '10:00', closes: '17:30',
    blurb: 'The Wodeyar royal residence, lit up on Sunday evenings.',
  },
  {
    id: 'mahabalipuram',
    name: 'Mahabalipuram',
    city: 'Mamallapuram', state: 'Tamil Nadu', authority: 'ASI',
    feeIndian: 40, feeForeign: 600,
    freeUnderAge: 15,
    opens: '06:00', closes: '18:00',
    blurb: 'Shore temples and rock reliefs carved by the Pallavas.',
  },
  {
    id: 'charminar',
    name: 'Charminar',
    city: 'Hyderabad', state: 'Telangana', authority: 'ASI',
    feeIndian: 25, feeForeign: 300,
    freeUnderAge: 15,
    opens: '09:30', closes: '17:30',
    blurb: 'The four-minaret landmark at the heart of the old city.',
  },
  {
    id: 'golconda',
    name: 'Golconda Fort',
    city: 'Hyderabad', state: 'Telangana', authority: 'ASI',
    feeIndian: 25, feeForeign: 300,
    freeUnderAge: 15,
    opens: '09:00', closes: '17:30',
    blurb: 'A hilltop fort famous for its acoustic hand-clap signalling.',
  },
];

export function findMonuments(query: string): Monument[] {
  const q = query.trim().toLowerCase();
  if (!q) return MONUMENTS;
  return MONUMENTS.filter(
    (m) =>
      m.name.toLowerCase().includes(q) ||
      m.city.toLowerCase().includes(q) ||
      m.state.toLowerCase().includes(q),
  );
}

export function isClosedOn(m: Monument, date: Date): boolean {
  return m.closedDay !== undefined && date.getDay() === m.closedDay;
}

export interface Party {
  adults: number;
  children: number;
  foreign: boolean;
  includeSurcharge: boolean;
}

export interface Quote {
  lines: { label: string; qty: number; each: number; total: number }[];
  total: number;
}

/** Children below the free age are ticketed at zero, and shown as such. */
export function quote(m: Monument, party: Party): Quote {
  const each = party.foreign ? m.feeForeign : m.feeIndian;
  const lines: Quote['lines'] = [];

  if (party.adults > 0) {
    lines.push({
      label: party.foreign ? 'Adult (foreign national)' : 'Adult',
      qty: party.adults, each, total: each * party.adults,
    });
  }

  if (party.children > 0) {
    lines.push({
      label: `Child (under ${m.freeUnderAge})`,
      qty: party.children, each: 0, total: 0,
    });
  }

  if (party.includeSurcharge && m.surcharge) {
    const people = party.adults;
    lines.push({
      label: m.surcharge.label,
      qty: people,
      each: m.surcharge.amount,
      total: m.surcharge.amount * people,
    });
  }

  return { lines, total: lines.reduce((sum, l) => sum + l.total, 0) };
}
