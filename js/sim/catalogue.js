// catalogue.js — ALL game content in one place. No string appears in the UI that
// is not defined here (verbatim lock: every on-screen string traces to a source).
// Labels are generic hospitality terms plus the wording given in the project brief
// (MOVEin, Hotel Builders, Fan Score, the four scorecard names, the three
// architecture styles and the four accent palettes). Nothing MO-specific is invented.

/** Site geometry. Cells are the unit of placement; `cell` is the world size. */
export const SITE = {
  cols: 12,
  rows: 9,
  cell: 4,
  // Fixed site facts — these are what force real trade-offs.
  arrival: { col: 5, row: 8, label: 'Arrival Court' },        // guests enter here (south)
  service: { col: 5, row: 0, label: 'Service Yard' },         // goods, colleagues, waste (north)
  viewEdgeCol: 11,                                             // river/garden frontage (east)
  heritage: { col: 2, row: 4, w: 2, h: 2, label: 'Heritage Pavilion' }, // preserve, never demolish
};

/** categories: G = guest-facing, B = back of house, P = people & culture */
export const CATEGORIES = {
  G: 'Guest-facing',
  B: 'Back of house',
  P: 'People & Culture',
};

/**
 * Buildable functions. cost is in build credits; w/h are footprint cells in the
 * default (0°) orientation; keys/covers/seats are capacity contributions.
 * `noisy` is the vibration/noise radius strength used by the adjacency rules.
 */
export const FUNCTIONS = [
  // — Guest-facing —
  { id: 'rooms',     label: 'Rooms Wing',              cat: 'G', w: 4, h: 3, cost: 120, keys: 60, massing: 'rooms',  storeys: 6 },
  { id: 'front',     label: 'Front Office',            cat: 'G', w: 3, h: 2, cost: 45,  massing: 'public', storeys: 2 },
  { id: 'concierge', label: 'Concierge Desk',          cat: 'G', w: 1, h: 1, cost: 12,  massing: 'kiosk',  storeys: 1 },
  { id: 'fnb',       label: 'Restaurant & Bar',        cat: 'G', w: 3, h: 2, cost: 60,  covers: 80, massing: 'public', storeys: 1 },
  { id: 'fnb2',      label: 'Speciality Restaurant',   cat: 'G', w: 2, h: 2, cost: 48,  covers: 40, massing: 'public', storeys: 1 },
  { id: 'spa',       label: 'Spa & Wellness',          cat: 'G', w: 3, h: 2, cost: 55,  massing: 'spa',    storeys: 1 },
  { id: 'pool',      label: 'Pool Terrace',            cat: 'G', w: 3, h: 2, cost: 30,  massing: 'pool',   storeys: 0 },
  { id: 'ballroom',  label: 'Ballroom & Events',       cat: 'G', w: 3, h: 3, cost: 70,  seats: 120, massing: 'hall', storeys: 1 },
  // — Back of house —
  { id: 'kitchen',   label: 'Main Kitchen',            cat: 'B', w: 3, h: 2, cost: 50,  massing: 'boh',   storeys: 1, noisy: 1 },
  { id: 'steward',   label: 'Stewarding',              cat: 'B', w: 2, h: 1, cost: 18,  massing: 'boh',   storeys: 1 },
  { id: 'house',     label: 'Housekeeping Pantry',     cat: 'B', w: 2, h: 1, cost: 20,  massing: 'boh',   storeys: 1 },
  { id: 'laundry',   label: 'Laundry',                 cat: 'B', w: 3, h: 2, cost: 42,  massing: 'plant', storeys: 1, noisy: 3 },
  { id: 'eng',       label: 'Engineering & Plant',     cat: 'B', w: 3, h: 2, cost: 46,  massing: 'plant', storeys: 1, noisy: 3 },
  { id: 'recv',      label: 'Receiving & Stores',      cat: 'B', w: 2, h: 2, cost: 24,  massing: 'shed',  storeys: 1 },
  { id: 'waste',     label: 'Waste & Recycling',       cat: 'B', w: 2, h: 1, cost: 14,  massing: 'shed',  storeys: 1, noisy: 2 },
  { id: 'sec',       label: 'Security Post',           cat: 'B', w: 1, h: 1, cost: 10,  massing: 'kiosk', storeys: 1 },
  // — People & Culture —
  { id: 'canteen',   label: 'Colleague Canteen',       cat: 'P', w: 2, h: 2, cost: 26,  massing: 'people', storeys: 1 },
  { id: 'train',     label: 'Training Room',           cat: 'P', w: 2, h: 1, cost: 22,  massing: 'people', storeys: 1 },
  { id: 'pc',        label: 'People & Culture Office', cat: 'P', w: 2, h: 1, cost: 20,  massing: 'people', storeys: 1 },
  { id: 'locker',    label: 'Colleague Lockers',       cat: 'P', w: 2, h: 1, cost: 14,  massing: 'people', storeys: 1 },
];

