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
 */
export async function fetchEquipmentBundles(): Promise<EquipmentBundle[]> {
  console.log('[Bundles] Fetching equipment_bundles via REST');
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
  console.log('[Bundles] Fetched', rows.length, 'visible bundles');
  return rows;
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
