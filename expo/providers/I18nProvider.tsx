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
  // vC17 r2: intent-first flow — Refill/New Set cards are the first screen.
  intent_title: { mm: 'ဘာလုပ်ချင်လဲ?', en: 'What do you need?' },
  intent_refill_title: { mm: 'ပြန်ဖြည့်မယ်', en: 'Refill' },
  intent_refill_desc: { mm: 'ရှိပြီးသား ဆလင်ဒါ ပြန်ဖြည့်ပါ', en: 'Refill your existing cylinder' },
  intent_newset_title: { mm: 'အသစ်တပ်ဆင်', en: 'New Set' },
  intent_newset_desc: { mm: 'ဆလင်ဒါအသစ် + ရီဂူလေတာ', en: 'New cylinder + regulator' },
  intent_promotions_soon: { mm: 'ပရိုမိုးရှင်း လာမည်', en: 'Promotions coming' },
  // vC17 r2: memory shortcut — "Your usual" card for repeat refill customers.
  usual_card_title: { mm: 'သင့်အမြဲတမ်း', en: 'Your usual' },
  order_again: { mm: 'ပြန်မှာယူပါ', en: 'Order again' },
  usual_change: { mm: 'ပြောင်းမလား', en: 'Change' },
  // vC17: quantity stepper
  quantity: { mm: 'အရေအတွက်', en: 'Quantity' },
  select_brand: { mm: 'ဓာတ်ငွေ့အမှတ်တံဆိပ် ရွေးချယ်ပါ', en: 'Select Gas Brand' },
  select_size: { mm: 'ဆလင်ဒါအရွယ်အစား ရွေးချယ်ပါ', en: 'Select Cylinder Size' },
  order_type: { mm: 'မှာယူမှုအမျိုးအစား', en: 'Order Type' },
  price_breakdown: { mm: 'စျေးနှုန်းအသေးအစိတ်', en: 'Price Breakdown' },
  delivery_address: { mm: 'ပို့ဆောင်ရမည့်လိပ်စာ', en: 'Delivery Address' },
  add_delivery_address: { mm: 'ပို့ဆောင်ရမည့်လိပ်စာ ထည့်ပါ', en: 'Add Delivery Address' },
  edit_delivery_address: { mm: 'ပို့ဆောင်ရမည့်လိပ်စာ ပြင်ဆင်ပါ', en: 'Edit Delivery Address' },
  address_label: { mm: 'လိပ်စာ', en: 'Address' },
  address_placeholder: { mm: 'အဆောက်အအုံအမည်၊ လမ်း၊ ထပ်၊ အခန်းအမှတ်', en: 'Building name, street, floor, room number' },
  select_township: { mm: 'မြို့နယ် ရွေးချယ်ပါ', en: 'Select Township' },
  save_and_continue: { mm: 'သိမ်းဆည်းပြီး ဆက်သွားပါ', en: 'Save & Continue' },
  address_save_failed: { mm: 'လိပ်စာ သိမ်းဆည်း၍ မရပါ။ ပြန်လည်ကြိုးစားပါ။', en: 'Failed to save address. Please try again.' },
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
  // vC13: honest stage-based hints. No eta column exists on orders (bounded-
  // negative), so we show a typical range instead of a fabricated time.
  stage_placed_hint: { mm: 'မှာယူမှု လက်ခံပြီး — ထောက်ပံ့သူ တာဝန်ယူရန် စောင့်ဆိုင်းနေပါသည်', en: 'Order received — waiting for supplier assignment' },
  stage_assigned_hint: { mm: 'ထောက်ပံ့သူ တာဝန်ယူပြီး — ပို့ဆောင်ရန် ပြင်ဆင်နေပါသည်', en: 'Supplier assigned — preparing for dispatch' },
  stage_on_the_way_hint: { mm: 'ခြံစဉ်ပို့ဆောင်နေပါသည် — ခန့်မှန်း 40–60 မိနစ်', en: 'On the way to you — usually 40–60 min' },
  stage_delivered_hint: { mm: 'ပို့ဆောင်ပြီးပါပြီ', en: 'Delivered — thank you' },
  eta_typical_range: { mm: 'ခန့်မှန်း 40–60 မိနစ်', en: 'Usually 40–60 min' },
  order_status: { mm: 'မှာယူမှု အခြေအနေ', en: 'Order Status' },
  est_delivery: { mm: 'ခန့်မှန်း ပို့ဆောင်ချိန်', en: 'Estimated Delivery' },
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
  log_out_confirm: { mm: 'သင် ထွက်လျှင် ပြန်လည် လော့ဂ်အင်ရန် SMS ကုဒ် အသစ်လိုပါမည်။ အက်ပ်ကို Lock လုပ်ခြင်းသာ အသုံးပြုပါ။', en: 'Logging out means you\'ll need a new SMS code to sign back in. Lock the app instead?' },
  cancel: { mm: 'မလုပ်တော့', en: 'Cancel' },

  // vC15 Task A — Lock-first profile
  lock_app: { mm: 'အက်ပ်လော့ခ် လုပ်ပါ', en: 'Lock App' },
  lock_app_desc: { mm: 'လုံခြုံစွာ ထွက်ရန် — PIN ဖြင့် ပြန်ဖွင့်နိုင်ပါသည်', en: 'Lock securely — unlock with PIN' },
  log_out_link: { mm: 'အကောင့်မှ ထွက်ရန်', en: 'Sign out of account' },

  // Order errors
  order_failed: { mm: 'မှာယူမှု မအောင်မြင်ပါ', en: 'Order Failed' },
  price_changed: { mm: 'စျေးနှုန်း ပြောင်းလဲသွားပါသည်။ ပြန်လည် စစ်ဆေးပြီး ကြိုးစားကြည့်ပါ။', en: 'Price changed since you opened the order. Please review and try again.' },

  // vC14 Task A — PIN / biometric app-lock (KBZ Pay pattern)
  // Setup
  pin_setup_title: { mm: 'PIN ကုဒ် သတ်မှတ်ပါ', en: 'Set Up PIN' },
  pin_setup_subtitle: { mm: 'သင့်အကောင့် လုံခြုံရေးအတွက် 4 လုံး PIN ကုဒ် ထည့်ပါ', en: 'Enter a 4-digit PIN to secure your account' },
  pin_confirm_subtitle: { mm: 'အတည်ပြုရန် PIN ကုဒ်ကို ထပ်ထည့်ပါ', en: 'Re-enter your PIN to confirm' },
  pin_mismatch: { mm: 'PIN ကုဒ်များ မကိုက်ညီပါ။ ပြန်လည် စတင်ပါ။', en: 'PINs do not match. Please start again.' },
  pin_too_short: { mm: 'PIN ကုဒ်သည် 4 လုံး ဖြစ်ရပါသည်။', en: 'PIN must be 4 digits.' },
  // Unlock
  pin_unlock_title: { mm: 'အက်ပ်ကို ဖွင့်ရန် PIN ထည့်ပါ', en: 'Enter PIN to Unlock' },
  pin_unlock_subtitle: { mm: 'သင့် PIN ကုဒ် 4 လုံး ထည့်ပါ', en: 'Enter your 4-digit PIN' },
  pin_wrong: { mm: 'PIN မမှန်ပါ။', en: 'Wrong PIN.' },
  pin_attempts_remaining: { mm: 'ကြိုးစားရန် {n} ကြိမ်ကျန်ပါသည်', en: '{n} attempts remaining' },
  pin_locked_out: { mm: '5 ကြိမ် မှားယွင်းခဲ့ပါသည်။ လုံခြုံရေးအရ ထွက်သွားပါပြီ။ ပြန်လည် လော့ဂ်အင် ပါ။', en: 'Too many wrong attempts. You have been signed out for security. Please log in again.' },
  // Biometric
  biometric_unlock: { mm: 'လက်ဗွေရာ/မျက်နှာဖြင့် ဖွင့်ပါ', en: 'Unlock with Biometrics' },
  biometric_prompt_title: { mm: 'AnyGas ဖွင့်ရန် အတည်ပြုပါ', en: 'Authenticate to Open AnyGas' },
  biometric_prompt_subtitle: { mm: 'လက်ဗွေရာ သို့မဟုတ် မျက်နှာကို အသုံးပြုပါ', en: 'Use your fingerprint or face' },
  biometric_toggle: { mm: 'လက်ဗွေရာ/မျက်နှာဖြင့် ဖွင့်ရန်', en: 'Unlock with Fingerprint/Face' },
  biometric_unavailable: { mm: 'ဤစက်တွင် လက်ဗွေရာ/မျက်နှာ မရှိပါ။ PIN ကို အသုံးပြုပါ။', en: 'Biometrics not available on this device. Use your PIN.' },
  // Forgot PIN
  pin_forgot: { mm: 'PIN မမှတ်မိဘူး', en: 'Forgot PIN?' },
  pin_forgot_confirm: { mm: 'PIN ကို ပြန်သတ်မှတ်ရန် ထွက်ရန် လိုပါသည်။ ထွက်ပြီး ပြန်လည် လော့ဂ်အင် ပါမည်။ ဆက်လုပ်မလား?', en: 'Resetting your PIN requires signing out and logging in again. Continue?' },
  // Misc
  pin_continue: { mm: 'ဆက်လုပ်ပါ', en: 'Continue' },

  // vC15 Task B — Welcome-back prefill
  welcome_back: { mm: 'ပြန်လည် ကြိုဆိုပါတယ်', en: 'Welcome back' },
  welcome_back_sub: { mm: 'OTP ပို့ရန် တစ်ချက်နှိပ်ပါ', en: 'One tap to send OTP' },
  not_you: { mm: 'သင်မဟုတ်ဘူးလား? အခြားနံပါတ်သုံးပါ', en: 'Not you? Use another number' },

  // vC16 Task A — Soft sign-out + account tile
  account_tile_enter_pin: { mm: 'ဆက်လုပ်ရန် PIN ထည့်ပါ', en: 'Enter PIN to continue' },
  switch_account: { mm: 'အခြားနံပါတ်သုံးပါ', en: 'Use another number' },
  sign_out_soft: { mm: 'အကောင့်မှ ထွက်ရန်', en: 'Sign out' },
  sign_out_soft_confirm: { mm: 'ထွက်လျှင် PIN ဖြင့် ပြန်ဝင်နိုင်ပါသည်။ SMS မလိုပါ။ ဆက်လုပ်မလား?', en: 'You can return with your PIN — no SMS needed. Continue?' },
  remove_account: { mm: 'ဤစက်မှ အကောင့်ဖျက်ပါ', en: 'Remove account from this device' },
  remove_account_confirm: { mm: 'ဤစက်မှ သင့်အကောင့်ကို ဖယ်ရှားပါမည်။ ပြန်ဝင်ရန် SMS ကုဒ် လိုပါမည်။ ဆက်လုပ်မလား?', en: 'This removes your account from this device. You will need an SMS code to sign back in. Continue?' },
  remove_account_desc: { mm: 'အကောင့် လုံးဝ ဖယ်ရှားပါမည်', en: 'Fully remove account and data from this device' },
  delete_account_permanently: { mm: 'အကောင့်ကို အပြီးဖျက်မည်', en: 'Delete my account permanently' },

  // vC16 Task B — Address experience (landmark + GPS)
  landmark_label: { mm: 'အမှတ်အသား (ရွေးချယ်)', en: 'Landmark (optional)' },
  landmark_placeholder: { mm: 'ဥပမာ - City Mart အနီး', en: 'e.g. near City Mart' },
  use_my_location: { mm: 'ကျွန်တော်ရဲ့ နေရာကို သုံးပါ', en: 'Use my location' },
  location_saved: { mm: 'နေရာ သိမ်းဆည်ပြီးပါပြီ ✓', en: 'Location saved ✓' },
  location_denied: { mm: 'နေရာ ခွင့်ပြုချက် မရပါ။ လက်ဖြင့် ထည့်နိုင်ပါသည်။', en: 'Location permission denied. You can still enter your address manually.' },
  location_loading: { mm: 'နေရာ ရှာနေသည်...', en: 'Getting location...' },
  address_saved_success: { mm: 'လိပ်စာ သိမ်းဆည်ပြီးပါပြီ ✓', en: 'Address saved ✓' },
  edit_address_title: { mm: 'ပို့ဆောင်ရမည့်လိပ်စာ ပြင်ဆင်ပါ', en: 'Edit Delivery Address' },

  // NS-2: New Set bundle showcase
  bundles_title: { mm: 'အသစ်တပ်ဆင် ပက်ကေ့ဂျ်', en: 'New Set Packages' },
  bundles_sub: { mm: 'ဆလင်ဒါ + စတုံးကိရိယာ ပါဝင်သော ပက်ကေ့ဂျ်', en: 'Cylinder + accessory bundles' },
  bundles_empty: { mm: 'လက်ရှိ ပရိုမိုးရှင်း မရှိပါ', en: 'No promotions available right now' },
  bundles_empty_sub: { mm: 'အသစ်တပ်ဆင်ရန် အနီးကြီး ဆက်သွယ်ပါ', en: 'Call 8484 for a custom new setup' },
  bundle_save: { mm: '{n} Ks ချွေး', en: 'Save {n} Ks' },
  bundle_value: { mm: 'တန်ဖိုး', en: 'Value' },
  bundle_price: { mm: 'ပက်ကေ့ဂျ် စျေး', en: 'Package price' },
  bundle_free_delivery: { mm: 'ပို့ဆောင်ခ အခမဲ့', en: 'Free delivery' },
  bundle_brand_label: { mm: 'အမှတ်တံဆိပ်', en: 'Brand' },
  bundle_includes: { mm: 'ပါဝင်ရန်များ', en: 'Includes' },
  bundle_not_available: { mm: 'ဤပရိုမိုးရှင်း ပြီးဆုံးသွားပါပြီ။ ပက်ကေ့ဂျ်များကို ပြန်လည် စစ်ဆေးပါသည်။', en: 'This promotion has ended. Refreshing packages…' },
  bundle_qty: { mm: '{n} ခု', en: '{n} pcs' },
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
