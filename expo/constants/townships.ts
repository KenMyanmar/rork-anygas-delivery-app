/**
 * Yangon township canon — standard map romanization (Grab-like).
 *
 * Decision (Ken, 2026-07-07): standard map forms win over data-majority
 * spellings. Backfill (Lane 2 Grand Plan) collapses all variants to these
 * forms and seeds the `townships` table as the single source of truth.
 *
 * Evidence base: full customers.township distinct scan 2026-07-07 — ~400
 * distinct values for ~45 real townships; South Okkalapa alone fragmented
 * across 25+ spellings (~1,200 customers).
 *
 * Lane 1 (this file): new addresses write clean values immediately.
 * Lane 2 (Grand Plan, CRM authors / Cowork executes): seed townships table,
 * backfill customers.township via variant map, CRM dropdown.
 *
 * Order below is the canon order from the 2026-07-07 decision.
 */
export const YANGON_TOWNSHIPS: string[] = [
  'Ahlone',
  'Bahan',
  'Botataung',
  'Dagon',
  'Dagon Seikkan',
  'Dala',
  'Dawbon',
  'East Dagon',
  'Hlaing',
  'Hlaing Tharyar',
  'Hlegu',
  'Hmawbi',
  'Htantabin',
  'Insein',
  'Kamayut',
  'Kawhmu',
  'Kayan',
  'Kungyangon',
  'Kyauktada',
  'Kyauktan',
  'Kyeemyindaing',
  'Lanmadaw',
  'Latha',
  'Mayangone',
  'Mingaladon',
  'Mingalar Taung Nyunt',
  'North Dagon',
  'North Okkalapa',
  'Pabedan',
  'Pazundaung',
  'Sanchaung',
  'Seikkan',
  'Seikkyi Kanaungto',
  'Shwepyithar',
  'South Dagon',
  'South Okkalapa',
  'Taikkyi',
  'Tamwe',
  'Thaketa',
  'Thanlyin',
  'Thingangyun',
  'Thongwa',
  'Twantay',
  'West Dagon',
  'Yankin',
  'Other (outside Yangon)',
];
