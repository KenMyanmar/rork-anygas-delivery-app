/**
 * Catalog helper — wraps the `catalog-list` Edge Function that the Mini App
 * also uses. One fetch returns brands + products + per-brand refill_delivery_fee
 * + allow_new_setup, so the order screen no longer assembles its own catalog
 * from three raw tables. This keeps product data pixel-identical across both apps.
 */

import { supabase } from '@/lib/supabase';

export interface CatalogProduct {
  brand_product_id: string;
  cylinder_type_id: string;
  size_kg: number;
  display_name: string;
  image_url: string | null;
  sort_order: number;
  price_per_kg: number;
  cylinder_price: number;
}

export interface CatalogBrand {
  id: string;
  name: string;
  type: string;
  description: string | null;
  is_active: boolean;
  logo_url: string | null;
  sort_order: number;
  refill_delivery_fee: number;
  allow_new_setup: boolean;
}

export interface CatalogEntry {
  brand: CatalogBrand;
  products: CatalogProduct[];
  price_per_kg: number;
}

export interface CatalogResponse {
  success: boolean;
  catalog: CatalogEntry[];
}

/**
 * Fetch the full catalog from the `catalog-list` Edge Function.
 * Anon-accessible — no auth required. Returns brands sorted by sort_order then name,
 * each with its products sorted by sort_order then size_kg.
 */
export async function fetchCatalog(): Promise<CatalogEntry[]> {
  console.log('[Catalog] Fetching from catalog-list edge function');
  const { data, error } = await supabase.functions.invoke('catalog-list', {
    body: {},
  });

  if (error) {
    console.log('[Catalog] fetch error:', error.message);
    throw new Error(error.message);
  }

  const resp = data as CatalogResponse;
  if (!resp || !resp.success || !Array.isArray(resp.catalog)) {
    console.log('[Catalog] Unexpected response shape:', JSON.stringify(data).slice(0, 200));
    throw new Error('Catalog unavailable');
  }

  console.log('[Catalog] Fetched', resp.catalog.length, 'brands');
  return resp.catalog;
}

/**
 * Display-name rename: DB stores "Other Partners", Mini App shows "Any Brands".
 * Display-only — never changes the underlying name matching.
 */
export function displayBrandName(name: string): string {
  return name === 'Other Partners' ? 'Any Brands' : name;
}
