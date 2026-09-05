/**
 * Monument catalogue.
 *
 * Fees and timings are indicative public information and drift over time — ASI
 * revises them periodically. A production build should read these from the
 * booking provider (see `booking.ts`) rather than trusting this file, which
 * exists so the concierge has something real to talk about offline.
 *
 * Sites with no entry fee are listed too. They cannot be booked, but a
 * traveller who asks for one should be told it is free rather than told it
 * does not exist — see `isFreeEntry`.
 */

export type Authority = 'ASI' | 'State' | 'Trust';

export interface Monument {
  id: string;
  name: string;
  city: string;
  state: string;
  authority: Authority;
  /** Indicative fee in rupees for an Indian national. 0 means free entry. */
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
  // ── Delhi ──────────────────────────────────────────────────────────────
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
    id: 'jantar-mantar-delhi',
    name: 'Jantar Mantar, Delhi',
    city: 'Delhi', state: 'Delhi', authority: 'ASI',
    feeIndian: 25, feeForeign: 300,
    freeUnderAge: 15,
    opens: '06:00', closes: '18:00',
    blurb: 'Masonry instruments built to track the sun and stars by eye.',
  },
  {
    id: 'purana-qila',
    name: 'Purana Qila',
    city: 'Delhi', state: 'Delhi', authority: 'ASI',
    feeIndian: 25, feeForeign: 300,
    freeUnderAge: 15,
    opens: '07:00', closes: '17:00',
    blurb: 'The old fort on a mound said to be the site of Indraprastha.',
  },
  {
    id: 'safdarjung-tomb',
    name: 'Safdarjung’s Tomb',
    city: 'Delhi', state: 'Delhi', authority: 'ASI',
    feeIndian: 25, feeForeign: 300,
    freeUnderAge: 15,
    opens: '07:00', closes: '17:00',
    blurb: 'The last of the great Mughal garden tombs, finished in 1754.',
  },
  {
    id: 'national-museum-delhi',
    name: 'National Museum',
    city: 'Delhi', state: 'Delhi', authority: 'State',
    feeIndian: 20, feeForeign: 650,
    freeUnderAge: 12, closedDay: 1,
    opens: '10:00', closes: '18:00',
    blurb: 'Five thousand years of Indian art under one roof on Janpath.',
  },
  {
    id: 'lotus-temple',
    name: 'Lotus Temple',
    city: 'Delhi', state: 'Delhi', authority: 'Trust',
    feeIndian: 0, feeForeign: 0,
    freeUnderAge: 0, closedDay: 1,
    opens: '09:00', closes: '17:30',
    blurb: 'A Bahá’í house of worship shaped as an opening lotus. Free entry.',
  },
  {
    id: 'akshardham-delhi',
    name: 'Akshardham',
    city: 'Delhi', state: 'Delhi', authority: 'Trust',
    feeIndian: 0, feeForeign: 0,
    freeUnderAge: 0, closedDay: 1,
    opens: '09:30', closes: '18:30',
    blurb: 'A vast carved sandstone temple complex. Entry is free; exhibitions are ticketed inside.',
  },
  {
    id: 'india-gate',
    name: 'India Gate',
    city: 'Delhi', state: 'Delhi', authority: 'State',
    feeIndian: 0, feeForeign: 0,
    freeUnderAge: 0,
    opens: '00:00', closes: '24:00',
    blurb: 'The war memorial arch on Kartavya Path. Open at all hours, no ticket.',
  },

  // ── Agra and Uttar Pradesh ─────────────────────────────────────────────
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
    id: 'itmad-ud-daulah',
    name: 'Itmad-ud-Daulah’s Tomb',
    city: 'Agra', state: 'Uttar Pradesh', authority: 'ASI',
    feeIndian: 30, feeForeign: 310,
    freeUnderAge: 15,
    opens: '06:00', closes: '18:00',
    blurb: 'The inlaid marble tomb known as the Baby Taj, across the Yamuna.',
  },
  {
    id: 'sarnath',
    name: 'Sarnath',
    city: 'Varanasi', state: 'Uttar Pradesh', authority: 'ASI',
    feeIndian: 25, feeForeign: 300,
    freeUnderAge: 15,
    opens: '06:00', closes: '18:00',
    blurb: 'Where the Buddha gave his first sermon, marked by the Dhamek Stupa.',
  },
  {
    id: 'bara-imambara',
    name: 'Bara Imambara',
    city: 'Lucknow', state: 'Uttar Pradesh', authority: 'Trust',
    feeIndian: 50, feeForeign: 500,
    freeUnderAge: 7,
    opens: '06:00', closes: '17:00',
    blurb: 'A vaulted hall with no supporting beams, and the Bhulbhulaiya maze above.',
  },
  {
    id: 'residency-lucknow',
    name: 'The Residency',
    city: 'Lucknow', state: 'Uttar Pradesh', authority: 'ASI',
    feeIndian: 25, feeForeign: 300,
    freeUnderAge: 15,
    opens: '07:00', closes: '18:00',
    blurb: 'Shell-scarred ruins left as they stood after the 1857 siege.',
  },

  // ── Rajasthan ──────────────────────────────────────────────────────────
  {
    id: 'amber-fort',
    name: 'Amber Fort',
    city: 'Jaipur', state: 'Rajasthan', authority: 'State',
    feeIndian: 100, feeForeign: 500,
    freeUnderAge: 7,
    opens: '08:00', closes: '17:30',
    blurb: 'A hilltop palace of mirrored halls above Maota Lake.',
  },
  {
    id: 'hawa-mahal',
    name: 'Hawa Mahal',
    city: 'Jaipur', state: 'Rajasthan', authority: 'State',
    feeIndian: 50, feeForeign: 200,
    freeUnderAge: 7,
    opens: '09:00', closes: '16:30',
    blurb: 'The five-storey lattice screen built so royal women could watch the street.',
  },
  {
    id: 'city-palace-jaipur',
    name: 'City Palace, Jaipur',
    city: 'Jaipur', state: 'Rajasthan', authority: 'Trust',
    feeIndian: 200, feeForeign: 700,
    freeUnderAge: 5,
    opens: '09:30', closes: '17:00',
    blurb: 'Still a royal residence, with courtyards and an armoury open to visitors.',
  },
  {
    id: 'jantar-mantar-jaipur',
    name: 'Jantar Mantar, Jaipur',
    city: 'Jaipur', state: 'Rajasthan', authority: 'State',
    feeIndian: 50, feeForeign: 200,
    freeUnderAge: 7,
    opens: '09:00', closes: '16:30',
    blurb: 'The largest stone sundial in the world, accurate to two seconds.',
  },
  {
    id: 'nahargarh-fort',
    name: 'Nahargarh Fort',
    city: 'Jaipur', state: 'Rajasthan', authority: 'State',
    feeIndian: 50, feeForeign: 200,
    freeUnderAge: 7,
    opens: '10:00', closes: '17:30',
    blurb: 'The ridge fort that looks down over the whole of the pink city.',
  },
  {
    id: 'albert-hall-museum',
    name: 'Albert Hall Museum',
    city: 'Jaipur', state: 'Rajasthan', authority: 'State',
    feeIndian: 40, feeForeign: 300,
    freeUnderAge: 7,
    opens: '09:00', closes: '17:00',
    blurb: 'Rajasthan’s oldest museum, in an Indo-Saracenic hall in Ram Niwas Garden.',
  },
  {
    id: 'mehrangarh',
    name: 'Mehrangarh Fort',
    city: 'Jodhpur', state: 'Rajasthan', authority: 'Trust',
    feeIndian: 100, feeForeign: 600,
    freeUnderAge: 7,
    opens: '09:00', closes: '17:00',
    blurb: 'A fort on a cliff, 120 metres above the blue houses of Jodhpur.',
  },
  {
    id: 'umaid-bhawan',
    name: 'Umaid Bhawan Palace Museum',
    city: 'Jodhpur', state: 'Rajasthan', authority: 'Trust',
    feeIndian: 30, feeForeign: 100,
    freeUnderAge: 5,
    opens: '09:00', closes: '17:00',
    blurb: 'Part palace, part hotel, part museum of vintage cars and clocks.',
  },
  {
    id: 'city-palace-udaipur',
    name: 'City Palace, Udaipur',
    city: 'Udaipur', state: 'Rajasthan', authority: 'Trust',
    feeIndian: 300, feeForeign: 300,
    freeUnderAge: 5,
    opens: '09:30', closes: '17:30',
    blurb: 'A granite and marble palace rising straight out of Lake Pichola.',
  },
  {
    id: 'chittorgarh',
    name: 'Chittorgarh Fort',
    city: 'Chittorgarh', state: 'Rajasthan', authority: 'ASI',
    feeIndian: 40, feeForeign: 600,
    freeUnderAge: 15,
    opens: '09:45', closes: '18:15',
    blurb: 'The largest fort in India, and the site of three sieges.',
  },
  {
    id: 'kumbhalgarh',
    name: 'Kumbhalgarh Fort',
    city: 'Rajsamand', state: 'Rajasthan', authority: 'ASI',
    feeIndian: 40, feeForeign: 600,
    freeUnderAge: 15,
    opens: '09:00', closes: '18:00',
    blurb: 'Thirty-six kilometres of wall, second only to the Great Wall of China.',
  },
  {
    id: 'jaisalmer-fort',
    name: 'Jaisalmer Fort',
    city: 'Jaisalmer', state: 'Rajasthan', authority: 'State',
    feeIndian: 50, feeForeign: 250,
    freeUnderAge: 7,
    opens: '09:00', closes: '18:00',
    blurb: 'A living fort of yellow sandstone; people still live inside the walls.',
  },
  {
    id: 'ranakpur',
    name: 'Ranakpur Jain Temple',
    city: 'Ranakpur', state: 'Rajasthan', authority: 'Trust',
    feeIndian: 200, feeForeign: 200,
    freeUnderAge: 5,
    opens: '12:00', closes: '17:00',
    blurb: '1,444 marble pillars, no two carved alike. Visitors enter after noon.',
  },

  // ── Punjab and the north ───────────────────────────────────────────────
  {
    id: 'golden-temple',
    name: 'Golden Temple',
    city: 'Amritsar', state: 'Punjab', authority: 'Trust',
    feeIndian: 0, feeForeign: 0,
    freeUnderAge: 0,
    opens: '00:00', closes: '24:00',
    blurb: 'Harmandir Sahib, open day and night to everyone. No ticket, ever.',
  },
  {
    id: 'jallianwala-bagh',
    name: 'Jallianwala Bagh',
    city: 'Amritsar', state: 'Punjab', authority: 'State',
    feeIndian: 0, feeForeign: 0,
    freeUnderAge: 0,
    opens: '09:00', closes: '17:00',
    blurb: 'The walled garden where troops fired on a crowd in 1919. Free entry.',
  },
  {
    id: 'leh-palace',
    name: 'Leh Palace',
    city: 'Leh', state: 'Ladakh', authority: 'ASI',
    feeIndian: 25, feeForeign: 300,
    freeUnderAge: 15,
    opens: '07:00', closes: '16:00',
    blurb: 'A nine-storey palace modelled on the Potala, above the old town.',
  },
  {
    id: 'thiksey',
    name: 'Thiksey Monastery',
    city: 'Leh', state: 'Ladakh', authority: 'Trust',
    feeIndian: 50, feeForeign: 50,
    freeUnderAge: 10,
    opens: '07:00', closes: '19:00',
    blurb: 'Twelve storeys of white and ochre, with a 15-metre Maitreya Buddha.',
  },
  {
    id: 'shalimar-bagh',
    name: 'Shalimar Bagh',
    city: 'Srinagar', state: 'Jammu and Kashmir', authority: 'State',
    feeIndian: 50, feeForeign: 100,
    freeUnderAge: 7,
    opens: '09:00', closes: '19:00',
    blurb: 'The Mughal terraced garden laid out for Nur Jahan beside Dal Lake.',
  },

  // ── Madhya Pradesh ─────────────────────────────────────────────────────
  {
    id: 'khajuraho',
    name: 'Khajuraho Temples',
    city: 'Khajuraho', state: 'Madhya Pradesh', authority: 'ASI',
    feeIndian: 40, feeForeign: 600,
    freeUnderAge: 15,
    opens: '08:00', closes: '18:00',
    blurb: 'Chandela temples carved with some of the finest sculpture in India.',
  },
  {
    id: 'sanchi',
    name: 'Sanchi Stupa',
    city: 'Sanchi', state: 'Madhya Pradesh', authority: 'ASI',
    feeIndian: 40, feeForeign: 600,
    freeUnderAge: 15,
    opens: '06:30', closes: '18:30',
    blurb: 'The oldest stone structure in India, begun under Ashoka.',
  },
  {
    id: 'gwalior-fort',
    name: 'Gwalior Fort',
    city: 'Gwalior', state: 'Madhya Pradesh', authority: 'ASI',
    feeIndian: 25, feeForeign: 300,
    freeUnderAge: 15,
    opens: '08:00', closes: '17:30',
    blurb: 'A sandstone fort on a plateau, with the earliest written zero in India.',
  },
  {
    id: 'orchha',
    name: 'Orchha Fort',
    city: 'Orchha', state: 'Madhya Pradesh', authority: 'ASI',
    feeIndian: 25, feeForeign: 300,
    freeUnderAge: 15,
    opens: '09:00', closes: '17:00',
    blurb: 'Bundela palaces and cenotaphs on an island in the Betwa river.',
  },
  {
    id: 'bhimbetka',
    name: 'Bhimbetka Rock Shelters',
    city: 'Raisen', state: 'Madhya Pradesh', authority: 'ASI',
    feeIndian: 40, feeForeign: 600,
    freeUnderAge: 15,
    opens: '07:00', closes: '18:00',
    blurb: 'Painted shelters with images going back thirty thousand years.',
  },
  {
    id: 'mandu',
    name: 'Mandu',
    city: 'Mandu', state: 'Madhya Pradesh', authority: 'ASI',
    feeIndian: 25, feeForeign: 300,
    freeUnderAge: 15,
    opens: '08:00', closes: '18:00',
    blurb: 'A ruined hill city of pavilions, best seen in the monsoon.',
  },

  // ── Maharashtra ────────────────────────────────────────────────────────
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
    id: 'bibi-ka-maqbara',
    name: 'Bibi Ka Maqbara',
    city: 'Aurangabad', state: 'Maharashtra', authority: 'ASI',
    feeIndian: 25, feeForeign: 300,
    freeUnderAge: 15,
    opens: '08:00', closes: '20:00',
    blurb: 'A tomb built in the Taj’s image by Aurangzeb’s son for his mother.',
  },
  {
    id: 'daulatabad',
    name: 'Daulatabad Fort',
    city: 'Aurangabad', state: 'Maharashtra', authority: 'ASI',
    feeIndian: 40, feeForeign: 300,
    freeUnderAge: 15,
    opens: '09:00', closes: '18:00',
    blurb: 'A conical hill fort reached through a deliberately confusing dark passage.',
  },
  {
    id: 'elephanta',
    name: 'Elephanta Caves',
    city: 'Mumbai', state: 'Maharashtra', authority: 'ASI',
    feeIndian: 40, feeForeign: 600,
    freeUnderAge: 15, closedDay: 1,
    opens: '09:00', closes: '17:00',
    blurb: 'Shiva caves on an island an hour by ferry from the Gateway.',
  },
  {
    id: 'gateway-of-india',
    name: 'Gateway of India',
    city: 'Mumbai', state: 'Maharashtra', authority: 'State',
    feeIndian: 0, feeForeign: 0,
    freeUnderAge: 0,
    opens: '00:00', closes: '24:00',
    blurb: 'The basalt arch on the Mumbai waterfront. No ticket needed.',
  },
  {
    id: 'chhatrapati-shivaji-terminus',
    name: 'Chhatrapati Shivaji Terminus',
    city: 'Mumbai', state: 'Maharashtra', authority: 'State',
    feeIndian: 0, feeForeign: 0,
    freeUnderAge: 0,
    opens: '00:00', closes: '24:00',
    blurb: 'A working railway station and a World Heritage Site. Free to walk past.',
  },
  {
    id: 'shaniwar-wada',
    name: 'Shaniwar Wada',
    city: 'Pune', state: 'Maharashtra', authority: 'ASI',
    feeIndian: 25, feeForeign: 300,
    freeUnderAge: 15,
    opens: '08:00', closes: '18:30',
    blurb: 'The Peshwa seat, its palace burnt away and its gates still standing.',
  },
  {
    id: 'aga-khan-palace',
    name: 'Aga Khan Palace',
    city: 'Pune', state: 'Maharashtra', authority: 'ASI',
    feeIndian: 25, feeForeign: 300,
    freeUnderAge: 15,
    opens: '09:00', closes: '17:30',
    blurb: 'Where Gandhi and Kasturba were interned after the Quit India call.',
  },
  {
    id: 'raigad-fort',
    name: 'Raigad Fort',
    city: 'Raigad', state: 'Maharashtra', authority: 'State',
    feeIndian: 25, feeForeign: 100,
    freeUnderAge: 7,
    opens: '08:00', closes: '18:00',
    blurb: 'Shivaji’s capital, 820 metres up, reached by steps or ropeway.',
  },

  // ── Gujarat ────────────────────────────────────────────────────────────
  {
    id: 'rani-ki-vav',
    name: 'Rani ki Vav',
    city: 'Patan', state: 'Gujarat', authority: 'ASI',
    feeIndian: 40, feeForeign: 600,
    freeUnderAge: 15,
    opens: '08:30', closes: '18:00',
    blurb: 'An eleventh-century stepwell of seven storeys, carved all the way down.',
  },
  {
    id: 'champaner',
    name: 'Champaner-Pavagadh',
    city: 'Panchmahal', state: 'Gujarat', authority: 'ASI',
    feeIndian: 40, feeForeign: 600,
    freeUnderAge: 15,
    opens: '08:00', closes: '18:00',
    blurb: 'A pre-Mughal city left largely as it was, below a pilgrimage hill.',
  },
  {
    id: 'statue-of-unity',
    name: 'Statue of Unity',
    city: 'Kevadia', state: 'Gujarat', authority: 'State',
    feeIndian: 150, feeForeign: 150,
    surcharge: { label: 'Viewing gallery', amount: 200 },
    freeUnderAge: 3, closedDay: 1,
    opens: '08:00', closes: '18:00',
    blurb: 'At 182 metres, the tallest statue in the world.',
  },
  {
    id: 'sabarmati-ashram',
    name: 'Sabarmati Ashram',
    city: 'Ahmedabad', state: 'Gujarat', authority: 'Trust',
    feeIndian: 0, feeForeign: 0,
    freeUnderAge: 0,
    opens: '08:30', closes: '18:30',
    blurb: 'Gandhi’s home for thirteen years, and the start of the Salt March. Free.',
  },
  {
    id: 'somnath',
    name: 'Somnath Temple',
    city: 'Veraval', state: 'Gujarat', authority: 'Trust',
    feeIndian: 0, feeForeign: 0,
    freeUnderAge: 0,
    opens: '06:00', closes: '21:00',
    blurb: 'Rebuilt many times on the Arabian Sea shore. No entry fee.',
  },

  // ── Karnataka ──────────────────────────────────────────────────────────
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
    id: 'badami-caves',
    name: 'Badami Cave Temples',
    city: 'Badami', state: 'Karnataka', authority: 'ASI',
    feeIndian: 25, feeForeign: 300,
    freeUnderAge: 15,
    opens: '09:00', closes: '17:30',
    blurb: 'Four temples cut into a red sandstone cliff by the Chalukyas.',
  },
  {
    id: 'pattadakal',
    name: 'Pattadakal',
    city: 'Bagalkot', state: 'Karnataka', authority: 'ASI',
    feeIndian: 40, feeForeign: 600,
    freeUnderAge: 15,
    opens: '08:30', closes: '17:30',
    blurb: 'Ten temples where northern and southern styles were tried side by side.',
  },
  {
    id: 'belur',
    name: 'Chennakeshava Temple, Belur',
    city: 'Belur', state: 'Karnataka', authority: 'ASI',
    feeIndian: 0, feeForeign: 0,
    freeUnderAge: 0,
    opens: '07:30', closes: '19:00',
    blurb: 'A Hoysala temple covered in bracket figures. Free to enter.',
  },
  {
    id: 'halebidu',
    name: 'Hoysaleswara Temple, Halebidu',
    city: 'Halebidu', state: 'Karnataka', authority: 'ASI',
    feeIndian: 0, feeForeign: 0,
    freeUnderAge: 0,
    opens: '06:30', closes: '18:00',
    blurb: 'Friezes of elephants, lions and horsemen running the length of the walls.',
  },
  {
    id: 'tipu-palace',
    name: 'Tipu Sultan’s Summer Palace',
    city: 'Bengaluru', state: 'Karnataka', authority: 'ASI',
    feeIndian: 25, feeForeign: 300,
    freeUnderAge: 15,
    opens: '08:30', closes: '17:30',
    blurb: 'A teak palace of arches and balconies in the old city.',
  },
  {
    id: 'bangalore-palace',
    name: 'Bangalore Palace',
    city: 'Bengaluru', state: 'Karnataka', authority: 'Trust',
    feeIndian: 250, feeForeign: 500,
    freeUnderAge: 5,
    opens: '10:00', closes: '17:30',
    blurb: 'Tudor towers and turrets, built by the Wodeyars in 1878.',
  },
  {
    id: 'lalbagh',
    name: 'Lalbagh Botanical Garden',
    city: 'Bengaluru', state: 'Karnataka', authority: 'State',
    feeIndian: 25, feeForeign: 60,
    freeUnderAge: 12,
    opens: '06:00', closes: '19:00',
    blurb: 'A garden begun by Hyder Ali, with a glass house modelled on Crystal Palace.',
  },

  // ── Tamil Nadu and Kerala ──────────────────────────────────────────────
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
    id: 'brihadeeswarar',
    name: 'Brihadeeswarar Temple',
    city: 'Thanjavur', state: 'Tamil Nadu', authority: 'ASI',
    feeIndian: 0, feeForeign: 0,
    freeUnderAge: 0,
    opens: '06:00', closes: '20:30',
    blurb: 'A Chola temple whose granite tower has stood a thousand years. Free entry.',
  },
  {
    id: 'meenakshi-temple',
    name: 'Meenakshi Amman Temple',
    city: 'Madurai', state: 'Tamil Nadu', authority: 'Trust',
    feeIndian: 0, feeForeign: 0,
    freeUnderAge: 0,
    opens: '05:00', closes: '22:00',
    blurb: 'Fourteen gopurams packed with painted figures. Entry free; camera charged.',
  },
  {
    id: 'thanjavur-palace',
    name: 'Thanjavur Maratha Palace',
    city: 'Thanjavur', state: 'Tamil Nadu', authority: 'State',
    feeIndian: 50, feeForeign: 100,
    freeUnderAge: 7,
    opens: '09:00', closes: '18:00',
    blurb: 'A palace holding the Saraswathi Mahal library and a bronze gallery.',
  },
  {
    id: 'fort-st-george',
    name: 'Fort St George',
    city: 'Chennai', state: 'Tamil Nadu', authority: 'ASI',
    feeIndian: 25, feeForeign: 300,
    freeUnderAge: 15, closedDay: 5,
    opens: '09:00', closes: '17:00',
    blurb: 'The first English fortress in India, from 1644, still in official use.',
  },
  {
    id: 'mattancherry-palace',
    name: 'Mattancherry Palace',
    city: 'Kochi', state: 'Kerala', authority: 'ASI',
    feeIndian: 25, feeForeign: 300,
    freeUnderAge: 15, closedDay: 5,
    opens: '09:00', closes: '17:00',
    blurb: 'The Dutch Palace, lined with murals of the Ramayana.',
  },
  {
    id: 'padmanabhaswamy',
    name: 'Padmanabhaswamy Temple',
    city: 'Thiruvananthapuram', state: 'Kerala', authority: 'Trust',
    feeIndian: 0, feeForeign: 0,
    freeUnderAge: 0,
    opens: '03:30', closes: '19:00',
    blurb: 'Vishnu reclining in gold. Free, with a strict dress code.',
  },
  {
    id: 'bekal-fort',
    name: 'Bekal Fort',
    city: 'Kasaragod', state: 'Kerala', authority: 'ASI',
    feeIndian: 25, feeForeign: 300,
    freeUnderAge: 15,
    opens: '08:00', closes: '17:30',
    blurb: 'A keyhole-shaped laterite fort standing out into the Arabian Sea.',
  },

  // ── Telangana, Andhra Pradesh, Goa ─────────────────────────────────────
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
  {
    id: 'chowmahalla',
    name: 'Chowmahalla Palace',
    city: 'Hyderabad', state: 'Telangana', authority: 'Trust',
    feeIndian: 80, feeForeign: 200,
    freeUnderAge: 5, closedDay: 5,
    opens: '10:00', closes: '17:00',
    blurb: 'The Nizams’ seat, with a durbar hall under Belgian chandeliers.',
  },
  {
    id: 'salar-jung',
    name: 'Salar Jung Museum',
    city: 'Hyderabad', state: 'Telangana', authority: 'State',
    feeIndian: 50, feeForeign: 500,
    freeUnderAge: 12, closedDay: 5,
    opens: '10:00', closes: '17:00',
    blurb: 'One man’s collection, including the Veiled Rebecca and a musical clock.',
  },
  {
    id: 'ramappa',
    name: 'Ramappa Temple',
    city: 'Warangal', state: 'Telangana', authority: 'ASI',
    feeIndian: 25, feeForeign: 300,
    freeUnderAge: 15,
    opens: '06:00', closes: '18:00',
    blurb: 'A Kakatiya temple built on floating bricks that will not sink in water.',
  },
  {
    id: 'lepakshi',
    name: 'Lepakshi Temple',
    city: 'Lepakshi', state: 'Andhra Pradesh', authority: 'ASI',
    feeIndian: 25, feeForeign: 300,
    freeUnderAge: 15,
    opens: '06:00', closes: '18:00',
    blurb: 'Home of the hanging pillar and a monolithic Nandi.',
  },
  {
    id: 'basilica-bom-jesus',
    name: 'Basilica of Bom Jesus',
    city: 'Old Goa', state: 'Goa', authority: 'Trust',
    feeIndian: 0, feeForeign: 0,
    freeUnderAge: 0,
    opens: '09:00', closes: '18:30',
    blurb: 'Holds the remains of St Francis Xavier. Free to enter.',
  },
  {
    id: 'aguada-fort',
    name: 'Fort Aguada',
    city: 'Candolim', state: 'Goa', authority: 'State',
    feeIndian: 50, feeForeign: 100,
    freeUnderAge: 7,
    opens: '09:30', closes: '17:30',
    blurb: 'A Portuguese fort and lighthouse guarding the Mandovi mouth.',
  },

  // ── East and north-east ────────────────────────────────────────────────
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
    id: 'udayagiri-khandagiri',
    name: 'Udayagiri and Khandagiri Caves',
    city: 'Bhubaneswar', state: 'Odisha', authority: 'ASI',
    feeIndian: 25, feeForeign: 300,
    freeUnderAge: 15,
    opens: '08:00', closes: '18:00',
    blurb: 'Jain cells cut into two facing hills in the second century BCE.',
  },
  {
    id: 'victoria-memorial',
    name: 'Victoria Memorial',
    city: 'Kolkata', state: 'West Bengal', authority: 'State',
    feeIndian: 30, feeForeign: 500,
    freeUnderAge: 12, closedDay: 1,
    opens: '10:00', closes: '17:00',
    blurb: 'White marble and a garden in the middle of the Maidan.',
  },
  {
    id: 'indian-museum',
    name: 'Indian Museum',
    city: 'Kolkata', state: 'West Bengal', authority: 'State',
    feeIndian: 50, feeForeign: 500,
    freeUnderAge: 5, closedDay: 1,
    opens: '10:00', closes: '17:00',
    blurb: 'The oldest museum in India, opened in 1814.',
  },
  {
    id: 'hazarduari',
    name: 'Hazarduari Palace',
    city: 'Murshidabad', state: 'West Bengal', authority: 'ASI',
    feeIndian: 25, feeForeign: 300,
    freeUnderAge: 15, closedDay: 5,
    opens: '09:00', closes: '17:00',
    blurb: 'A thousand doors, of which nine hundred are painted on the wall.',
  },
  {
    id: 'nalanda',
    name: 'Nalanda',
    city: 'Nalanda', state: 'Bihar', authority: 'ASI',
    feeIndian: 40, feeForeign: 600,
    freeUnderAge: 15,
    opens: '09:00', closes: '17:00',
    blurb: 'The brick remains of a university that taught for seven hundred years.',
  },
  {
    id: 'mahabodhi',
    name: 'Mahabodhi Temple',
    city: 'Bodh Gaya', state: 'Bihar', authority: 'Trust',
    feeIndian: 0, feeForeign: 0,
    freeUnderAge: 0,
    opens: '05:00', closes: '21:00',
    blurb: 'The Bodhi tree under which the Buddha woke. Free to enter.',
  },
  {
    id: 'kamakhya',
    name: 'Kamakhya Temple',
    city: 'Guwahati', state: 'Assam', authority: 'Trust',
    feeIndian: 0, feeForeign: 0,
    freeUnderAge: 0,
    opens: '05:30', closes: '22:00',
    blurb: 'A hilltop shakti temple above the Brahmaputra. No entry fee.',
  },
  {
    id: 'kaziranga',
    name: 'Kaziranga National Park',
    city: 'Golaghat', state: 'Assam', authority: 'State',
    feeIndian: 100, feeForeign: 650,
    freeUnderAge: 12,
    opens: '08:00', closes: '16:00',
    blurb: 'Two-thirds of the world’s one-horned rhinos. Shut through the monsoon.',
  },
  {
    id: 'rumtek',
    name: 'Rumtek Monastery',
    city: 'Gangtok', state: 'Sikkim', authority: 'Trust',
    feeIndian: 20, feeForeign: 20,
    freeUnderAge: 10,
    opens: '06:00', closes: '18:00',
    blurb: 'The seat of the Karmapa in exile, above the Gangtok valley.',
  },
];

/** Sites that charge nothing. They can be described, but never booked. */
export function isFreeEntry(m: Monument): boolean {
  return m.feeIndian === 0 && m.feeForeign === 0 && !m.surcharge;
}

export function monumentById(id: string): Monument | undefined {
  return MONUMENTS.find((m) => m.id === id);
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
