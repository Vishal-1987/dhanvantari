import bcrypt from 'bcryptjs';
import { one, run, tx } from './db.js';

// Demo data centred on Bengaluru. Change the clinics to your real hubs from the admin panel.
const CLINICS = [
  { name: 'Dhanvantari Ayurveda Hub — Jayanagar', kind: 'hub', address: '11th Main Rd, 4th Block, Jayanagar, Bengaluru 560011', phone: '+91 80 4000 1101', lat: 12.9250, lng: 77.5938, vaidya: 'Dr. A. Kulkarni, BAMS' },
  { name: 'Sushruta Ayurvedic Clinic — Indiranagar', kind: 'clinic', address: '100 Feet Rd, HAL 2nd Stage, Indiranagar, Bengaluru 560038', phone: '+91 80 4000 1102', lat: 12.9784, lng: 77.6408, vaidya: 'Dr. R. Menon, MD (Ayu)' },
  { name: 'Charaka Ayurveda Hub — Malleshwaram', kind: 'hub', address: '8th Cross, Sampige Rd, Malleshwaram, Bengaluru 560003', phone: '+91 80 4000 1103', lat: 13.0031, lng: 77.5643, vaidya: 'Dr. S. Bhat, BAMS' },
  { name: 'Vagbhata Wellness Clinic — Whitefield', kind: 'clinic', address: 'ITPL Main Rd, Whitefield, Bengaluru 560066', phone: '+91 80 4000 1104', lat: 12.9698, lng: 77.7500, vaidya: 'Dr. P. Iyer, MD (Ayu)' },
];