export const FUNCTION_BY_ID = Object.fromEntries(FUNCTIONS.map((f) => [f.id, f]));
/**
 * Adjacency matrix. `radius` = how many cells apart the two footprints may be.
 * weight > 0 helps, < 0 hurts. `metric` says which scorecard line it lands on,
 * and `note` is the human-readable cause shown on the result card.
 */
export const ADJACENCY = [
  { a: 'kitchen', b: 'fnb',       weight: 9,   metric: 'fan',       radius: 2, note: 'Kitchen serves the restaurant directly' },
  { a: 'kitchen', b: 'fnb2',      weight: 7,   metric: 'fan',       radius: 2, note: 'Kitchen serves the speciality restaurant' },
  { a: 'recv',    b: 'kitchen',   weight: 6,   metric: 'profit',    radius: 3, note: 'Deliveries reach the kitchen without crossing the hotel' },
  { a: 'house',   b: 'rooms',     weight: 8,   metric: 'fan',       radius: 2, note: 'Housekeeping is close to the rooms it turns over' },
  { a: 'front',   b: 'concierge', weight: 5,   metric: 'fan',       radius: 2, note: 'Concierge works beside the Front Office' },
  { a: 'spa',     b: 'pool',      weight: 6,   metric: 'fan',       radius: 2, note: 'Spa and pool read as one wellness offer' },
  { a: 'canteen', b: 'locker',    weight: 5,   metric: 'colleague', radius: 2, note: 'Colleagues change and eat in one place' },
  { a: 'train',   b: 'pc',        weight: 5,   metric: 'colleague', radius: 2, note: 'Training sits with People & Culture' },
  { a: 'sec',     b: 'recv',      weight: 4,   metric: 'brand',     radius: 2, note: 'Security watches the goods entrance' },
  { a: 'sec',     b: 'front',     weight: 3,   metric: 'brand',     radius: 3, note: 'A visible presence at arrival' },
  { a: 'fnb',     b: 'heritage',  weight: 6,   metric: 'brand',     radius: 2, note: 'Dining beside the heritage pavilion gives a sense of place' },
  { a: 'spa',     b: 'heritage',  weight: 5,   metric: 'brand',     radius: 2, note: 'The heritage pavilion anchors the wellness offer' },
  { a: 'rooms',   b: 'heritage',  weight: 4,   metric: 'brand',     radius: 2, note: 'Rooms look onto the heritage pavilion' },
  { a: 'laundry', b: 'rooms',     weight: -10, metric: 'fan',       radius: 2, note: 'Laundry noise and vibration beside guest rooms' },
  { a: 'laundry', b: 'spa',       weight: -8,  metric: 'fan',       radius: 2, note: 'Plant noise carries into the spa' },
  { a: 'eng',     b: 'rooms',     weight: -10, metric: 'fan',       radius: 2, note: 'Plant vibration beside guest rooms' },
  { a: 'eng',     b: 'ballroom',  weight: -6,  metric: 'fan',       radius: 2, note: 'Plant noise under the event space' },
  { a: 'waste',   b: 'fnb',       weight: -12, metric: 'brand',     radius: 3, note: 'Waste handling in sight of the restaurant' },
  { a: 'waste',   b: 'front',     weight: -10, metric: 'brand',     radius: 3, note: 'Waste traffic crosses the guest arrival' },
  { a: 'waste',   b: 'pool',      weight: -8,  metric: 'brand',     radius: 3, note: 'Waste handling beside the pool terrace' },
  { a: 'kitchen', b: 'spa',       weight: -5,  metric: 'fan',       radius: 1, note: 'Kitchen odour reaches the spa' },
  { a: 'recv',    b: 'front',     weight: -6,  metric: 'fan',       radius: 2, note: 'Delivery traffic mixes with guest arrival' },
  { a: 'laundry', b: 'heritage',  weight: -8,  metric: 'brand',     radius: 2, note: 'Plant tucked against the heritage pavilion' },
  { a: 'waste',   b: 'heritage',  weight: -10, metric: 'brand',     radius: 2, note: 'Waste handling against the heritage pavilion' },
  { a: 'eng',     b: 'heritage',  weight: -6,  metric: 'brand',     radius: 2, note: 'Plant vibration against the heritage pavilion' },
];

