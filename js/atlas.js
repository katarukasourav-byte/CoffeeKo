/* Coffee Atlas: a map of where your coffees come from, coloured by how much you liked them,
   the next origin to try, a zoom into each country's coffee regions, and how far your beans travelled.
   Map outlines: Natural Earth (public domain), India's official boundaries. Drawing: d3-geo (bundled in js/vendor). */
import { geoEqualEarth, geoMercator, geoPath, geoCentroid, geoDistance, geoGraticule, geoBounds } from './vendor/geo.js';

/* ---------- coffee countries: map name, words that point to it, and what its coffees are known for ---------- */
const C = [
  ['India', ['india', 'indian', 'karnataka', 'kerala', 'tamil nadu', 'andhra', 'malabar'], 'Chocolate, spice and gentle acidity'],
  ['Ethiopia', ['ethiopia', 'ethiopian', 'yirgacheffe', 'yirgachefe', 'sidamo', 'sidama', 'guji', 'harrar', 'harar', 'limu', 'jimma', 'gedeo', 'hambela'], 'Floral, citrus and berry'],
  ['Kenya', ['kenya', 'kenyan', 'nyeri', 'kirinyaga', 'kiambu', "murang'a", 'muranga', 'embu'], 'Bright and juicy – blackcurrant and grapefruit'],
  ['Colombia', ['colombia', 'colombian', 'huila', 'nariño', 'narino', 'cauca', 'tolima', 'antioquia', 'quindío', 'quindio', 'santander'], 'Caramel, red fruit and a clean finish'],
  ['Brazil', ['brazil', 'brasil', 'brazilian', 'cerrado', 'minas gerais', 'mogiana', 'sul de minas', 'chapada', 'espírito santo', 'espirito santo'], 'Nutty and chocolatey with low acidity'],
  ['Guatemala', ['guatemala', 'antigua', 'huehuetenango', 'atitlán', 'atitlan', 'cobán', 'coban', 'acatenango'], 'Chocolate, spice and lively acidity'],
  ['Costa Rica', ['costa rica', 'tarrazú', 'tarrazu', 'west valley', 'naranjo'], 'Clean and sweet – honey and citrus'],
  ['Honduras', ['honduras', 'marcala', 'santa bárbara', 'santa barbara', 'copán', 'copan'], 'Caramel and stone fruit'],
  ['El Salvador', ['el salvador', 'salvador', 'santa ana', 'apaneca'], 'Soft, sweet and balanced'],
  ['Nicaragua', ['nicaragua', 'jinotega', 'nueva segovia', 'matagalpa'], 'Sweet, nutty and mild'],
  ['Panama', ['panama', 'panamá', 'boquete', 'volcán', 'volcan'], 'Jasmine and tropical fruit – home of famous Geshas'],
  ['Mexico', ['mexico', 'méxico', 'chiapas', 'oaxaca', 'veracruz'], 'Light, nutty and cocoa'],
  ['Peru', ['peru', 'perú', 'cajamarca', 'cusco', 'junín', 'junin'], 'Sweet, nutty and mild'],
  ['Ecuador', ['ecuador', 'loja'], 'Bright, sweet and floral'],
  ['Bolivia', ['bolivia', 'caranavi'], 'Sweet and delicate'],
  ['Rwanda', ['rwanda', 'nyamasheke', 'huye', 'gakenke'], 'Red fruit and black tea'],
  ['Burundi', ['burundi', 'kayanza', 'ngozi'], 'Juicy red fruit and florals'],
  ['Uganda', ['uganda', 'elgon', 'rwenzori'], 'Chocolate and dark fruit'],
  ['Tanzania', ['tanzania', 'kilimanjaro', 'mbeya'], 'Bright citrus and berry'],
  ['Democratic Republic of the Congo', ['congo', 'kivu'], 'Fruity and bright'],
  ['Malawi', ['malawi'], 'Sweet and soft'], ['Zambia', ['zambia'], 'Bright and fruity'],
  ['Yemen', ['yemen', 'yemeni', 'haraz'], 'Winey with dried fruit and spice'],
  ['Indonesia', ['indonesia', 'sumatra', 'java', 'bali', 'sulawesi', 'flores', 'aceh', 'gayo', 'toraja', 'kintamani', 'mandheling', 'lintong'], 'Earthy, herbal and full-bodied'],
  ['Papua New Guinea', ['papua', 'png'], 'Fruity and sweet'],
  ['Vietnam', ['vietnam', 'da lat', 'dalat'], 'Bold and chocolatey'], ['Thailand', ['thailand', 'chiang rai', 'chiang mai'], 'Sweet and nutty'],
  ['China', ['yunnan', "pu'er", 'puer', 'baoshan'], 'Sweet with dried fruit'], ['Myanmar', ['myanmar', 'shan'], 'Fruity and sweet'],
  ['Nepal', ['nepal', 'gulmi'], 'Delicate and sweet'], ['Laos', ['laos', 'bolaven'], 'Nutty and mild'], ['Philippines', ['philippines', 'benguet'], 'Sweet and earthy'],
  ['Timor-Leste', ['timor'], 'Sweet, spicy and full-bodied'], ['Jamaica', ['jamaica', 'blue mountain'], 'Mild, clean and sweet'],
  ['Dominican Rep.', ['dominican', 'barahona'], 'Soft and chocolatey'], ['Haiti', ['haiti'], 'Soft and sweet'], ['Venezuela', ['venezuela'], 'Sweet and mild'],
  ['United States', ['hawaii', 'kona', "ka'u"], 'Smooth and sweet']
];
/* ---------- best-known growing regions (lon, lat) and the words that point to them ---------- */
const R = {
  India: [['Chikmagalur', 75.77, 13.32, ['chikmagalur', 'chikkamagaluru', 'bababudan', 'baba budan', 'attikan', 'ratnagiri']], ['Coorg', 75.74, 12.42, ['coorg', 'kodagu']], ['Sakleshpur', 75.78, 12.95, ['sakleshpur', 'hassan']],
    ['Wayanad', 76.08, 11.6, ['wayanad']], ['Nilgiris', 76.7, 11.4, ['nilgiri']], ['BR Hills', 77.15, 11.99, ['biligiri', 'br hills', 'b.r. hills']], ['Shevaroys', 78.2, 11.78, ['shevaroy', 'yercaud']],
    ['Palani Hills', 77.5, 10.25, ['palani', 'pulney', 'kodaikanal']], ['Anamalais', 76.95, 10.33, ['anamalai', 'valparai']], ['Araku Valley', 82.87, 18.33, ['araku']], ['Malabar Coast', 75.4, 12.0, ['malabar']]],
  Ethiopia: [['Yirgacheffe', 38.2, 6.16, ['yirgacheffe', 'yirgachefe', 'gedeo']], ['Guji', 38.6, 5.6, ['guji', 'hambela', 'shakiso']], ['Sidamo', 38.5, 6.7, ['sidamo', 'sidama', 'bensa']], ['Harrar', 42.1, 9.3, ['harrar', 'harar']], ['Limu', 36.9, 8.0, ['limu']], ['Jimma', 36.8, 7.67, ['jimma', 'djimmah']]],
  Kenya: [['Nyeri', 36.95, -0.42, ['nyeri']], ['Kirinyaga', 37.3, -0.5, ['kirinyaga']], ["Murang'a", 37.0, -0.72, ["murang'a", 'muranga']], ['Kiambu', 36.8, -1.03, ['kiambu']], ['Embu', 37.45, -0.53, ['embu']]],
  Colombia: [['Huila', -75.6, 2.3, ['huila']], ['Nariño', -77.3, 1.3, ['nariño', 'narino']], ['Cauca', -76.6, 2.4, ['cauca']], ['Tolima', -75.2, 4.0, ['tolima']], ['Antioquia', -75.6, 6.2, ['antioquia']], ['Quindío', -75.7, 4.5, ['quindío', 'quindio']], ['Santander', -73.1, 7.0, ['santander']]],
  Brazil: [['Cerrado Mineiro', -46.9, -18.9, ['cerrado']], ['Sul de Minas', -45.9, -21.8, ['sul de minas']], ['Mogiana', -47.0, -21.3, ['mogiana']], ['Chapada Diamantina', -41.4, -12.6, ['chapada']], ['Espírito Santo', -40.6, -19.6, ['espírito santo', 'espirito santo']]],
  Guatemala: [['Antigua', -90.73, 14.56, ['antigua']], ['Huehuetenango', -91.47, 15.32, ['huehuetenango']], ['Atitlán', -91.2, 14.7, ['atitlán', 'atitlan']], ['Cobán', -90.37, 15.47, ['cobán', 'coban']], ['Acatenango', -90.88, 14.5, ['acatenango']]],
  'Costa Rica': [['Tarrazú', -84.03, 9.65, ['tarrazú', 'tarrazu']], ['West Valley', -84.3, 10.05, ['west valley', 'naranjo']], ['Central Valley', -84.1, 9.95, ['central valley']]],
  Honduras: [['Marcala', -88.0, 14.15, ['marcala']], ['Santa Bárbara', -88.23, 14.92, ['santa bárbara', 'santa barbara']], ['Copán', -88.9, 14.8, ['copán', 'copan']]],
  Rwanda: [['Nyamasheke', 29.2, -2.3, ['nyamasheke']], ['Huye', 29.74, -2.6, ['huye']], ['Gakenke', 29.8, -1.7, ['gakenke']]],
  Burundi: [['Kayanza', 29.63, -2.92, ['kayanza']], ['Ngozi', 29.83, -2.9, ['ngozi']]],
  Indonesia: [['Sumatra', 96.85, 4.6, ['sumatra', 'aceh', 'gayo', 'mandheling', 'lintong']], ['Java', 107.6, -7.2, ['java']], ['Bali', 115.35, -8.25, ['bali', 'kintamani']], ['Sulawesi', 119.85, -2.97, ['sulawesi', 'toraja']], ['Flores', 121.0, -8.7, ['flores']]],
  Peru: [['Cajamarca', -78.5, -7.16, ['cajamarca']], ['Cusco', -72.0, -13.5, ['cusco']], ['Junín', -75.0, -11.2, ['junín', 'junin']]],
  Panama: [['Boquete', -82.43, 8.78, ['boquete']], ['Volcán', -82.63, 8.77, ['volcán', 'volcan']]],
  Mexico: [['Chiapas', -92.6, 16.5, ['chiapas']], ['Oaxaca', -96.7, 17.0, ['oaxaca']], ['Veracruz', -96.9, 19.5, ['veracruz']]],
  'El Salvador': [['Santa Ana', -89.55, 13.98, ['santa ana']], ['Apaneca', -89.8, 13.86, ['apaneca']]],
  Nicaragua: [['Jinotega', -86.0, 13.09, ['jinotega']], ['Nueva Segovia', -86.3, 13.7, ['nueva segovia']], ['Matagalpa', -85.92, 12.93, ['matagalpa']]],
  Uganda: [['Mount Elgon', 34.4, 1.1, ['elgon']], ['Rwenzori', 30.0, 0.35, ['rwenzori']]],
  Tanzania: [['Kilimanjaro', 37.3, -3.2, ['kilimanjaro']], ['Mbeya', 33.4, -8.9, ['mbeya']]],
  Yemen: [['Haraz', 43.6, 15.2, ['haraz']]],
  China: [["Pu'er", 100.97, 22.8, ["pu'er", 'puer']], ['Baoshan', 99.16, 25.1, ['baoshan']]],
  Vietnam: [['Da Lat', 108.44, 11.94, ['da lat', 'dalat']], ['Son La', 103.9, 21.3, ['son la']]],
  Thailand: [['Chiang Rai', 99.83, 19.9, ['chiang rai']], ['Chiang Mai', 98.98, 18.79, ['chiang mai']]]
};
/* Where roasters are, for the bean journeys (roaster name → city; otherwise the roaster's country) */
const ROASTER_AT = { 'blue tokai': [77.2, 28.6], subko: [72.88, 19.07], 'black baza': [77.59, 12.97], 'third wave': [77.59, 12.97], devans: [77.2, 28.6], araku: [77.59, 12.97],
  'square mile': [-0.1, 51.52], origin: [-5.07, 50.15], assembly: [-0.12, 51.46], workshop: [-0.11, 51.52], onyx: [-94.2, 36.2], verve: [-122.03, 36.97], stumptown: [-122.68, 45.52],
  sey: [-73.94, 40.71], 'black & white': [-78.64, 35.78], 'la cabra': [10.2, 56.16], 'coffee collective': [12.57, 55.68], april: [12.57, 55.68], friedhats: [4.9, 52.37],
  'raw coffee': [55.27, 25.2], 'market lane': [144.96, -37.81], 'phil & sebastian': [-114.07, 51.05], pilot: [-79.38, 43.65] };