// [name, category, form, pack, price, mrp, rx, description, ingredients, dosage]
const MEDICINES = [
  ['Ashwagandha Churna', 'Stress & Sleep', 'Churna', '100 g', 180, 210, 0, 'Classical rasayana traditionally used to support strength, stamina and a calm mind.', 'Withania somnifera root', '3–6 g with warm milk at bedtime, or as advised by your vaidya'],
  ['Brahmi Vati', 'Stress & Sleep', 'Vati', '60 tablets', 220, 250, 0, 'Traditionally used to support memory, focus and restful sleep.', 'Bacopa monnieri, Shankhapushpi', '1–2 tablets twice daily after food'],
  ['Saraswatarishta', 'Stress & Sleep', 'Arishta', '450 ml', 265, 295, 0, 'Fermented herbal tonic described in classical texts for mental clarity.', 'Brahmi, Shatavari, Vacha, Ashwagandha', '15–20 ml with equal water after meals'],
  ['Triphala Churna', 'Digestion', 'Churna', '100 g', 120, 140, 0, 'Three-fruit blend traditionally used for gentle daily cleansing and digestion.', 'Amalaki, Bibhitaki, Haritaki', '3–5 g with warm water at bedtime'],
  ['Hingvastak Churna', 'Digestion', 'Churna', '50 g', 95, 110, 0, 'Classical formulation traditionally taken to ease bloating and support appetite.', 'Hing, Shunthi, Maricha, Pippali, Jeeraka', '1–3 g with the first morsel of food'],
  ['Avipattikar Churna', 'Digestion', 'Churna', '100 g', 140, 160, 0, 'Traditionally used to soothe acidity and support Pitta balance.', 'Trikatu, Triphala, Trivrit, Lavanga', '3–6 g before meals'],
  ['Chyawanprash', 'Immunity', 'Avaleha', '500 g', 340, 380, 0, 'Time-honoured herbal jam rich in amla, used to support immunity and vitality.', 'Amalaki, Dashamoola, Pippali, ghee, honey', '1–2 teaspoons daily with warm milk'],
  ['Giloy Ghan Vati', 'Immunity', 'Vati', '60 tablets', 160, 185, 0, 'Concentrated Guduchi extract traditionally used to support natural defences.', 'Tinospora cordifolia stem extract', '1–2 tablets twice daily'],
  ['Tulsi Drops', 'Immunity', 'Extract', '30 ml', 150, 170, 0, 'Panch-tulsi concentrate traditionally used during seasonal changes.', 'Five varieties of Ocimum', '2–3 drops in warm water, twice daily'],
  ['Sitopaladi Churna', 'Respiratory', 'Churna', '50 g', 110, 125, 0, 'Classical blend traditionally used to soothe throat and support respiratory comfort.', 'Mishri, Vamsha lochana, Pippali, Ela, Twak', '1–3 g with honey, 2–3 times a day'],
  ['Vasarishta', 'Respiratory', 'Arishta', '450 ml', 210, 240, 0, 'Fermented Vasa preparation traditionally used for chest and breathing comfort.', 'Adhatoda vasica, Dhataki', '15–20 ml with equal water after meals'],
  ['Mahanarayan Taila', 'Joint & Pain', 'Taila', '200 ml', 230, 260, 0, 'Medicated massage oil traditionally used for joint and muscle comfort.', 'Bala, Ashwagandha, Shatavari in sesame oil', 'Warm and massage gently on affected area'],
  ['Yograj Guggulu', 'Joint & Pain', 'Vati', '60 tablets', 195, 220, 0, 'Classical guggulu formulation traditionally used to support joint mobility.', 'Guggulu, Triphala, Chitraka, Pippali', '1–2 tablets twice daily after food'],
  ['Maharasnadi Kashayam', 'Joint & Pain', 'Kashayam', '200 ml', 180, 205, 0, 'Decoction traditionally used for Vata-related stiffness.', 'Rasna, Eranda, Devadaru, Bala', '15 ml with 45 ml warm water before food'],
  ['Arjunarishta', 'Heart & BP', 'Arishta', '450 ml', 240, 270, 0, 'Arjuna bark tonic traditionally used to support cardiac wellness.', 'Terminalia arjuna, Draksha, Madhuka', '15–20 ml with equal water after meals'],
  ['Sarpagandha Ghan Vati', 'Heart & BP', 'Vati', '40 tablets', 210, 240, 1, 'Traditionally used under physician supervision for blood-pressure management.', 'Rauvolfia serpentina extract', 'Only as prescribed by your vaidya'],
  ['Nishamalaki Churna', 'Diabetes Care', 'Churna', '100 g', 150, 170, 0, 'Turmeric and amla blend traditionally used to support healthy sugar metabolism.', 'Haridra, Amalaki', '3 g twice daily before food'],
  ['Chandraprabha Vati', 'Diabetes Care', 'Vati', '60 tablets', 190, 215, 1, 'Classical multi-herb formulation used under supervision for urinary and metabolic health.', 'Shilajit, Guggulu, Vacha, Musta, Loha bhasma', 'Only as prescribed by your vaidya'],
  ['Kumkumadi Tailam', 'Skin & Hair', 'Taila', '12 ml', 420, 480, 0, 'Saffron facial oil traditionally used for radiant, even-toned skin.', 'Kesar, Manjishta, Chandana in sesame oil', '2–3 drops on clean face at night'],
  ['Neelibhringadi Taila', 'Skin & Hair', 'Taila', '200 ml', 260, 295, 0, 'Classical hair oil traditionally used for nourished scalp and hair.', 'Neeli, Bhringaraja, Amla, coconut oil', 'Massage into scalp, wash after 1 hour'],
  ['Manjishtadi Kashayam', 'Skin & Hair', 'Kashayam', '200 ml', 175, 200, 0, 'Blood-purifying decoction traditionally used for clear skin.', 'Manjishta, Haridra, Nimba, Guduchi', '15 ml with 45 ml warm water before food'],
  ['Shatavari Churna', "Women's Health", 'Churna', '100 g', 190, 215, 0, 'Classical rasayana traditionally used to support women’s vitality at every age.', 'Asparagus racemosus root', '3–5 g with warm milk twice daily'],
  ['Ashokarishta', "Women's Health", 'Arishta', '450 ml', 220, 250, 0, 'Traditionally used to support menstrual comfort and balance.', 'Ashoka bark, Dhataki, Musta', '15–20 ml with equal water after meals'],
  ['Dhanwantharam Thailam', "Women's Health", 'Taila', '200 ml', 250, 285, 0, 'Kerala-tradition oil used in post-natal and Vata care massage.', 'Bala, Dashamoola, Yava in sesame oil', 'External massage as advised'],
  ['Amla Rasayana', 'Daily Wellness', 'Churna', '100 g', 130, 150, 0, 'Pure amla powder traditionally valued as a daily rejuvenative.', 'Emblica officinalis fruit', '3–5 g with water every morning'],
  ['Dashamoola Kashayam', 'Daily Wellness', 'Kashayam', '200 ml', 165, 190, 0, 'Ten-root decoction traditionally used to balance Vata.', 'Bilva, Agnimantha, Shyonaka, Patala + 6 roots', '15 ml with 45 ml warm water before food'],
  ['Shilajit Rasayana', 'Daily Wellness', 'Capsule', '30 capsules', 480, 550, 1, 'Purified shilajit traditionally used as a strength rasayana; take under guidance.', 'Shuddha Shilajit', 'Only as prescribed by your vaidya'],
];