/** Functions whose absence breaks something specific — the "invisible" functions. */
export const REQUIRED = [
  { id: 'rooms',   metric: 'profit',    penalty: 34, note: 'No rooms to sell' },
  { id: 'front',   metric: 'fan',       penalty: 30, note: 'No check-in: guests queue outside' },
  { id: 'kitchen', metric: 'fan',       penalty: 22, note: 'The restaurant has no kitchen behind it', requires: 'fnb' },
  { id: 'house',   metric: 'fan',       penalty: 14, note: 'Rooms cannot be turned over on time' },
  { id: 'laundry', metric: 'brand',     penalty: 14, note: 'Linen is sent off-site: slow and costly' },
  { id: 'eng',     metric: 'brand',     penalty: 16, note: 'No plant team: breakdowns stay broken' },
  { id: 'recv',    metric: 'profit',    penalty: 12, note: 'Deliveries are handled by hand at the entrance' },
  { id: 'canteen', metric: 'colleague', penalty: 18, note: 'Colleagues have nowhere to eat or rest' },
  { id: 'train',   metric: 'colleague', penalty: 14, note: 'No training space: capability never grows' },
  { id: 'pc',      metric: 'colleague', penalty: 10, note: 'No People & Culture presence on site' },
];

/**
 * Building customisation. Sizes change the LONG side of a footprint by one cell, so
 * capacity and cost scale with area and a bigger wing is a real trade — more keys for
 * more credits — rather than a free upgrade. Storeys are expressed as a delta from the
 * function's own default so the score never depends on which architecture style a team
 * picked: only the building's design does.
 */
export const SIZES = [
  { id: 'S', label: 'Compact', delta: -1 },
  { id: 'M', label: 'Standard', delta: 0 },
  { id: 'L', label: 'Extended', delta: 1 },
];

/** How far a building's storey count may move from its default, either way. */
export const STOREY_DELTA = { min: -2, max: 3 };

/**
 * Add-ons. `metric`/`delta` are the scorecard effect; `covers` is a capacity effect.
 * Eligibility is data, not code: a function id list, a category list, or the massing
 * type it applies to.
 */
export const ADDONS = [
  { id: 'terrace', label: 'Rooftop Terrace', cost: 18, massing: ['rooms', 'public'],        metric: 'fan',    delta: 2 },
  { id: 'green',   label: 'Green Roof',      cost: 10, massing: 'any-but-pool',             metric: 'brand',  delta: 2 },
  { id: 'solar',   label: 'Solar Array',     cost: 16, cats: ['B', 'P'],                     metric: 'profit', delta: 2, halvesUtility: true },
  { id: 'canopy',  label: 'Entrance Canopy', cost: 8,  fnIds: ['front', 'spa', 'fnb', 'fnb2'], metric: 'fan',   delta: 2 },
  { id: 'seating', label: 'Outdoor Seating', cost: 12, fnIds: ['fnb', 'fnb2'],               covers: 20 },
];

/**
 * An add-on's score counts on at most this many buildings. Without a cap, the answer to
 * every round is "put a terrace on everything": the trade-off disappears and the score
 * stops describing a decision.
 */
export const ADDON_SCORE_CAP = 2;

/** Ledger notes for customisation. `{label}` and `{n}` are substituted. */
export const ADDON_NOTE = '{label} on {n} building(s)';
export const HEIGHT_NOTE = 'A tall wing overshadows the heritage pavilion';

/** Wording for the customisation controls. Structural labels come from SIZES/ADDONS/STYLES. */
export const CUSTOMISE_UI = {
  title: 'Customise',
  size: 'Size',
  storeys: 'Storeys',
  variant: 'Style variant',
  addons: 'Add-ons',
  inherit: 'Site style',
  credits: 'credits',
  noChange: 'no change',
  notEligible: 'Not available for this building',
  fixed: 'Fixed',
};

/**
 * Journey templates. A stop is satisfied by any placed function carrying that tag;
 * `fixed` stops are site facts. Optional stops reward richness, never punish absence.
 */
