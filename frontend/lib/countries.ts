export type Region = "Americas" | "Europe" | "Asia-Pacific" | "Middle East & Africa";
export interface Country { code: string; name: string; atlas: string; region: Region; lat: number; lon: number }

export const COUNTRIES: Country[] = [
  ["US", "United States", "United States of America", "Americas", 39, -98], ["CA", "Canada", "Canada", "Americas", 58, -104],
  ["MX", "Mexico", "Mexico", "Americas", 23.6, -102.5], ["BR", "Brazil", "Brazil", "Americas", -10, -52], ["AR", "Argentina", "Argentina", "Americas", -35, -65],
  ["CO", "Colombia", "Colombia", "Americas", 4, -73], ["CL", "Chile", "Chile", "Americas", -33, -71], ["PE", "Peru", "Peru", "Americas", -9, -75],
  ["GB", "United Kingdom", "United Kingdom", "Europe", 54, -2], ["IE", "Ireland", "Ireland", "Europe", 53, -8], ["DE", "Germany", "Germany", "Europe", 51, 10],
  ["FR", "France", "France", "Europe", 46.5, 2.5], ["ES", "Spain", "Spain", "Europe", 40, -3.7], ["PT", "Portugal", "Portugal", "Europe", 39.5, -8],
  ["IT", "Italy", "Italy", "Europe", 42.5, 12.5], ["NL", "Netherlands", "Netherlands", "Europe", 52.2, 5.5], ["BE", "Belgium", "Belgium", "Europe", 50.6, 4.6],
  ["CH", "Switzerland", "Switzerland", "Europe", 46.8, 8.2], ["AT", "Austria", "Austria", "Europe", 47.5, 14.5], ["SE", "Sweden", "Sweden", "Europe", 62, 15],
  ["NO", "Norway", "Norway", "Europe", 61, 9], ["DK", "Denmark", "Denmark", "Europe", 56, 10], ["FI", "Finland", "Finland", "Europe", 64, 26],
  ["PL", "Poland", "Poland", "Europe", 52, 19], ["UA", "Ukraine", "Ukraine", "Europe", 49, 32], ["GR", "Greece", "Greece", "Europe", 39, 22], ["TR", "Turkey", "Turkey", "Europe", 39, 35],
  ["IN", "India", "India", "Asia-Pacific", 22, 79], ["PK", "Pakistan", "Pakistan", "Asia-Pacific", 30, 70], ["BD", "Bangladesh", "Bangladesh", "Asia-Pacific", 24, 90],
  ["JP", "Japan", "Japan", "Asia-Pacific", 36, 138], ["KR", "South Korea", "South Korea", "Asia-Pacific", 36.5, 128], ["ID", "Indonesia", "Indonesia", "Asia-Pacific", -2, 118],
  ["PH", "Philippines", "Philippines", "Asia-Pacific", 12.5, 122], ["VN", "Vietnam", "Vietnam", "Asia-Pacific", 16, 107], ["TH", "Thailand", "Thailand", "Asia-Pacific", 15, 101],
  ["MY", "Malaysia", "Malaysia", "Asia-Pacific", 4, 102], ["SG", "Singapore", "Singapore", "Asia-Pacific", 1.35, 103.8], ["AU", "Australia", "Australia", "Asia-Pacific", -25, 134],
  ["NZ", "New Zealand", "New Zealand", "Asia-Pacific", -41, 174], ["AE", "United Arab Emirates", "United Arab Emirates", "Middle East & Africa", 24, 54],
  ["SA", "Saudi Arabia", "Saudi Arabia", "Middle East & Africa", 24, 45], ["IL", "Israel", "Israel", "Middle East & Africa", 31, 35], ["EG", "Egypt", "Egypt", "Middle East & Africa", 26.5, 30],
  ["NG", "Nigeria", "Nigeria", "Middle East & Africa", 9, 8], ["KE", "Kenya", "Kenya", "Middle East & Africa", 0.5, 38], ["ZA", "South Africa", "South Africa", "Middle East & Africa", -29, 24],
].map(([code, name, atlas, region, lat, lon]) => ({ code, name, atlas, region, lat, lon }) as Country);

export const REGIONS: Region[] = ["Americas", "Europe", "Asia-Pacific", "Middle East & Africa"];
const byCode = new Map(COUNTRIES.map((c) => [c.code, c]));
export const countryName = (code?: string | null) => (code ? byCode.get(code)?.name ?? code : "—");
export const countryByCode = (code: string) => byCode.get(code);
export const flag = (code?: string | null) =>
  code && /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 127397 + c.charCodeAt(0))) : "🌐";
export const regionCodes = (r: Region) => COUNTRIES.filter((c) => c.region === r).map((c) => c.code);

export const NICHES = ["Gaming", "Tech", "Beauty", "Fitness", "Health & Fitness", "Food", "Travel", "Finance", "Business", "Education", "Music", "Comedy", "Entertainment", "Automotive", "Lifestyle", "Sports", "Pets & Animals"];