const hash = (p) => bcrypt.hashSync(p, 10);

export async function seed() {
  if ((await one('SELECT COUNT(*) AS n FROM users')).n > 0) return false;

  await tx(async () => {
    const clinicIds = [];
    for (const c of CLINICS) {
      clinicIds.push((await run('INSERT INTO clinics (name, kind, address, phone, lat, lng, vaidya) VALUES (?,?,?,?,?,?,?)',
        c.name, c.kind, c.address, c.phone, c.lat, c.lng, c.vaidya)).lastInsertRowid);
    }

    for (const m of MEDICINES) {
      await run(`INSERT INTO medicines (name, category, form, pack, price, mrp, rx, description, ingredients, dosage, stock)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`, ...m, 50 + Math.floor(Math.random() * 150));
    }

    const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
    await run('INSERT INTO users (username, password_hash, role, name, phone) VALUES (?,?,?,?,?)',
      process.env.ADMIN_USERNAME || 'admin', hash(adminPass), 'admin', 'Platform Administrator', '+91 90000 00000');

    for (const [i, id] of clinicIds.entries()) {
      await run('INSERT INTO users (username, password_hash, role, name, phone, clinic_id) VALUES (?,?,?,?,?,?)',
        `clinic${i + 1}`, hash('clinic123'), 'clinic', `${CLINICS[i].name.split(' — ')[1]} Desk`, CLINICS[i].phone, id);
    }

    const riders = [
      ['rider1', 'Ravi Kumar', '+91 98450 11111', 'Bike · KA 01 AB 1234', 12.9352, 77.6245],
      ['rider2', 'Imran Shaikh', '+91 98450 22222', 'Scooter · KA 05 CD 5678', 12.9716, 77.5946],
    ];
    for (const [u, name, phone, vehicle, lat, lng] of riders) {
      await run('INSERT INTO users (username, password_hash, role, name, phone, vehicle, lat, lng) VALUES (?,?,?,?,?,?,?,?)',
        u, hash('rider123'), 'rider', name, phone, vehicle, lat, lng);
    }

    await run('INSERT INTO users (username, password_hash, role, name, phone, address, lat, lng) VALUES (?,?,?,?,?,?,?,?)',
      'demo', hash('demo123'), 'customer', 'Ananya Rao', '+91 99000 12345',
      '22, 9th Cross, BTM Layout 2nd Stage, Bengaluru 560076', 12.9166, 77.6101);
  });
  return true;
}