export const JOURNEYS = [
  {
    id: 'arrival', label: 'Guest Arrival', mandatory: true, introducedInRound: 2,
    stops: [
      { tag: 'arrival',   label: 'Arrival Court', fixed: true },
      { tag: 'front',     label: 'Front Office',  owner: 'Front Office' },
      { tag: 'concierge', label: 'Concierge',     owner: 'Concierge', optional: true },
      { tag: 'rooms',     label: 'Rooms Wing',    owner: 'Housekeeping' },
    ],
  },
  {
    id: 'recovery', label: 'Service Recovery', introducedInRound: 3,
    stops: [
      { tag: 'front', label: 'Complaint received',    owner: 'Front Office' },
      { tag: 'pc',    label: 'Duty manager informed', owner: 'People & Culture' },
      { tag: 'eng',   label: 'Fix the defect',        owner: 'Engineering', optional: true },
      { tag: 'fnb',   label: 'Make it right',         owner: 'Food & Beverage' },
      { tag: 'front', label: 'Follow up',             owner: 'Front Office' },
    ],
  },
  {
    id: 'linen', label: 'Linen Cycle', introducedInRound: 3,
    stops: [
      { tag: 'rooms',   label: 'Stripped in the rooms', owner: 'Housekeeping' },
      { tag: 'laundry', label: 'Washed',                owner: 'Laundry' },
      { tag: 'house',   label: 'Stored in the pantry',  owner: 'Housekeeping' },
      { tag: 'rooms',   label: 'Back on the bed',       owner: 'Housekeeping' },
    ],
  },
  {
    id: 'goods', label: 'Goods-In', introducedInRound: 3,
    stops: [
      { tag: 'service', label: 'Service Yard',     fixed: true },
      { tag: 'recv',    label: 'Checked in',       owner: 'Receiving' },
      { tag: 'steward', label: 'Prepared',         owner: 'Stewarding', optional: true },
      { tag: 'kitchen', label: 'Into the kitchen', owner: 'Kitchen' },
      { tag: 'fnb',     label: 'On the table',     owner: 'Food & Beverage' },
    ],
  },
  {
    id: 'colleague', label: 'Colleague Day', introducedInRound: 3,
    stops: [
      { tag: 'service', label: 'Colleague entrance', fixed: true },
      { tag: 'locker',  label: 'Change',             owner: 'People & Culture' },
      { tag: 'canteen', label: 'Meal break',         owner: 'People & Culture' },
      { tag: 'train',   label: 'Training',           owner: 'Learning & Development', optional: true },
      { tag: 'house',   label: 'On shift',           owner: 'Housekeeping' },
    ],
  },
];
/** Round structure: demand ramps, budget is released in slices, pressure compounds. */
export const ROUNDS = [
  { n: 1, name: 'Foundations',        arrivals: 90,  allowance: 300, brief: 'Place the core of the hotel: rooms, arrival, one outlet and the back of house that keeps it running.' },
  { n: 2, name: 'Opening Months',     arrivals: 140, allowance: 140, brief: 'Demand grows. Design your Guest Arrival journey and answer the first reviews.' },
  { n: 3, name: 'Peak Season',        arrivals: 210, allowance: 110, brief: 'Surge season. Plant, linen and colleague stamina are all under load. Add a second journey.' },
  { n: 4, name: 'The Year in Review', arrivals: 180, allowance: 90,  brief: 'Everything compounds. Neglected functions surface now.' },
];

export const TOTAL_BUDGET = ROUNDS.reduce((s, r) => s + r.allowance, 0);

