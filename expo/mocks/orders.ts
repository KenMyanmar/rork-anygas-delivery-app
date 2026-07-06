import { Order, Notification, SavedAddress } from '@/types';

export const MOCK_ADDRESSES: SavedAddress[] = [
  {
    id: 'addr_1',
    label: 'Home',
    address: 'No. 42, Inya Road, Kamayut Township, Yangon',
    latitude: 16.8409,
    longitude: 96.1735,
    isDefault: true,
  },
  {
    id: 'addr_2',
    label: 'Office',
    address: 'No. 88, Kaba Aye Pagoda Rd, Bahan Township, Yangon',
    latitude: 16.8584,
    longitude: 96.1653,
    isDefault: false,
  },
];

export const MOCK_ORDERS: Order[] = [
  {
    id: 'ord_001',
    userId: 'user_1',
    brandId: 'parami',
    cylinderSize: 14,
    orderType: 'refill',
    pricing: { gasPrice: 16500, cylinderPrice: 0, deliveryFee: 3000, total: 19500 },
    address: MOCK_ADDRESSES[0],
    paymentMethod: 'cash',
    status: 'delivered',
    // vC13: agent removed — dead schema (keyed off ghost columns).
    rating: 5,
    ratingComment: 'Fast delivery!',
    createdAt: '2026-02-25T10:30:00Z',
    updatedAt: '2026-02-25T11:15:00Z',
  },
  {
    id: 'ord_002',
    userId: 'user_1',
    brandId: 'easy',
    cylinderSize: 10,
    orderType: 'refill',
    pricing: { gasPrice: 11500, cylinderPrice: 0, deliveryFee: 3000, total: 14500 },
    address: MOCK_ADDRESSES[1],
    paymentMethod: 'kbz_pay',
    status: 'in_progress',
    // vC13: agent + estimatedDelivery removed — ghost columns / no eta column.
    supplierAssigned: true,
    createdAt: '2026-02-27T08:00:00Z',
    updatedAt: '2026-02-27T08:45:00Z',
  },
];

export const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: 'notif_1',
    title: 'Order Delivered',
    titleMM: 'အော်ဒါ ပို့ပြီးပါပြီ',
    body: 'Your Parami Gas 14kg refill has been delivered.',
    bodyMM: 'သင့် ပါရမီဂက်စ် ၁၄ ကီလို ပြန်ဖြည့်ပြီးပါပြီ။',
    type: 'order_update',
    orderId: 'ord_001',
    read: true,
    createdAt: '2026-02-25T11:15:00Z',
  },
  {
    id: 'notif_2',
    title: 'Agent Dispatched',
    titleMM: 'အေးဂျင့် ထွက်ခွာပြီ',
    body: 'Ko Zaw is on the way with your Easy Gas 10kg.',
    bodyMM: 'ကိုဇော် သင့် အီဇီဂက်စ် ၁၀ ကီလိုနှင့် လာနေပါပြီ။',
    type: 'order_update',
    orderId: 'ord_002',
    read: false,
    createdAt: '2026-02-27T08:45:00Z',
  },
  {
    id: 'notif_3',
    title: 'Weekend Promo!',
    titleMM: 'စနေ/တနင်္ဂနွေ ပရိုမို!',
    body: 'Free delivery on all orders this weekend. Use code: FREEGAS',
    bodyMM: 'ဤစနေ/တနင်္ဂနွေ အော်ဒါအားလုံး ပို့ဆောင်ခ အခမဲ့။ ကုဒ်: FREEGAS',
    type: 'promotion',
    read: false,
    createdAt: '2026-02-26T09:00:00Z',
  },
];
