import React, { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';

export type Language = 'mm' | 'en';

const LANG_KEY = 'anygas_lang';

/**
 * Bilingual MM/EN provider. Myanmar is the default, per Mini App parity.
 * Language choice persists across launches via AsyncStorage.
 *
 * Strings live in a single dictionary keyed by language. Screens call `t('key')`
 * to get the active-language string, and `tMM('key')` is available for the
 * always-visible Myanmar subtitle pattern used throughout the app.
 */
const STRINGS = {
  // Tabs
  tab_home: { mm: 'ပင်မ', en: 'Home' },
  tab_orders: { mm: 'မှာယူမှုများ', en: 'Orders' },
  tab_alerts: { mm: 'အကြောင်းကြားစာ', en: 'Alerts' },
  tab_profile: { mm: 'ပရိုဖိုင်', en: 'Profile' },

  // Home
  welcome: { mm: 'ကြိုဆိုပါတယ်', en: 'Welcome' },
  order_gas_now: { mm: 'အခုပဲ မှာယူပါ', en: 'ORDER GAS NOW' },
  fast_delivery: { mm: 'တံခါးဆီကို မြန်မြန်ပို့ပေး', en: 'Fast delivery to your door' },
  quick_reorder: { mm: 'ပြန်မှာယူရန်', en: 'Quick Reorder' },
  our_brands: { mm: 'ကျွန်တော်တို့ရဲ့ အမှတ်တံဆိပ်များ', en: 'Our Brands' },
  active_order: { mm: 'လုပ်ဆောင်ဆဲ မှာယူမှု', en: 'Active Order' },
  track_order: { mm: 'ခြေရာခံရန်', en: 'Track Order' },

  // Order flow
  select_brand: { mm: 'ဓာတ်ငွေ့အမှတ်တံဆိပ် ရွေးချယ်ပါ', en: 'Select Gas Brand' },
  select_size: { mm: 'ဆလင်ဒါအရွယ်အစား ရွေးချယ်ပါ', en: 'Select Cylinder Size' },
  order_type: { mm: 'မှာယူမှုအမျိုးအစား', en: 'Order Type' },
  price_breakdown: { mm: 'စျေးနှုန်းအသေးအစိတ်', en: 'Price Breakdown' },
  delivery_address: { mm: 'ပို့ဆောင်ရမည့်လိပ်စာ', en: 'Delivery Address' },
  payment_method: { mm: 'ငွေသွင်းနည်း', en: 'Payment Method' },
  confirm_order: { mm: 'မှာယူမှု အတည်ပြုပါ', en: 'Confirm Order' },
  continue: { mm: 'ဆက်သွားပါ', en: 'Continue' },
  place_order: { mm: 'မှာယူမှု ပြုလုပ်ပါ', en: 'Place Order' },
  delivering_to: { mm: 'ပို့ဆောင်ရမည့်နေရာ', en: 'Delivering to' },
  change: { mm: 'ပြောင်းရန်', en: 'Change' },
  brand: { mm: 'အမှတ်တံဆိပ်', en: 'Brand' },
  size: { mm: 'အရွယ်အစား', en: 'Size' },
  type: { mm: 'အမျိုးအစား', en: 'Type' },
  address: { mm: 'လိပ်စာ', en: 'Address' },
  payment: { mm: 'ငွေသွင်းနည်း', en: 'Payment' },
  total: { mm: 'စုစုပေါင်း', en: 'Total' },
  gas: { mm: 'ဓာတ်ငွေ့', en: 'Gas' },
  new_cylinder: { mm: 'ဆလင်ဒါအသစ်', en: 'New Cylinder' },
  delivery_fee: { mm: 'ပို့ဆောင်ခ', en: 'Delivery Fee' },
  exchange_fee: { mm: 'လဲလှယ်ခ', en: 'Exchange Fee' },
  service_fee: { mm: 'ဝန်ဆောင်ခ', en: 'Service Fee' },
  loading_brands: { mm: 'အမှတ်တံဆိပ်များ ရှာနေသည်...', en: 'Loading brands...' },
  loading_sizes: { mm: 'အရွယ်အစားများ ရှာနေသည်...', en: 'Loading sizes...' },
  failed_brands: { mm: 'အမှတ်တံဆိပ်များ ရှာမတွေ့ပါ', en: 'Failed to load brands' },
  failed_sizes: { mm: 'ဆလင်ဒါအရွယ်အစား ရှာမတွေ့ပါ', en: 'Failed to load cylinder sizes' },
  no_sizes: { mm: 'ဤအမှတ်တံဆိပ်တွင် အရွယ်အစားမရှိပါ', en: 'No cylinder sizes available for this brand' },
  retry: { mm: 'ပြန်လုပ်ပါ', en: 'Retry' },

  // Order types
  type_refill: { mm: 'ပြန်ဖြည့်', en: 'Refill' },
  type_refill_desc: { mm: 'ရှိပြီးသား ဆလင်ဒါ ပြန်ဖြည့်ပါ', en: 'Refill your existing cylinder' },
  type_new_setup: { mm: 'အသစ်တပ်ဆင်', en: 'New Setup' },
  type_new_setup_desc: { mm: 'ဆလင်ဒါအသစ် + ရီဂူလေတတ် ရယူပါ', en: 'Get a brand new cylinder + regulator' },
  type_exchange: { mm: 'လဲလှယ်', en: 'Exchange' },
  type_exchange_desc: { mm: 'ဗလာဆလင်ဒါကို အပြည့်နဲ့ လဲလှယ်ပါ', en: 'Swap your empty cylinder for a full one' },
  type_service_call: { mm: 'ဝန်ဆောင်မှုခေါ်ဆို', en: 'Service Call' },
  type_service_call_desc: { mm: 'နည်းပညာရှင် ခေါ်ဆို (မပို့ဆောင်ခ မရှိ)', en: 'Request a technician visit (no delivery fee)' },

  // Payment methods
  pay_cash: { mm: 'ငွေသားဖြင့် ပေးဆပ်ရန်', en: 'Cash on Delivery' },
  pay_kbz: { mm: 'KBZ Pay', en: 'KBZ Pay' },
  pay_wave: { mm: 'Wave Money', en: 'Wave Money' },
  pay_cb: { mm: 'CB Pay', en: 'CB Pay' },

  // Tracking — 4-stage contract
  track_title: { mm: 'မှာယူမှု ခြေရာခံခြင်း', en: 'Order Tracking' },
  stage_placed: { mm: 'မှာယူပြီး', en: 'Order Placed' },
  stage_assigned: { mm: 'ထောက်ပံ့သူ တာဝန်ယူပြီး', en: 'Supplier Assigned' },
  stage_on_the_way: { mm: 'ပို့ဆောင်နေဆဲ', en: 'On the Way' },
  stage_delivered: { mm: 'ပို့ဆောင်ပြီး', en: 'Delivered' },
  order_status: { mm: 'မှာယူမှု အခြေအနေ', en: 'Order Status' },
  est_delivery: { mm: 'ခန့်မှန်း ပို့ဆောင်ချိန်', en: 'Estimated Delivery' },
  delivery_agent: { mm: 'ပို့ဆောင်သူ', en: 'Delivery Agent' },
  no_active_order: { mm: 'လုပ်ဆောင်ဆဲ မှာယူမှု မရှိပါ', en: 'No active order' },
  order_cancelled: { mm: 'မှာယူမှု ပယ်ဖျက်ပြီး', en: 'Order Cancelled' },
  delivery_unsuccessful: { mm: 'ပို့ဆောင်မှု မအောင်မြင်ပါ', en: 'Delivery Unsuccessful' },
  back_home: { mm: 'ပင်မသို့ ပြန်သွား', en: 'Back to Home' },
  contact_8484: { mm: '8484 သို့ ဆက်သွယ်ပါ', en: 'Contact 8484' },
  rate_delivery: { mm: 'ပို့ဆောင်မှုကို အဆင့်သတ်မှတ်ပါ', en: 'Rate this delivery' },

  // Terminal status labels
  status_placed: { mm: 'မှာယူပြီး', en: 'Placed' },
  status_assigned: { mm: 'ထောက်ပံ့သူ တာဝန်ယူပြီး', en: 'Assigned' },
  status_on_the_way: { mm: 'ပို့ဆောင်နေဆဲ', en: 'On the Way' },
  status_delivered: { mm: 'ပို့ဆောင်ပြီး', en: 'Delivered' },
  status_cancelled: { mm: 'ပယ်ဖျက်ပြီး', en: 'Cancelled' },
  status_failed: { mm: 'မအောင်မြင်ပါ', en: 'Failed' },

  // Orders list
  filter_all: { mm: 'အားလုံး', en: 'All' },
  filter_active: { mm: 'လုပ်ဆောင်ဆဲ', en: 'Active' },
  filter_delivered: { mm: 'ပို့ဆောင်ပြီး', en: 'Delivered' },
  filter_cancelled: { mm: 'ပယ်ဖျက်ပြီး', en: 'Cancelled' },
  no_orders: { mm: 'မှာယူမှု မရှိသေးပါ', en: 'No orders found' },
  no_orders_sub: { mm: 'သင့်မှာယူမှု မှတ်တမ်း ဤနေရာတွင် ပေါ်ပါမည်', en: 'Your order history will appear here' },

  // Notifications
  no_notifications: { mm: 'အကြောင်းကြားစာ မရှိသေးပါ', en: 'No notifications yet' },
  no_notifications_sub: { mm: 'မှာယူမှု အပြောင်းအလဲနှင့် ပရိုမိုးရှင်းများ ဤနေရာတွင် ပေါ်ပါမည်', en: "You'll see order updates and promotions here" },

  // Profile
  registered_address: { mm: 'မှတ်ပုံတင်ထားသောလိပ်စာ', en: 'Registered Address' },
  saved_addresses: { mm: 'သိမ်းထားသောလိပ်စာများ', en: 'Saved Delivery Addresses' },
  privacy_security: { mm: 'ကိုယ်ရေးအချက်အလက်နှင့် လုံခြုံရေး', en: 'Privacy & Security' },
  help_support: { mm: 'အကူအညီနှင့် ပံ့ပိုးမှု', en: 'Help & Support' },
  terms: { mm: 'ဝန်ဆောင်မှု စည်းမျဉ်းများ', en: 'Terms of Service' },
  no_saved_addresses: { mm: 'သိမ်းထားသောလိပ်စာ မရှိသေးပါ', en: 'No saved addresses yet' },
  default: { mm: 'ပုံသေ', en: 'Default' },
  log_out: { mm: 'ထွက်ရန်', en: 'Log Out' },
  log_out_confirm: { mm: 'သင် ထွက်ရန် သေချာပါသလား?', en: 'Are you sure you want to log out?' },
  cancel: { mm: 'မလုပ်တော့', en: 'Cancel' },

  // Order errors
  order_failed: { mm: 'မှာယူမှု မအောင်မြင်ပါ', en: 'Order Failed' },
  price_changed: { mm: 'စျေးနှုန်း ပြောင်းလဲသွားပါသည်။ ပြန်လည် စစ်ဆေးပြီး ကြိုးစားကြည့်ပါ။', en: 'Price changed since you opened the order. Please review and try again.' },
} as const;

export type StringKey = keyof typeof STRINGS;

export const [I18nProvider, useI18n] = createContextHook(() => {
  const [language, setLanguage] = useState<Language>('mm');

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(LANG_KEY) as Language | null;
        if (stored === 'mm' || stored === 'en') {
          setLanguage(stored);
        }
      } catch (e) {
        console.log('[I18n] Failed to load saved language:', e);
      }
    })();
  }, []);

  const changeLanguage = useCallback((lang: Language) => {
    setLanguage(lang);
    AsyncStorage.setItem(LANG_KEY, lang).catch((e) =>
      console.log('[I18n] Failed to save language:', e)
    );
  }, []);

  const toggleLanguage = useCallback(() => {
    const next: Language = language === 'mm' ? 'en' : 'mm';
    changeLanguage(next);
  }, [language, changeLanguage]);

  /** Active-language string for a key. */
  const t = useCallback(
    (key: StringKey): string => {
      const entry = STRINGS[key];
      if (!entry) return key;
      return entry[language];
    },
    [language]
  );

  /** Myanmar string for a key (regardless of active language) — for the bilingual subtitle pattern. */
  const tMM = useCallback(
    (key: StringKey): string => {
      const entry = STRINGS[key];
      if (!entry) return key;
      return entry.mm;
    },
    []
  );

  /** English string for a key. */
  const tEN = useCallback(
    (key: StringKey): string => {
      const entry = STRINGS[key];
      if (!entry) return key;
      return entry.en;
    },
    []
  );

  return {
    language,
    changeLanguage,
    toggleLanguage,
    t,
    tMM,
    tEN,
    isMM: language === 'mm',
    isEN: language === 'en',
  };
});