const COUNTRY_AT = { IN: [77.59, 12.97], GB: [-0.13, 51.5], US: [-98.6, 39.8], DK: [12.57, 55.68], NL: [4.9, 52.37], AE: [55.27, 25.2], AU: [144.96, -37.81], CA: [-79.38, 43.65], SG: [103.82, 1.35], JP: [139.69, 35.69], DE: [13.4, 52.52], FR: [2.35, 48.86], SE: [18.07, 59.33], NO: [10.75, 59.91], NZ: [174.76, -36.85], CH: [8.54, 47.37] };
/* Roughly where the visitor is, from their time zone (never sent anywhere) */
function homeAt() {
  const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '');
  const T = { 'Asia/Kolkata': [78.5, 20.5], 'Asia/Calcutta': [78.5, 20.5], 'Europe/London': [-0.13, 51.5], 'America/New_York': [-74, 40.7], 'America/Chicago': [-87.6, 41.9], 'America/Denver': [-105, 39.7],
    'America/Los_Angeles': [-118.2, 34.05], 'America/Phoenix': [-112.1, 33.4], 'America/Toronto': [-79.38, 43.65], 'America/Vancouver': [-123.1, 49.3], 'Asia/Dubai': [55.27, 25.2], 'Asia/Singapore': [103.82, 1.35],
    'Asia/Tokyo': [139.69, 35.69], 'Asia/Hong_Kong': [114.17, 22.3], 'Australia/Sydney': [151.2, -33.87], 'Australia/Melbourne': [144.96, -37.81], 'Pacific/Auckland': [174.76, -36.85],
    'Europe/Berlin': [13.4, 52.52], 'Europe/Paris': [2.35, 48.86], 'Europe/Amsterdam': [4.9, 52.37], 'Europe/Copenhagen': [12.57, 55.68], 'Europe/Stockholm': [18.07, 59.33], 'Europe/Oslo': [10.75, 59.91],
    'Europe/Madrid': [-3.7, 40.42], 'Europe/Rome': [12.5, 41.9], 'Europe/Zurich': [8.54, 47.37], 'Europe/Dublin': [-6.26, 53.35], 'Asia/Kathmandu': [85.3, 27.7], 'Asia/Colombo': [79.86, 6.93], 'Asia/Dhaka': [90.4, 23.8] };
  return T[tz] || null;
}

