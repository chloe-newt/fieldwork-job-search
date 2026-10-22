// Turns advert text into a routable destination so commute checks work even
// when a source only says "London". Everything here is local and
// deterministic; nothing is fetched. Inferred workplaces are labelled so the
// user can correct them on the job card.

// Single-site employers and named campuses that recur in scientific and
// government adverts. Patterns are matched against the advert's location
// first, then its title/employer, then the opening of the description.
// Multi-site employers (e.g. "King's College London", "UKHSA") are only
// matched through a named campus or site, never by employer name alone.
export const KNOWN_SITES = [
  ['Francis Crick Institute', /\bfrancis crick\b|\bcrick institute\b|\bmidland road\b/i, 'NW1 1AT'],
  ['Natural History Museum', /\bnatural history museum\b/i, 'SW7 5BD'],
  ['Alan Turing Institute (British Library)', /\balan turing institute\b|\bbritish library\b/i, 'NW1 2DB'],
  ['LSHTM, Keppel Street', /\blondon school of hygiene\b|\bLSHTM\b|\bkeppel street\b/i, 'WC1E 7HT'],
  ['UCL Bloomsbury', /\bUCL\b(?! (?:east|hospitals?))|\buniversity college london\b(?! hospitals?)|\bgower street\b|\bbloomsbury\b/i, 'WC1E 6BT'],
  ['Imperial College, South Kensington', /\bsouth kensington\b/i, 'SW7 2AZ'],
  ['Imperial College, White City', /\bwhite city\b/i, 'W12 0BZ'],
  ['Imperial College, Hammersmith Campus', /\bhammersmith (?:campus|hospital)\b|\bdu cane road\b/i, 'W12 0HS'],
  ['QMUL Mile End', /\bmile end\b/i, 'E1 4NS'],
  ['QMUL Whitechapel / Blizard Institute', /\bblizard institute\b|\bwhitechapel campus\b/i, 'E1 2AT'],
  ["King's College London, Guy's Campus", /\bguy(?:'|’)?s campus\b|\bguy(?:'|’)?s hospital\b|\blondon bridge campus\b/i, 'SE1 9RT'],
  ["King's College London, Waterloo Campus", /\bwaterloo campus\b|\bfranklin[- ]wilkins\b/i, 'SE1 9NH'],
  ["King's College London, Strand Campus", /\bstrand campus\b/i, 'WC2R 2LS'],
  ["King's College London, Denmark Hill", /\bdenmark hill\b|\bking(?:'|’)?s college hospital\b/i, 'SE5 9RS'],
  ["St Thomas' Hospital", /\bst\.? thomas(?:'|’)?s? (?:hospital|campus)\b/i, 'SE1 7EH'],
  ['UKHSA Colindale', /\bcolindale\b/i, 'NW9 5EQ'],
  ['10 South Colonnade, Canary Wharf', /\b10 south colonnade\b/i, 'E14 4PU'],
  ['Canary Wharf', /\bcanary wharf\b/i, 'E14 5AB'],
  ['Defra Seacole Building', /\bseacole\b|\b2 marsham street\b/i, 'SW1P 4DF'],
  ['Royal Botanic Gardens, Kew', /\broyal botanic gardens,? kew\b|\bkew gardens\b|\brichmond, (?:surrey|london) TW9\b/i, 'TW9 3AE'],
  ['Rothamsted Research, Harpenden', /\brothamsted\b|\bharpenden\b/i, 'AL5 2JQ'],
  ['Wellcome Sanger Institute, Hinxton', /\bwellcome sanger\b|\bhinxton\b|\bwellcome genome campus\b/i, 'CB10 1SA']
];

const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s?(\d[ABD-HJLNP-UW-Z]{2})\b/;
export function extractPostcode(s = '') {
  const m = String(s).match(POSTCODE);
  return m ? `${m[1]} ${m[2]}` : '';
}

function site(s) {
  for (const [label, re, postcode] of KNOWN_SITES) if (re.test(s)) return { label, postcode };
  return null;
}

// Returns {workplace, workplace_note} or null when nothing reliable is found.
export function inferWorkplace({ location = '', title = '', employer = '', description = '' } = {}) {
  const inLocation = extractPostcode(location);
  if (inLocation) return { workplace: inLocation, workplace_note: 'Postcode from the advert location' };
  const fromLocation = site(location);
  if (fromLocation) return { workplace: fromLocation.postcode, workplace_note: `Known site: ${fromLocation.label}` };
  const fromHeader = site(`${title} ${employer}`);
  if (fromHeader) return { workplace: fromHeader.postcode, workplace_note: `Known site: ${fromHeader.label}` };
  const opening = String(description).slice(0, 4000);
  const fromText = site(opening);
  if (fromText) return { workplace: fromText.postcode, workplace_note: `Known site mentioned in the advert: ${fromText.label} — confirm` };
  const textPostcode = extractPostcode(opening);
  if (textPostcode) return { workplace: textPostcode, workplace_note: 'Postcode found in the advert text — confirm it is the workplace' };
  return null;
}