/** Event deck. Seeded per session; each event reads the layout, so outcomes differ by design. */
export const EVENTS = [
  { id: 'surge',     label: 'Demand surge',              detail: 'A city-wide conference lifts arrivals by 25%.', arrivalsMul: 1.25 },
  { id: 'vip',       label: 'VIP arrival',               detail: 'A regular of ten years arrives unannounced.', needs: ['concierge', 'front'], nearArrival: true, fanWin: 7, fanLose: -8 },
  { id: 'group',     label: 'Group booking',             detail: 'A 120-delegate booking needs event space.', needs: ['ballroom'], profitWin: 26, fanLose: -4, loseNote: 'Turned away: no event space' },
  { id: 'breakdown', label: 'Plant failure',             detail: 'A chilled-water pump fails at 02:10.', riskIfMissing: 'eng', fanLose: -11, brandLose: -9, riskBase: 0.35 },
  { id: 'hsinspect', label: 'Health & safety inspection', detail: 'An unannounced inspection of kitchen and stewarding.', needs: ['kitchen', 'steward'], brandWin: 6, brandLose: -10 },
  { id: 'audit',     label: 'Brand standards audit',     detail: 'An assessor walks the guest route and the colleague route.', needs: ['train', 'pc'], brandWin: 9, brandLose: -8 },
  { id: 'reviews',   label: 'Review storm',              detail: 'Three one-star reviews in one evening.', fanBelow: 45, fanLose: -9 },
  { id: 'absence',   label: 'Colleague absence spike',   detail: 'Sickness absence doubles across two departments.', colleagueBelow: 45, fanLose: -7, profitLose: -9 },
  { id: 'supply',    label: 'Supply delivery delay',     detail: 'A delivery is held at the gate for two hours.', needs: ['recv'], nearService: true, profitWin: 4, profitLose: -10 },
  { id: 'utility',   label: 'Utility cost shock',        detail: 'Energy prices rise for the quarter.', profitLose: -8, scalesWithFootprint: true },
  { id: 'festival',  label: 'Local festival',            detail: 'The city fills for a four-day festival.', arrivalsMul: 1.15, profitWin: 12 },
  { id: 'escalation', label: 'Complaint escalation',     detail: 'A guest complaint reaches the General Manager.', penalisesJourney: 'arrival', fanLose: -8 },
];

/**
 * Manpower. Workforce planning is a decision, not a hidden multiplier: each cluster's
 * requirement follows the capacity the team actually built and the demand the round
 * actually brings, using the labour ratios the operating model always implied (45 keys
 * per room attendant, 22 covers per service colleague).
 *
 * The money figures are ILLUSTRATIVE and labelled as such on screen. No figure here is
 * a claim about a real payroll; if Finance ever supplies sanitised numbers, they replace
 * these constants and nothing else. `pointInHkd` is the published conversion used to
 * turn a season cost into profitability points, so the roster and the scorecard cannot
 * drift apart.
 */
export const MANPOWER = {
  months: 3,                 // one round is a season, so three months of pay
  payPerFteMonth: 18000,     // illustrative HK$ per colleague per month
  pointInHkd: 30000,         // one profitability point is treated as this much season cost
  overPoints: 2,             // profitability points per head over requirement
  shortFloor: 0.4,           // service efficiency floor when a cluster is barely staffed
  shortFan: 18,              // Fan Score lost at a 100% shortfall
  shortColleague: 20,        // Colleague Engagement lost at a 100% shortfall
  chronic: 4,                // extra colleague loss when the shortfall repeats
  maxMul: 2,                 // the roster stops at twice the requirement
  clusters: [
    { id: 'rooms',  label: 'Rooms Division',  unit: 'keys',   per: 45 },
    { id: 'fnb',    label: 'Food & Beverage', unit: 'covers', per: 22 },
    { id: 'events', label: 'Events',          unit: 'seats',  per: 40 },
    { id: 'front',  label: 'Front Office',    unit: 'guests', per: 60 },
  ],
  training: [
    { id: 0, label: 'None',       cost: 0,     points: 0, uplift: 0,   colleague: 0 },
    { id: 1, label: 'Foundation', cost: 30000, points: 1, uplift: 0.1, colleague: 2 },
    { id: 2, label: 'Advanced',   cost: 60000, points: 2, uplift: 0.2, colleague: 4 },
  ],
};

/** Wording for the manpower controls. All of it lands in the UI verbatim. */
export const MANPOWER_UI = {
  title: 'Manpower plan',
  required: 'Required',
  planned: 'Planned',
  payroll: 'Illustrative payroll',
  total: 'Total payroll',
  perSeason: 'per season',
  training: 'Training',
  illustrative: 'Illustrative figures',
  // A cluster with no demand this season cannot be hired for; the row says so rather
  // than showing a dead stepper with no explanation.
  none: 'No requirement this season',
  // The ratio is the lesson: where each headcount number comes from.
  ratio: '{per} {unit} per colleague',
};


/** Ledger notes. `{cluster}`, `{planned}`, `{need}` and `{tier}` are substituted. */
export const MANPOWER_NOTE = {
  short: '{cluster}: {planned} of {need} planned — service suffered',
  over: '{cluster}: {excess} over requirement — idle payroll',
  chronic: 'Chronic understaffing: colleagues are leaving',
  training: 'Training: {tier}',
  leave: 'The roster was too thin to hold the team together',
};