const VW = { loved: 2, liked: 1, ok: 0.25, dislike: -1.5 };
const COL = { loved: ['#E3B47A', '#FFE6C2'], liked: ['#9C7653', '#E0BC94'], ok: ['#4A423C', '#9A8F86'], no: ['#3A2523', '#D07A70'], grow: ['#1F1B18', '#5A4E44'], none: ['#141414', '#3A3530'], next: ['#17372a', '#8FD1A6'] };
const VLAB = { loved: 'Loved', liked: 'Liked', ok: 'Okay', no: 'Not for me' };
const verdictOf = s => s >= 1.5 ? 'loved' : s >= 0.6 ? 'liked' : s >= -0.3 ? 'ok' : 'no';
const words = s => String(s || '').toLowerCase();
const has = (t, w) => new RegExp('(^|[^a-zà-ÿ])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-zà-ÿ])').test(t);

let WORLD = null, DETAIL = null;
async function world() { if (!WORLD) WORLD = (await (await fetch('/data/world.json')).json()).features; return WORLD; }
async function detail() { if (!DETAIL) DETAIL = (await (await fetch('/data/detail.json')).json()).features; return DETAIL; }

/* Which country (and region) a coffee is from */
function placeOf(text) {
  const t = words(text), out = [];
  for (const [name, al] of C) {
    const regs = R[name] || [];
    const reg = regs.find(r => r[3].some(w => has(t, w)));
    if (reg || al.some(w => has(t, w))) out.push({ country: name, region: reg ? reg[0] : null, at: reg ? [reg[1], reg[2]] : null });
  }
  return out;
}

