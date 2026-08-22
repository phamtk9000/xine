/**
 * Country codes to a name and a point on the globe.
 *
 * Centroids, not outlines. Drawing real borders would mean shipping a
 * megabyte of path data to render what is, here, one dot per country — and
 * borders would raise questions the data can't answer (a co-production is
 * listed under three countries at once; a choropleth would have to pick one).
 * A bubble at a centroid is honest about being a count.
 *
 * Historical codes are kept because TMDB still uses them on older titles:
 * SU for the Soviet Union, YU for Yugoslavia, DD for East Germany, CS for
 * Czechoslovakia. Dropping them would quietly delete Tarkovsky from the map.
 *
 * Pure data: no database, no `server-only`.
 */

type Place = [name: string, lat: number, lon: number];

export const COUNTRIES: Record<string, Place> = {
  AD: ["Andorra", 42.5, 1.6], AE: ["United Arab Emirates", 24.0, 54.0],
  AF: ["Afghanistan", 33.9, 67.7], AL: ["Albania", 41.2, 20.2],
  AM: ["Armenia", 40.1, 45.0], AO: ["Angola", -11.2, 17.9],
  AR: ["Argentina", -38.4, -63.6], AT: ["Austria", 47.5, 14.6],
  AU: ["Australia", -25.3, 133.8], AZ: ["Azerbaijan", 40.1, 47.6],
  BA: ["Bosnia and Herzegovina", 43.9, 17.7], BD: ["Bangladesh", 23.7, 90.4],
  BE: ["Belgium", 50.5, 4.5], BF: ["Burkina Faso", 12.2, -1.6],
  BG: ["Bulgaria", 42.7, 25.5], BO: ["Bolivia", -16.3, -63.6],
  BR: ["Brazil", -14.2, -51.9], BT: ["Bhutan", 27.5, 90.4],
  BY: ["Belarus", 53.7, 27.9], CA: ["Canada", 56.1, -106.3],
  CD: ["DR Congo", -4.0, 21.8], CH: ["Switzerland", 46.8, 8.2],
  CI: ["Côte d'Ivoire", 7.5, -5.5], CL: ["Chile", -35.7, -71.5],
  CM: ["Cameroon", 7.4, 12.4], CN: ["China", 35.9, 104.2],
  CO: ["Colombia", 4.6, -74.3], CR: ["Costa Rica", 9.7, -83.8],
  CS: ["Czechoslovakia", 49.5, 17.0], CU: ["Cuba", 21.5, -77.8],
  CY: ["Cyprus", 35.1, 33.4], CZ: ["Czechia", 49.8, 15.5],
  DD: ["East Germany", 52.0, 12.8], DE: ["Germany", 51.2, 10.4],
  DK: ["Denmark", 56.3, 9.5], DO: ["Dominican Republic", 18.7, -70.2],
  DZ: ["Algeria", 28.0, 1.7], EC: ["Ecuador", -1.8, -78.2],
  EE: ["Estonia", 58.6, 25.0], EG: ["Egypt", 26.8, 30.8],
  ES: ["Spain", 40.2, -3.7], ET: ["Ethiopia", 9.1, 40.5],
  FI: ["Finland", 61.9, 25.7], FR: ["France", 46.6, 2.5],
  GB: ["United Kingdom", 54.0, -2.0], GE: ["Georgia", 42.3, 43.4],
  GH: ["Ghana", 7.9, -1.0], GL: ["Greenland", 71.7, -42.6],
  GR: ["Greece", 39.1, 21.8], GT: ["Guatemala", 15.8, -90.2],
  HK: ["Hong Kong", 22.3, 114.2], HR: ["Croatia", 45.1, 15.2],
  HU: ["Hungary", 47.2, 19.5], ID: ["Indonesia", -2.5, 118.0],
  IE: ["Ireland", 53.2, -8.0], IL: ["Israel", 31.5, 34.9],
  IN: ["India", 22.0, 79.0], IQ: ["Iraq", 33.2, 43.7],
  IR: ["Iran", 32.4, 53.7], IS: ["Iceland", 64.9, -19.0],
  IT: ["Italy", 42.8, 12.6], JM: ["Jamaica", 18.1, -77.3],
  JO: ["Jordan", 30.6, 36.2], JP: ["Japan", 36.2, 138.3],
  KE: ["Kenya", 0.0, 37.9], KG: ["Kyrgyzstan", 41.2, 74.8],
  KH: ["Cambodia", 12.6, 104.9], KP: ["North Korea", 40.3, 127.5],
  KR: ["South Korea", 36.5, 127.9], KZ: ["Kazakhstan", 48.0, 66.9],
  LA: ["Laos", 19.9, 102.5], LB: ["Lebanon", 33.9, 35.9],
  LK: ["Sri Lanka", 7.9, 80.8], LT: ["Lithuania", 55.2, 23.9],
  LU: ["Luxembourg", 49.8, 6.1], LV: ["Latvia", 56.9, 24.6],
  MA: ["Morocco", 31.8, -7.1], MD: ["Moldova", 47.4, 28.4],
  ME: ["Montenegro", 42.7, 19.4], MK: ["North Macedonia", 41.6, 21.7],
  ML: ["Mali", 17.6, -4.0], MM: ["Myanmar", 21.9, 95.96],
  MN: ["Mongolia", 46.9, 103.8], MO: ["Macao", 22.2, 113.5],
  MT: ["Malta", 35.9, 14.4], MW: ["Malawi", -13.3, 34.3], MX: ["Mexico", 23.6, -102.5],
  MY: ["Malaysia", 4.2, 102.0], MZ: ["Mozambique", -18.7, 35.5],
  NA: ["Namibia", -22.6, 17.1], NG: ["Nigeria", 9.1, 8.7],
  NL: ["Netherlands", 52.2, 5.6], NO: ["Norway", 60.5, 8.5],
  NP: ["Nepal", 28.4, 84.1], NZ: ["New Zealand", -41.5, 172.8],
  PA: ["Panama", 8.5, -80.8], PE: ["Peru", -9.2, -75.0],
  PH: ["Philippines", 12.9, 121.8], PK: ["Pakistan", 30.4, 69.3],
  PL: ["Poland", 51.9, 19.1], PS: ["Palestine", 31.9, 35.2],
  PT: ["Portugal", 39.4, -8.2], PY: ["Paraguay", -23.4, -58.4],
  QA: ["Qatar", 25.4, 51.2], RO: ["Romania", 45.9, 25.0],
  RS: ["Serbia", 44.0, 21.0], RU: ["Russia", 61.5, 90.0],
  SA: ["Saudi Arabia", 23.9, 45.1], SE: ["Sweden", 60.1, 18.6],
  SG: ["Singapore", 1.35, 103.8], SI: ["Slovenia", 46.2, 15.0],
  SK: ["Slovakia", 48.7, 19.7], SN: ["Senegal", 14.5, -14.5],
  SU: ["Soviet Union", 58.0, 65.0], SY: ["Syria", 34.8, 39.0],
  TH: ["Thailand", 15.1, 101.0], TN: ["Tunisia", 33.9, 9.6],
  TR: ["Türkiye", 39.0, 35.2], TW: ["Taiwan", 23.7, 121.0],
  TZ: ["Tanzania", -6.4, 34.9], UA: ["Ukraine", 48.4, 31.2],
  UG: ["Uganda", 1.4, 32.3], US: ["United States", 39.8, -98.6],
  UY: ["Uruguay", -32.5, -55.8], UZ: ["Uzbekistan", 41.4, 64.6],
  VE: ["Venezuela", 6.4, -66.6], VN: ["Vietnam", 14.1, 108.3],
  YU: ["Yugoslavia", 44.0, 20.5], ZA: ["South Africa", -30.6, 22.9],
  ZW: ["Zimbabwe", -19.0, 29.2],
};

export function countryName(code: string): string {
  return COUNTRIES[code]?.[0] ?? code;
}

/**
 * The window the map draws. Cropped to where cinema is actually made — the
 * full -90..90 sweep would spend a third of its height on Antarctica.
 */
export const BOUNDS = { north: 74, south: -48, west: -170, east: 180 };

/** Equirectangular. Returns percentages, so the SVG stays resolution-free. */
export function project(lat: number, lon: number) {
  return {
    x: ((lon - BOUNDS.west) / (BOUNDS.east - BOUNDS.west)) * 100,
    y: ((BOUNDS.north - lat) / (BOUNDS.north - BOUNDS.south)) * 100,
  };
}
