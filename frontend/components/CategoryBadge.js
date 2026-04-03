import React from 'react';
import { 
  ShoppingBag, Coffee, Car, Home, Heart, Briefcase, Zap, HelpCircle,
  BookOpen, Umbrella, Smartphone, Plane, Gift, Landmark, Coins, MessageSquare,
  Sparkles
} from 'lucide-react';

export const CATEGORY_MAP = {
  'Income': { icon: Briefcase, color: '#06b6d4', bg: '#ecfeff' },
  'Housing': { icon: Home, color: '#ef4444', bg: '#fef2f2' },
  'Groceries': { icon: ShoppingBag, color: '#22c55e', bg: '#f0fdf4' },
  'Dining & Drinks': { icon: Coffee, color: '#f59e0b', bg: '#fffbeb' },
  'Transportation': { icon: Car, color: '#3b82f6', bg: '#eff6ff' },
  'Shopping': { icon: ShoppingBag, color: '#ec4899', bg: '#fdf2f8' },
  'Health & Wellness': { icon: Heart, color: '#ef4444', bg: '#fef2f2' },
  'Insurance': { icon: Umbrella, color: '#64748b', bg: '#f1f5f9' },
  'Subscriptions': { icon: Smartphone, color: '#8b5cf6', bg: '#f5f3ff' },
  'Education': { icon: BookOpen, color: '#3b82f6', bg: '#eff6ff' },
  'Travel & Leisure': { icon: Plane, color: '#06b6d4', bg: '#ecfeff' },
  'Gifts & Donations': { icon: Gift, color: '#ec4899', bg: '#fdf2f8' },
  'Finance & Taxes': { icon: Landmark, color: '#64748b', bg: '#f1f5f9' },
  'Savings & Investments': { icon: Coins, color: '#22c55e', bg: '#f0fdf4' },
  'Payment requests': { icon: MessageSquare, color: '#f59e0b', bg: '#fffbeb' },
  'Other': { icon: HelpCircle, color: '#94a3b8', bg: '#f8fafc' },
  'Uncategorized': { icon: HelpCircle, color: '#94a3b8', bg: '#f8fafc' }
};

export const getCategoryInfo = (category) => {
  return CATEGORY_MAP[category] || CATEGORY_MAP['Uncategorized'];
};

export default function CategoryBadge({ category, showIcon = true, count }) {
  const info = getCategoryInfo(category);
  const Icon = info.icon;

  return (
    <div style={{ 
      display: 'inline-flex', alignItems: 'center', gap: '6px', 
      padding: '2px 8px', borderRadius: '8px', 
      background: info.bg, color: info.color,
      fontSize: '0.85em', fontWeight: 'bold', border: `1px solid ${info.color}33`,
      whiteSpace: 'nowrap'
    }}>
      {showIcon && <Icon size={12} />}
      <span>{category}{count !== undefined ? ` (${count})` : ''}</span>
    </div>
  );
}