// Catalogue details added in v2. Filled in only where still empty, so admin edits are never overwritten.
// name: [botanical source, benefits ('|'-separated), doshas balanced, Vaidya's pick]
const DETAILS = {
  'Ashwagandha Churna': ['Withania somnifera', 'Supports strength and stamina|Helps the body adapt to stress|Promotes restful sleep', 'Vata,Kapha', 1],
  'Brahmi Vati': ['Bacopa monnieri', 'Supports memory and focus|Calms an overactive mind|Traditional medhya rasayana', 'Vata,Pitta', 1],
  'Saraswatarishta': ['Bacopa monnieri & Asparagus racemosus', 'Supports mental clarity|Traditional nervine tonic|Gentle on digestion', 'Vata,Pitta', 0],
  'Triphala Churna': ['Emblica, Terminalia bellirica & T. chebula', 'Gentle daily cleanse|Supports regular digestion|Rich natural antioxidant', 'Vata,Pitta,Kapha', 1],
  'Hingvastak Churna': ['Ferula asafoetida blend', 'Eases bloating and gas|Kindles digestive fire (agni)|Taken with the first morsel', 'Vata,Kapha', 0],
  'Avipattikar Churna': ['Operculina turpethum blend', 'Soothes acidity|Cools excess Pitta|Supports smooth elimination', 'Pitta', 0],
  'Chyawanprash': ['Emblica officinalis (Amla)', 'Year-round immunity support|Rich in natural vitamin C|For all ages', 'Vata,Pitta,Kapha', 1],
  'Giloy Ghan Vati': ['Tinospora cordifolia', 'Supports natural defences|Traditional fever-season herb|Concentrated extract', 'Vata,Pitta,Kapha', 0],
  'Tulsi Drops': ['Ocimum sanctum (5 varieties)', 'Seasonal wellness support|Soothes throat|Easy to take in warm water', 'Vata,Kapha', 0],
  'Sitopaladi Churna': ['Rock candy & Piper longum blend', 'Soothes cough and throat|Supports respiratory comfort|Pleasant taste with honey', 'Kapha,Pitta', 1],
  'Vasarishta': ['Adhatoda vasica', 'Supports clear breathing|Traditional chest tonic|Fermented for absorption', 'Kapha', 0],
  'Mahanarayan Taila': ['Sida cordifolia & Withania in sesame oil', 'Relieves joint and muscle stiffness|Warming massage oil|Nourishes tissues', 'Vata', 1],
  'Yograj Guggulu': ['Commiphora mukul', 'Supports joint mobility|Classical Vata-balancing formula|Aids healthy metabolism', 'Vata,Kapha', 0],
  'Maharasnadi Kashayam': ['Pluchea lanceolata blend', 'Eases Vata-type stiffness|Classical decoction|Supports flexibility', 'Vata', 0],
  'Arjunarishta': ['Terminalia arjuna', 'Supports heart health|Traditional cardiac tonic|Gentle daily use', 'Pitta,Kapha', 1],
  'Sarpagandha Ghan Vati': ['Rauvolfia serpentina', 'Used for blood-pressure care|Physician-supervised only|Calming herb', 'Vata,Pitta', 0],
  'Nishamalaki Churna': ['Curcuma longa & Emblica officinalis', 'Supports healthy sugar metabolism|Turmeric and amla synergy|Antioxidant rich', 'Kapha,Pitta', 0],
  'Chandraprabha Vati': ['Shilajit & Commiphora mukul blend', 'Urinary and metabolic support|Physician-supervised only|Classical multi-herb formula', 'Vata,Pitta,Kapha', 0],
  'Kumkumadi Tailam': ['Crocus sativus (Saffron)', 'For radiant, even-toned skin|Night-time facial oil|Traditional beauty elixir', 'Vata,Pitta', 1],
  'Neelibhringadi Taila': ['Indigofera tinctoria & Eclipta alba', 'Nourishes scalp and hair|Supports thicker-looking hair|Cooling head massage', 'Pitta', 0],
  'Manjishtadi Kashayam': ['Rubia cordifolia', 'Supports clear skin|Traditional blood purifier|Cools excess Pitta', 'Pitta,Kapha', 0],
  'Shatavari Churna': ['Asparagus racemosus', 'Women’s vitality at every age|Nourishing rasayana|Supports hormonal balance', 'Vata,Pitta', 1],
  'Ashokarishta': ['Saraca asoca', 'Supports menstrual comfort|Classical women’s tonic|Fermented for absorption', 'Pitta', 0],
  'Dhanwantharam Thailam': ['Sida cordifolia & Dashamoola in sesame oil', 'Post-natal massage care|Strengthens and nourishes|Kerala tradition', 'Vata', 0],
  'Amla Rasayana': ['Emblica officinalis', 'Daily rejuvenation|Natural vitamin C|Supports skin, hair and eyes', 'Vata,Pitta,Kapha', 0],
  'Dashamoola Kashayam': ['Ten-root blend (Dashamoola)', 'Balances Vata|Supports comfort and recovery|Classical decoction', 'Vata', 0],
  'Shilajit Rasayana': ['Asphaltum punjabianum (purified)', 'Strength and stamina rasayana|Rich in fulvic minerals|Take under guidance', 'Vata,Kapha', 0],
};

const CLINIC_SERVICES = {
  'Dhanvantari Ayurveda Hub — Jayanagar': 'Full classical pharmacy|Vaidya on call|Same-day delivery',
  'Sushruta Ayurvedic Clinic — Indiranagar': 'Nadi pariksha consultation|Panchakarma|Prescription dispensing',
  'Charaka Ayurveda Hub — Malleshwaram': 'Full classical pharmacy|Herbal oils & decoctions|Same-day delivery',
  'Vagbhata Wellness Clinic — Whitefield': 'Consultation|Abhyanga & Shirodhara|Prescription dispensing',
};

/** Adds v2 details to existing rows (safe to run on every start). Returns how many rows changed. */
export async function enrich() {
  let changed = 0;
  for (const [name, [botanical, benefits, dosha, featured]] of Object.entries(DETAILS)) {
    changed += (await run('UPDATE medicines SET botanical = ?, benefits = ?, dosha = ?, featured = ? WHERE name = ? AND botanical IS NULL',
      botanical, benefits, dosha, featured, name)).changes;
  }
  for (const [name, services] of Object.entries(CLINIC_SERVICES)) {
    changed += (await run('UPDATE clinics SET services = ? WHERE name = ? AND services IS NULL', services, name)).changes;
  }
  return changed;
}
