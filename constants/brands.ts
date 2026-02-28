import { OrderTypeOption, PaymentOption } from '@/types';

export const ORDER_TYPES: OrderTypeOption[] = [
  {
    id: 'refill',
    label: 'Refill',
    labelMM: 'ပြန်ဖြည့်',
    description: 'Refill your existing cylinder',
    descriptionMM: 'ရှိပြီးသား ဆလင်ဒါ ပြန်ဖြည့်ပါ',
  },
  {
    id: 'new_setup',
    label: 'New Setup',
    labelMM: 'အသစ်တပ်ဆင်',
    description: 'Get a brand new cylinder + regulator',
    descriptionMM: 'ဆလင်ဒါအသစ် + ရီဂူလေတာ ရယူပါ',
  },
  {
    id: 'exchange',
    label: 'Exchange',
    labelMM: 'လဲလှယ်',
    description: 'Swap your empty cylinder for a full one',
    descriptionMM: 'ဗလာဆလင်ဒါကို အပြည့်နဲ့ လဲလှယ်ပါ',
  },
];

export const PAYMENT_OPTIONS: PaymentOption[] = [
  { id: 'cash', label: 'Cash on Delivery', icon: 'banknote', color: '#16A34A' },
  { id: 'kbz_pay', label: 'KBZ Pay', icon: 'smartphone', color: '#0066CC' },
  { id: 'wave_money', label: 'Wave Money', icon: 'wifi', color: '#FFB800' },
  { id: 'cb_pay', label: 'CB Pay', icon: 'credit-card', color: '#E91E63' },
];