/* ---------- everything the Atlas needs, worked out from the journal and catalogue ---------- */
function compute(ctx) {
  const { state, catById } = ctx;
  const R0 = state.journal.filter(e => e.status === 'rated' && e.verdict);
  const countries = {}, regions = {}, trips = [];
  const home = homeAt();
  for (const e of R0) {
    const c = e.catalogId ? catById.get(e.catalogId) : null;
    if (c && c.blend === true) continue;
    const places = placeOf([e.origin, e.name, c?.origin, c?.region, c?.estate, c?.name].join(' · '));
    if (!places.length || places.length > 2) continue;                       /* blends of many origins: leave out */
    for (const p of places) {
      const k = p.country; (countries[k] = countries[k] || { n: 0, s: 0, entries: [] });
      countries[k].n++; countries[k].s += VW[e.verdict] ?? 0; countries[k].entries.push({ e, region: p.region });
      if (p.region) { const rk = k + '|' + p.region; (regions[rk] = regions[rk] || { n: 0, s: 0 }); regions[rk].n++; regions[rk].s += VW[e.verdict] ?? 0; }
    }
    const p = places[0];
    const rn = words(e.roaster || c?.roaster);
    const rAt = Object.entries(ROASTER_AT).find(([k]) => rn.includes(k))?.[1] || COUNTRY_AT[c?.roasterCountry] || null;
    trips.push({ e, place: p, rAt, roaster: e.roaster || c?.roaster || '' });
  }
  for (const k in countries) countries[k].v = verdictOf(countries[k].s / countries[k].n);
  for (const k in regions) regions[k].v = verdictOf(regions[k].s / regions[k].n);
  /* next origins: untried countries whose catalogue coffees match you best */
  const T = ctx.target(), next = [];
  if (T.ready) {
    const by = {};
    for (const c of state.cat) {
      if (!c.available || c.blend === true) continue;
      const pl = placeOf([c.origin, c.region, c.estate, c.name].join(' · '));
      if (pl.length !== 1 || countries[pl[0].country]) continue;
      const m = ctx.match(c, T); if (!m) continue;
      (by[pl[0].country] = by[pl[0].country] || []).push({ c, m });
    }
    for (const [k, L] of Object.entries(by)) { L.sort((a, b) => b.m.score - a.m.score); next.push({ country: k, best: L[0], score: L.slice(0, 2).reduce((a, x) => a + x.m.score, 0) / Math.min(2, L.length), count: L.length }); }
    next.sort((a, b) => b.score - a.score);
  }
  return { countries, regions, trips, home, next: next.slice(0, 2), T };
}