/**
 * Manpower events. Kept out of the main deck on purpose: adding them to EVENTS would
 * re-shuffle the draw for every existing session and break the regression lock. They
 * enter a session's pool only once that team has planned a roster at all.
 */
export const MANPOWER_EVENTS = [
  { id: 'resignation', label: 'Resignation wave', detail: 'Agency staff are being poached across the city.', mp: 'resignation', colleagueLose: 8, fanLose: 5, profitLose: 6 },
  { id: 'banquet',     label: 'Peak banquet season', detail: 'A conference books the ballroom for three nights.', mp: 'banquet', profitWin: 10, profitLose: 9, fanLose: 5 },
  { id: 'payreview',   label: 'Pay review', detail: 'The annual pay review lands above forecast.', mp: 'payreview', profitPerHead: 0.4 },
];

/** Architecture styles — each drives a genuinely different procedural massing generator. */
export const STYLES = [
  { id: 'tower',     label: 'Grand Tower',      note: 'A vertical stack with a setback crown' },
  { id: 'courtyard', label: 'Courtyard Resort', note: 'Low blocks arranged around a garden' },
  { id: 'heritage',  label: 'Heritage House',   note: 'Colonnaded low-rise with pitched roofs' },
];

/** Accent palettes. Gold and sage are the house colours; the others are guest choices. */
export const PALETTES = [
  { id: 'gold',  label: 'MO Gold',         accent: '#B59060' },
  { id: 'sage',  label: 'Jade Sage',       accent: '#B7CDC2' },
  { id: 'ember', label: 'Ember Bronze',    accent: '#A9714B' },
  { id: 'moon',  label: 'Moonlight Ivory', accent: '#D9D2C4' },
];

export const SIGNATURES = [
  { id: 'water',   label: 'Water Feature', brand: 4 },
  { id: 'roof',    label: 'Roof Garden',   brand: 5 },
  { id: 'art',     label: 'Art Wall',      brand: 3 },
  { id: 'lantern', label: 'Lantern Court', brand: 4 },
];

export const LANDSCAPES = [
  { id: 'sparse', label: 'Sparse',   brand: 0, trees: 4 },
  { id: 'medium', label: 'Balanced', brand: 3, trees: 9 },
  { id: 'lush',   label: 'Lush',     brand: 5, trees: 16 },
];

/**
 * Land for sale. These coordinates EXTEND the existing 12x9 grid, so the arrival court,
 * the service yard, the heritage pavilion and every existing placement keep their cells.
 * A purchase is final and carries upkeep every round: expanding is a decision with a
 * running cost, not a free upgrade.
 */
export const PLOTS = [
  { id: 'west', label: 'West Plot', col: -4, row: 0, w: 4, h: 9, cost: 60, upkeep: 2 },
  { id: 'northeast', label: 'North-East Plot', col: 7, row: -3, w: 5, h: 3, cost: 30, upkeep: 1 },
  {
    id: 'riverside', label: 'Riverside Deck', col: 12, row: 2, w: 2, h: 5, cost: 40, upkeep: 0,
    only: ['fnb', 'fnb2', 'pool', 'spa'],
  },
];

/** Wording for the land controls. */
export const PLOT_UI = {
  tool: 'Expand site',
  buy: 'Buy',
  cancel: 'Cancel',
  forSale: 'Land for sale',
  owned: 'Owned',
  upkeep: 'upkeep per round',
  final: 'Purchases are final',
  bought: 'land bought',
};

/** Ledger note for upkeep. `{label}` is substituted. */
export const LAND_NOTE = '{label} upkeep';
export const PLOT_ONLY_NOTE = 'The Riverside Deck takes only restaurants, the pool and the spa';

export const SCORECARD = [
  { id: 'fan',       label: 'Fan Score',            hint: 'How guests experience the stay' },
  { id: 'profit',    label: 'Profitability',        hint: 'Revenue against the cost of operating' },
  { id: 'colleague', label: 'Colleague Engagement', hint: 'Whether colleagues can do their job well' },
  { id: 'brand',     label: 'Brand Standards',      hint: 'Standards, upkeep and sense of place' },
];

/** Composite weights — deliberately set so that revenue-chasing cannot win. */
export const COMPOSITE_WEIGHTS = { fan: 0.30, profit: 0.25, colleague: 0.25, brand: 0.20 };
