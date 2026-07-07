/**
 * Equipment bundles (New Set showcase) — NS-2.
 *
 * RLS on `equipment_bundles` exposes only visible rows to authenticated
 * customers (active + show_in_app + within validity window). Trust the empty
 * result: no visible bundles → the New Set intent card shows a disabled
 * "promotions coming" state and does not navigate.
 *
 * The EF (create-customer-order v47) accepts an optional `bundleId` and prices
 * the order from `bundle_price` server-side. The client NEVER computes the
 * charge amount for a bundle order — `bundle_price` is authoritative and the
 * server re-verifies. Component value is shown only as a "save X Ks" hint.
 */
import { supabase } from '@/lib/supabase';
import { EquipmentBundle } from '@/types';
import { displayBrandName } from '@/lib/catalog';

/**
 * Fetch visible equipment bundles with nested component relations.
 * Returns [] when no bundles are visible (RLS filters) or on error.
 *
 * Diagnostic logging: records auth-token presence, HTTP outcome, and a
 * per-row breakdown (id, name, bundle_price, visibility flags, validity
 * window) so a 0-row result can be attributed to RLS/auth vs. unpriced
 * bundles vs. a genuine empty state. Unpriced bundles (null/NaN
 * bundle_price) are skipped client-side as a defensive measure — a promo
 * card without a price can't render or be ordered (EF v47 would reject as
 * bundle_not_available), so the showcase stays clean.
 */
export async function fetchEquipmentBundles(): Promise<EquipmentBundle[]> {
  const hasSession = !!(await supabase.auth.getSession()).data?.session;
  console.log('[Bundles] Fetching equipment_bundles via REST — authed:', hasSession);
  const { data, error } = await supabase
    .from('equipment_bundles')
    .select(
      '*, cylinder_type:cylinder_types(display_name,size_kg,cylinder_price), stove:stoves(name,price), bundle_accessories(quantity, accessory:accessories(name,price))',
    );

  if (error) {
    console.log('[Bundles] fetch error:', error.message);
    throw new Error(error.message);
  }

  const rows = (data as EquipmentBundle[]) || [];
  console.log('[Bundles] RLS returned', rows.length, 'row(s)');

  // Per-row diagnostic: visibility flags + price + validity window.
  // This settles whether a 0-row result is RLS/auth (no rows at all) vs.
  // unpriced bundles (rows returned but skipped below).
  rows.forEach((r, i) => {
    const now = new Date().toISOString();
    const inWindow =
      (!r.valid_from || r.valid_from <= now) &&
      (!r.valid_until || r.valid_until >= now);
    console.log(
      `[Bundles] row[${i}] id=${r.id} name="${r.name}" ` +
      `bundle_price=${r.bundle_price} ` +
      `is_active=${r.is_active} show_in_app=${r.show_in_app} ` +
      `valid_from=${r.valid_from ?? 'null'} valid_until=${r.valid_until ?? 'null'} ` +
      `in_window=${inWindow}`,
    );
  });

  // Defensive: skip unpriced bundles (null/NaN bundle_price). A promo card
  // without a price can't render meaningfully and EF v47 rejects the order
  // as bundle_not_available. Log each skip so the cause is visible.
  const usable = rows.filter((r) => {
    const priced = r.bundle_price != null && !Number.isNaN(r.bundle_price);
    if (!priced) {
      console.log(`[Bundles] skipping unpriced bundle id=${r.id} name="${r.name}"`);
    }
    return priced;
  });
  console.log('[Bundles] usable (priced) bundles:', usable.length);
  return usable;
}

/**
 * Resolve the brand label for a bundle. The bundle may carry a denormalized
 * `brand_name`, a nested `brand` relation, or just `brand_id` (resolved by the
 * caller via the catalog cache). Falls back to empty string.
 */
export function bundleBrandLabel(bundle: EquipmentBundle): string {
  if (bundle.brand_name) return displayBrandName(bundle.brand_name);
  if (bundle.brand?.name) return displayBrandName(bundle.brand.name);
  return '';
}

/**
 * Sum the component values for the "Save X Ks" hint. Skips unpriced components
 * (no NaN). Returns 0 when nothing is priced — the caller hides the savings chip.
 */
export function computeComponentValue(bundle: EquipmentBundle): number {
  let total = 0;
  if (bundle.cylinder_type?.cylinder_price != null) {
    const p = bundle.cylinder_type.cylinder_price;
    if (!Number.isNaN(p)) total += p;
  }
  if (bundle.stove?.price != null) {
    const p = bundle.stove.price;
    if (!Number.isNaN(p)) total += p;
  }
  for (const acc of bundle.bundle_accessories || []) {
    const p = acc.accessory?.price;
    if (p != null && !Number.isNaN(p)) {
      total += p * (acc.quantity || 1);
    }
  }
  return total;
}