/* ---------- world map ---------- */
function worldSVG(F, A, W, H, { arcs = false } = {}) {
  const box = { type: 'Feature', geometry: { type: 'MultiPoint', coordinates: [[-122, 32], [152, -30], [-122, -30], [152, 32]] } };
  const p = geoEqualEarth().rotate([-15, 0]).fitExtent([[4, 4], [W - 4, H - 4]], box), pp = geoPath(p).digits(1);
  const nextSet = new Set(A.next.map(n => n.country)), growSet = new Set(C.map(c => c[0]));
  const yN = p([20, 23.44])[1], yS = p([20, -23.44])[1];
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="wmap" role="img" aria-label="Map of where your coffees come from"><defs><clipPath id="wclip"><rect width="${W}" height="${H}" rx="14"/></clipPath>
  <linearGradient id="wbelt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D4B08C" stop-opacity="0"/><stop offset=".5" stop-color="#D4B08C" stop-opacity=".08"/><stop offset="1" stop-color="#D4B08C" stop-opacity="0"/></linearGradient></defs><g clip-path="url(#wclip)">`;
  s += `<path d="${pp(geoGraticule().step([30, 15])())}" fill="none" stroke="#1a1a1a" stroke-width=".5"/>`;
  s += `<rect x="0" y="${yN.toFixed(1)}" width="${W}" height="${(yS - yN).toFixed(1)}" fill="url(#wbelt)"/><line x1="0" x2="${W}" y1="${yN.toFixed(1)}" y2="${yN.toFixed(1)}" class="trop"/><line x1="0" x2="${W}" y1="${yS.toFixed(1)}" y2="${yS.toFixed(1)}" class="trop"/>`;
  const key = f => A.countries[f.properties.name] ? 2 : nextSet.has(f.properties.name) ? 1 : 0;
  for (const f of [...F].sort((a, b) => key(a) - key(b))) {
    const n = f.properties.name, cd = A.countries[n];
    const st = cd ? cd.v : nextSet.has(n) ? 'next' : growSet.has(n) ? 'grow' : 'none';
    const [fill, line] = COL[st], tap = cd || growSet.has(n);
    s += `<path d="${pp(f)}" fill="${fill}" stroke="${line}" stroke-width="${cd || st === 'next' ? 1.5 : .8}" stroke-linejoin="round" class="${st === 'loved' ? 'glow' : ''}${tap ? ' tap' : ''}" ${tap ? `data-country="${n}"` : ''}><title>${n}</title></path>`;
  }
  { const [bx, by] = p([-8, -19]); s += `<text class="tropl belt" text-anchor="middle" x="${bx.toFixed(1)}" y="${by.toFixed(1)}">THE COFFEE BELT</text>`; }
  if (arcs) {
    for (const t of A.trips.slice(0, 40)) {
      const o = t.place.at || geoCentroid(F.find(f => f.properties.name === t.place.country) || { type: 'Point', coordinates: [0, 0] });
      const pts = [o, t.rAt, A.home].filter(Boolean); if (pts.length < 2) continue;
      s += `<path class="arc" d="${pp({ type: 'LineString', coordinates: pts })}"/>`;
    }
    if (A.home) { const [x, y] = p(A.home); s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" class="you"/><text class="youl" x="${(x + 7).toFixed(1)}" y="${(y + 14).toFixed(1)}">You</text>`; }
  } else {
    const lab = Object.keys(A.countries).concat(A.next.map(n => n.country));
    const placed = [];
    for (const n of lab) {
      const f = F.find(x => x.properties.name === n); if (!f) continue;
      let c = geoCentroid(f); const reg = (A.countries[n]?.entries || []).find(x => x.region); if (reg && n === 'Indonesia') c = (R.Indonesia.find(r => r[0] === reg.region) || [0, ...c]).slice(1, 3);
      let [x, y] = p(c); if (!isFinite(x)) continue;
      while (placed.some(([px, py]) => Math.abs(px - x) < 44 && Math.abs(py - y) < 11)) y += 11;   /* keep labels from sitting on each other */
      placed.push([x, y]);
      const cls = A.countries[n] ? A.countries[n].v : 'nx';
      s += `<text class="wl ${cls}" x="${x.toFixed(1)}" y="${(y - 4).toFixed(1)}">${n === 'Indonesia' && reg ? reg.region : n === 'Democratic Republic of the Congo' ? 'DR Congo' : n === 'United States' ? 'Hawaii' : n}</text>`;
    }
  }
  return s + '</g></svg>';
}

