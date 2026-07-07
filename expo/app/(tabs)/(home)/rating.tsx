import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Animated,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Star, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useOrders } from '@/providers/OrderProvider';

export default function RatingScreen() {
  const { getActiveOrder, orders, rateOrder } = useOrders();
  const order = getActiveOrder() || orders.find(o => o.status === 'delivered' && !o.rating) || orders[0];
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState<string>('');
  const scaleAnims = useRef([1, 2, 3, 4, 5].map(() => new Animated.Value(1))).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  const handleStarPress = useCallback((star: number) => {
    setRating(star);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    Animated.sequence([
      Animated.timing(scaleAnims[star - 1], { toValue: 1.4, duration: 100, useNativeDriver: true }),
      Animated.spring(scaleAnims[star - 1], { toValue: 1, tension: 100, friction: 6, useNativeDriver: true }),
    ]).start();
  }, [scaleAnims]);

  const handleSubmit = useCallback(async () => {
    if (!order || rating === 0) return;
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    await rateOrder(order.id, rating, comment || undefined);
    router.back();
  }, [order, rating, comment, rateOrder]);

  const getRatingLabel = (r: number) => {
    const labels = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!'];
    return labels[r] || '';
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
            <X size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          <Text style={styles.title}>How was your delivery?</Text>
          <Text style={styles.titleMM}>သင့်ဂက်စ်ပို့ဆောင်မှု ဘယ်လိုရှိပါသလဲ?</Text>

          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => handleStarPress(star)}
                activeOpacity={0.7}
              >
                <Animated.View style={{ transform: [{ scale: scaleAnims[star - 1] }] }}>
                  <Star
                    size={44}
                    color={star <= rating ? '#FBBF24' : Colors.border}
                    fill={star <= rating ? '#FBBF24' : 'transparent'}
                  />
                </Animated.View>
              </TouchableOpacity>
            ))}
          </View>

          {rating > 0 && (
            <Text style={styles.ratingLabel}>{getRatingLabel(rating)}</Text>
          )}

          <TextInput
            style={styles.commentInput}
            placeholder="Add a comment (optional)"
            placeholderTextColor={Colors.textTertiary}
            value={comment}
            onChangeText={setComment}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[styles.submitButton, rating === 0 && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={rating === 0}
            activeOpacity={0.85}
          >
            <Text style={styles.submitButtonText}>Submit Rating</Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safeArea: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 40,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  titleMM: {
    fontSize: 15,
    color: Colors.textTertiary,
    marginTop: 4,
    marginBottom: 36,
    textAlign: 'center',
  },
  starsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  ratingLabel: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.primary,
    marginBottom: 32,
  },
  commentInput: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    fontSize: 15,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 100,
    marginBottom: 24,
  },
  submitButton: {
    width: '100%',
    backgroundColor: Colors.primary,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: '#FFFFFF',
  },
  buttonDisabled: {
    backgroundColor: Colors.primaryMuted,
  },
});
