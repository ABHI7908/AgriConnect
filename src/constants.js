'use strict';

/** Machinery / agritech categories shown in filters and listing forms. */
const TOOL_CATEGORIES = [
  { id: 'tractor', label: 'Tractor' },
  { id: 'harvester', label: 'Harvester' },
  { id: 'drone', label: 'Spraying / Survey Drone' },
  { id: 'rotavator', label: 'Rotavator / Cultivator' },
  { id: 'plough', label: 'Plough / Disc Harrow' },
  { id: 'seed_drill', label: 'Seed Drill / Planter' },
  { id: 'transplanter', label: 'Paddy Transplanter' },
  { id: 'sprayer', label: 'Power Sprayer' },
  { id: 'thresher', label: 'Thresher' },
  { id: 'baler', label: 'Baler' },
  { id: 'water_pump', label: 'Water Pump / Sprinkler' },
  { id: 'jcb', label: 'JCB / Earth Mover' },
  { id: 'trolley', label: 'Trolley / Transport' },
  { id: 'other', label: 'Other Equipment' },
];

const LABOUR_SKILLS = [
  { id: 'sowing', label: 'Sowing / Transplanting' },
  { id: 'weeding', label: 'Weeding' },
  { id: 'harvesting', label: 'Harvesting' },
  { id: 'spraying', label: 'Spraying' },
  { id: 'picking', label: 'Fruit / Cotton Picking' },
  { id: 'loading', label: 'Loading / Unloading' },
  { id: 'irrigation', label: 'Irrigation Work' },
  { id: 'general', label: 'General Farm Work' },
];

const TOOL_CATEGORY_IDS = TOOL_CATEGORIES.map((c) => c.id);
const LABOUR_SKILL_IDS = LABOUR_SKILLS.map((c) => c.id);

/**
 * Indicative average yields (kg per acre) used to seed the crops table.
 * These are rough national-level averages and are editable by an admin from the admin panel.
 * price = indicative price in INR per quintal (100 kg); farmers can override both in the calculator.
 */
const DEFAULT_CROPS = [
  { name: 'Paddy (Rice)', kg: 2400, price: 2300, notes: 'Dry paddy, irrigated' },
  { name: 'Wheat', kg: 1800, price: 2400, notes: 'Irrigated' },
  { name: 'Maize', kg: 2500, price: 2200, notes: 'Hybrid, dry grain' },
  { name: 'Jowar (Sorghum)', kg: 800, price: 3200, notes: 'Grain' },
  { name: 'Bajra (Pearl Millet)', kg: 800, price: 2600, notes: 'Grain' },
  { name: 'Ragi (Finger Millet)', kg: 900, price: 4200, notes: 'Grain' },
  { name: 'Red Gram (Tur / Pigeon Pea)', kg: 450, price: 7500, notes: 'Dry grain' },
  { name: 'Bengal Gram (Chana)', kg: 500, price: 5600, notes: 'Dry grain' },
  { name: 'Green Gram (Moong)', kg: 350, price: 8500, notes: 'Dry grain' },
  { name: 'Black Gram (Urad)', kg: 350, price: 7500, notes: 'Dry grain' },
  { name: 'Groundnut', kg: 800, price: 6300, notes: 'Pods' },
  { name: 'Soybean', kg: 700, price: 4800, notes: 'Dry grain' },
  { name: 'Sunflower', kg: 600, price: 7000, notes: 'Seed' },
  { name: 'Mustard', kg: 500, price: 5600, notes: 'Seed' },
  { name: 'Cotton (Seed Cotton / Kapas)', kg: 800, price: 7000, notes: 'Unginned' },
  { name: 'Sugarcane', kg: 40000, price: 340, notes: 'Cane (≈ 40 tonnes)' },
  { name: 'Turmeric (Dry)', kg: 2000, price: 14000, notes: 'Cured, dry rhizome' },
  { name: 'Chilli (Dry)', kg: 800, price: 14000, notes: 'Dry red chilli' },
  { name: 'Onion', kg: 10000, price: 1500, notes: 'Bulb' },
  { name: 'Tomato', kg: 10000, price: 1500, notes: 'Fresh fruit' },
  { name: 'Potato', kg: 9000, price: 1400, notes: 'Tuber' },
];

const BOOKING_STATUSES = ['requested', 'accepted', 'rejected', 'in_progress', 'completed', 'cancelled'];

module.exports = {
  TOOL_CATEGORIES,
  LABOUR_SKILLS,
  TOOL_CATEGORY_IDS,
  LABOUR_SKILL_IDS,
  DEFAULT_CROPS,
  BOOKING_STATUSES,
};