/* ---------- the Atlas view inside the Journal ---------- */
export async function renderAtlas(el, ctx) {
  const { esc } = ctx;
  el.innerHTML = '<p class="muted">Loading the map…</p>';
  let F; try { F = await world(); } catch (e) { el.innerHTML = '<p class="muted">The map couldn’t load. Check your connection and try again.</p>'; return; }
  const A = compute(ctx);
  const nC = Object.keys(A.countries).length, nR = Object.keys(A.regions).length;
  let km = 0; for (const t of A.trips) { const o = t.place.at || geoCentroid(F.find(f => f.properties.name === t.place.country)); const pts = [o, t.rAt, A.home].filter(Boolean); for (let i = 1; i < pts.length; i++) km += geoDistance(pts[i - 1], pts[i]) * 6371; t.km = 0; for (let i = 1; i < pts.length; i++) t.km += geoDistance(pts[i - 1], pts[i]) * 6371; }
  km = Math.round(km);
  const W = Math.min(el.clientWidth || 358, 760), H = Math.round(W * (W < 600 ? .57 : .5));
  const fmt = n => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  const legend = '<div class="legend">' + Object.entries(VLAB).map(([k, v]) => `<span><i style="background:${COL[k][0]};border-color:${COL[k][1]}"></i>${v}</span>`).join('') + (A.next.length ? '<span><i class="lnext"></i>Try next</span>' : '') + '</div>';
  const nx = A.next[0];
  const nextCard = nx ? `<div class="next-origin"><span class="kicker g">Your next origin</span><h3>${esc(nx.country === 'United States' ? 'Hawaii' : nx.country)}</h3>
    <p>${esc((C.find(c => c[0] === nx.country) || [])[2] || '')}. ${A.T.ready ? `Its coffees match your taste well, and you haven’t rated one yet.` : ''}</p>
    <button class="apick" data-act="coffee" data-id="${esc(nx.best.c.id)}"><span class="ph" ${nx.best.c.image ? `style="background-image:url('${esc(nx.best.c.image)}')"` : ''}></span><span><b>${esc(nx.best.c.name)}</b><small>${esc(nx.best.c.roaster)}${nx.best.c.price != null ? ' · ' + esc(ctx.money(nx.best.c.price, nx.best.c.currency)) : ''}</small><em>${esc(nx.best.m.lbl)} · ${nx.best.m.score}%</em></span></button>
    ${A.next[1] ? `<p class="muted fine">Also worth exploring: <button class="linkbtn" data-country="${esc(A.next[1].country)}">${esc(A.next[1].country)}</button></p>` : ''}</div>` : '';
  const empty = !nC ? `<p class="muted">Rate a few coffees and your map fills in with the countries and regions you’ve tried.</p>` : '';
  const trips = [...A.trips].sort((a, b) => b.km - a.km);
  el.innerHTML = `<div class="atlas">
    <div class="a-stats"><div><b>${nC}</b><small>${nC === 1 ? 'country' : 'countries'}</small></div><div><b>${nR}</b><small>${nR === 1 ? 'region' : 'regions'}</small></div>${km ? `<div><b>${fmt(km)}</b><small>km travelled</small></div>` : ''}</div>
    <div class="mapcard" id="atlasMap">${worldSVG(F, A, W - 14, H)}${legend}<p class="hint">Tap a country to zoom in</p></div>${empty}${nextCard}
    ${trips.length ? `<div class="journeys"><div class="rail-h"><h4>Bean journeys</h4></div><p class="lead">How far each bag travelled, from the farm through the roaster${A.home ? ' to you' : ''}${km > 40075 ? ` – ${(km / 40075).toFixed(1)}× around the Earth` : ''}.</p>
    <div class="mapcard">${worldSVG(F, A, W - 14, H, { arcs: true })}</div>
    <div class="jl">${trips.slice(0, 8).map(t => `<button class="j" data-act="open" data-id="${esc(t.e.id)}"><i class="d ${t.e.verdict === 'dislike' ? 'no' : t.e.verdict}"></i><span><b>${esc([t.place.region, t.place.country === 'United States' ? 'Hawaii' : t.place.country].filter(Boolean).join(', '))}</b><small>${esc(t.e.name)}${t.roaster ? ' · ' + esc(t.roaster) : ''}</small></span><em>${fmt(Math.round(t.km))} km</em></button>`).join('')}</div>
    ${A.home ? '' : '<p class="muted fine">Journeys stop at the roaster: we couldn’t tell roughly where you are from this device.</p>'}</div>` : ''}</div>`;
  el.querySelectorAll('[data-country]').forEach(x => x.addEventListener('click', ev => { ev.stopPropagation(); openCountry(x.dataset.country, ctx); }));
}

/* ---------- zoom into one country ---------- */
export async function openCountry(name, ctx) {
  const { esc, openSheet, head } = ctx;
  const [F, D] = await Promise.all([world(), detail().catch(() => [])]);
  const A = compute(ctx), cd = A.countries[name];
  const shape = D.find(f => f.properties.name === name) || F.find(f => f.properties.name === name); if (!shape) return;
  const label = name === 'United States' ? 'Hawaii' : name === 'Democratic Republic of the Congo' ? 'DR Congo' : name;
  /* catalogue coffees from here, best match first */
  const T = A.T, here = [];
  for (const c of ctx.state.cat) { if (!c.available || c.blend === true) continue; const pl = placeOf([c.origin, c.region, c.estate, c.name].join(' · ')); if (pl.length === 1 && pl[0].country === name) here.push({ c, m: T.ready ? ctx.match(c, T) : null, region: pl[0].region }); }
  here.sort((a, b) => (b.m?.score || 0) - (a.m?.score || 0));
  const regs = (R[name] || []).map(([n, lo, la]) => {
    const r = A.regions[name + '|' + n]; const cat = here.filter(h => h.region === n);
    return { n, at: [lo, la], v: r?.v || null, count: r?.n || 0, cat };
  });
  const nextReg = regs.filter(r => !r.v && r.cat.length && r.cat[0].m).sort((a, b) => b.cat[0].m.score - a.cat[0].m.score)[0];
  const showRegs = regs.filter(r => r.v || r.cat.length || r === nextReg);
  /* frame: the regions if they sit in one part of the country, otherwise the whole country */
  const W = 358, H = 340;
  const [[x0, y0], [x1, y1]] = geoBounds(shape); const cArea = (x1 - x0) * (y1 - y0);
  let frame = shape, inset = '';
  if (showRegs.length >= 2 && cArea > 200) {   /* big countries only: zoom to where the coffee grows */
    const xs = showRegs.map(r => r.at[0]), ys = showRegs.map(r => r.at[1]);
    const pad = Math.max(1.2, Math.sqrt(cArea) * .15);
    const bx = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
    /* never zoom in so far that the country's shape is lost: at least ~45% of its width and height */
    const grow = (i, j, span) => { const need = span * .55 - (bx[j] - bx[i]); if (need > 0) { bx[i] -= need / 2; bx[j] += need / 2; } };
    grow(0, 2, x1 - x0); grow(1, 3, y1 - y0);
    if ((bx[2] - bx[0]) * (bx[3] - bx[1]) < cArea * .45) {
      frame = { type: 'Feature', geometry: { type: 'MultiPoint', coordinates: [[bx[0], bx[3]], [bx[2], bx[1]]] } };
      /* small locator map of the whole country with the zoomed area marked */
      const ip = geoMercator().fitExtent([[6, 6], [144, 154]], shape), ipp = geoPath(ip).digits(1);
      const [a, b] = ip([bx[0], bx[3]]), [c2, d2] = ip([bx[2], bx[1]]);
      inset = `<div class="two"><svg viewBox="0 0 150 160" width="150" height="160" class="cmap-mini">${F.filter(f => f.properties.name !== name).map(f => { const d = ipp(f); return d ? `<path d="${d}" fill="#0f0f0f" stroke="#3A3530" stroke-width=".8"/>` : ''; }).join('')}<path d="${ipp(shape)}" fill="#1A1612" stroke="#E3B47A" stroke-width="1.6" stroke-linejoin="round"/><rect x="${a.toFixed(1)}" y="${b.toFixed(1)}" width="${(c2 - a).toFixed(1)}" height="${(d2 - b).toFixed(1)}" rx="5" fill="none" stroke="#8FD1A6" stroke-width="1.4" stroke-dasharray="4 3"/></svg><p class="mini">${esc(label)}’s coffee grows mostly in the marked area. Tap a region below for its coffees.</p></div>`;
    }
  }
  const p = geoMercator().fitExtent([[12, 12], [W - 12, H - 12]], frame), pp = geoPath(p).digits(1);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" class="cmap" role="img" aria-label="Map of ${esc(label)}"><defs><clipPath id="cclip"><rect width="${W}" height="${H}" rx="12"/></clipPath></defs><g clip-path="url(#cclip)"><rect width="${W}" height="${H}" fill="#0b0b0b"/>`;
  for (const f0 of F) { if (f0.properties.name === name) continue; const f = D.find(x => x.properties.name === f0.properties.name) || f0; const d = pp(f); if (d) s += `<path d="${d}" fill="#121212" stroke="#3A3530" stroke-width="1" stroke-linejoin="round"/>`; }
  s += `<path d="${pp(shape)}" fill="#1A1612" stroke="${cd ? COL[cd.v][1] : '#8A7A6A'}" stroke-width="2.2" stroke-linejoin="round"/>`;
  const placed = [];
  for (const r of showRegs) {
    const [x, y] = p(r.at); if (!isFinite(x)) continue;
    if (r === nextReg) s += `<circle class="pulse" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="#0D0D0D" stroke="#8FD1A6" stroke-width="2.2"/>`;
    else { const [c, b] = r.v ? COL[r.v] : ['#2a2622', '#6b6158']; s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.v ? 7.5 : 5}" fill="${c}" stroke="${b}" stroke-width="1.4" class="${r.v === 'loved' ? 'glow' : ''}"/>`; }
    const right = x < W * .62; let ty = y + 4; while (placed.some(([px, py, pr]) => pr === right && Math.abs(px - x) < 90 && Math.abs(py - ty) < 14)) ty += 14; placed.push([x, ty, right]);
    s += `<text class="rl ${r === nextReg ? 'g' : r.v ? '' : 'dim'}" x="${(right ? x + 12 : x - 12).toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="${right ? 'start' : 'end'}">${esc(r.n)}</text>`;
  }
  s += '</g></svg>';
  const mine = (cd?.entries || []);
  const list = showRegs.map(r => {
    const es = mine.filter(x => x.region === r.n).map(x => x.e);
    const tag = r === nextReg ? '<em class="g">Try next</em>' : r.v ? `<em class="${r.v}">${VLAB[r.v]}</em>` : `<em class="dim">${r.cat.length} in Explore</em>`;
    const sub = es.length ? es.map(e => esc(e.name)).slice(0, 3).join(' · ') : r.cat[0] ? `${esc(r.cat[0].c.name)} · ${esc(r.cat[0].c.roaster)}` : '';
    const act = es.length ? `data-act="open" data-id="${esc(es[0].id)}"` : r.cat[0] ? `data-act="coffee" data-id="${esc(r.cat[0].c.id)}"` : '';
    return `<button class="rrow" ${act}><i class="${r === nextReg ? 'ring' : ''}" style="${r === nextReg ? '' : `background:${r.v ? COL[r.v][0] : '#2a2622'}`}"></i><b>${esc(r.n)}</b><small>${sub}</small>${tag}</button>`;
  }).join('');
  const other = mine.filter(x => !x.region).map(x => x.e);
  const top = here.slice(0, 3).map(h => `<button class="apick" data-act="coffee" data-id="${esc(h.c.id)}"><span class="ph" ${h.c.image ? `style="background-image:url('${esc(h.c.image)}')"` : ''}></span><span><b>${esc(h.c.name)}</b><small>${esc(h.c.roaster)}${h.c.price != null ? ' · ' + esc(ctx.money(h.c.price, h.c.currency)) : ''}</small>${h.m ? `<em>${esc(h.m.lbl)} · ${h.m.score}%</em>` : ''}</span></button>`).join('');
  openSheet(`${head('Coffee Atlas')}<div class="crow"><h3>${esc(label)}</h3>${cd ? `<span class="vb ${cd.v}">${VLAB[cd.v]} · ${cd.n} ${cd.n === 1 ? 'coffee' : 'coffees'}</span>` : '<span class="vb">Not tried yet</span>'}</div>
   <p class="muted">${esc((C.find(c => c[0] === name) || [])[2] || '')}.</p>${inset}<div class="cmap-wrap">${s}</div>
   ${list ? `<div class="rlist">${list}</div>` : ''}
   ${other.length ? `<div class="rail-h"><h4>Your other coffees from ${esc(label)}</h4></div><div class="rlist">${other.map(e => `<button class="rrow" data-act="open" data-id="${esc(e.id)}"><i style="background:${COL[e.verdict === 'dislike' ? 'no' : e.verdict]?.[0] || '#333'}"></i><b>${esc(e.name)}</b><small>${esc(e.roaster || '')}</small><em class="${e.verdict === 'dislike' ? 'no' : e.verdict}">${VLAB[e.verdict === 'dislike' ? 'no' : e.verdict] || ''}</em></button>`).join('')}</div>` : ''}
   ${top ? `<div class="rail-h"><h4>${T.ready ? 'Best matches from' : 'Coffees from'} ${esc(label)}</h4></div><div class="apicks">${top}</div>` : ''}`);
}
