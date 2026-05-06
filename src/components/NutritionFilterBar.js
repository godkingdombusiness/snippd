import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';

// ─────────────────────────────────────────────────────────────────────────────
// NutritionFilterBar
//
// Props:
//   stores:          string[]           — available store names (from deals)
//   onFiltersChange: (FilterObject) => void
//
// FilterObject shape (mirrors score-deals API):
//   { stores: [], preferences: [], nutrition: { min_protein, max_carbs, max_calories, max_sodium } }
// ─────────────────────────────────────────────────────────────────────────────

const PREFERENCE_OPTIONS = [
  { key: 'vegetarian', label: 'Vegetarian' },
  { key: 'keto',       label: 'Keto'       },
  { key: 'family',     label: 'Family'     },
  { key: 'budget',     label: 'Budget'     },
];

// Quick nutrition filters — tapping cycles through null (off) → preset → off
const NUTRITION_PRESETS = [
  {
    key:   'high_protein',
    label: 'High Protein',
    filter: { min_protein: 15, max_carbs: null, max_calories: null, max_sodium: null },
  },
  {
    key:   'low_carb',
    label: 'Low Carb',
    filter: { min_protein: null, max_carbs: 15, max_calories: null, max_sodium: null },
  },
  {
    key:   'low_calorie',
    label: 'Low Cal',
    filter: { min_protein: null, max_carbs: null, max_calories: 250, max_sodium: null },
  },
  {
    key:   'low_sodium',
    label: 'Low Sodium',
    filter: { min_protein: null, max_carbs: null, max_calories: null, max_sodium: 400 },
  },
];

const EMPTY_NUTRITION = { min_protein: null, max_carbs: null, max_calories: null, max_sodium: null };

export default function NutritionFilterBar({ stores = [], onFiltersChange }) {
  const [selectedStores,      setSelectedStores]      = useState([]);
  const [selectedPreferences, setSelectedPreferences] = useState([]);
  const [activeNutritionKey,  setActiveNutritionKey]  = useState(null);

  const emit = useCallback((newStores, newPrefs, nutritionKey) => {
    const preset = NUTRITION_PRESETS.find(p => p.key === nutritionKey);
    onFiltersChange?.({
      stores:      newStores,
      preferences: newPrefs,
      nutrition:   preset ? preset.filter : EMPTY_NUTRITION,
    });
  }, [onFiltersChange]);

  function toggleStore(store) {
    const next = selectedStores.includes(store)
      ? selectedStores.filter(s => s !== store)
      : [...selectedStores, store];
    setSelectedStores(next);
    emit(next, selectedPreferences, activeNutritionKey);
  }

  function togglePreference(key) {
    const next = selectedPreferences.includes(key)
      ? selectedPreferences.filter(p => p !== key)
      : [...selectedPreferences, key];
    setSelectedPreferences(next);
    emit(selectedStores, next, activeNutritionKey);
  }

  function toggleNutrition(key) {
    const next = activeNutritionKey === key ? null : key;
    setActiveNutritionKey(next);
    emit(selectedStores, selectedPreferences, next);
  }

  function clearAll() {
    setSelectedStores([]);
    setSelectedPreferences([]);
    setActiveNutritionKey(null);
    onFiltersChange?.({ stores: [], preferences: [], nutrition: EMPTY_NUTRITION });
  }

  const hasAnyFilter = selectedStores.length > 0 || selectedPreferences.length > 0 || activeNutritionKey != null;

  return (
    <View style={styles.container}>

      {/* Store chips */}
      {stores.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {stores.map(store => {
            const active = selectedStores.includes(store);
            return (
              <TouchableOpacity
                key={store}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => toggleStore(store)}
                activeOpacity={0.75}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {store}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Preference toggles */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {PREFERENCE_OPTIONS.map(opt => {
          const active = selectedPreferences.includes(opt.key);
          return (
            <TouchableOpacity
              key={opt.key}
              style={[styles.chip, styles.prefChip, active && styles.prefChipActive]}
              onPress={() => togglePreference(opt.key)}
              activeOpacity={0.75}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Nutrition quick-filter buttons */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {NUTRITION_PRESETS.map(preset => {
          const active = activeNutritionKey === preset.key;
          return (
            <TouchableOpacity
              key={preset.key}
              style={[styles.chip, styles.nutritionChip, active && styles.nutritionChipActive]}
              onPress={() => toggleNutrition(preset.key)}
              activeOpacity={0.75}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {preset.label}
              </Text>
            </TouchableOpacity>
          );
        })}

        {hasAnyFilter && (
          <TouchableOpacity
            style={[styles.chip, styles.clearChip]}
            onPress={clearAll}
            activeOpacity={0.75}
          >
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F0FBF0',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#C8E6C9',
  },
  chipRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#A5D6A7',
    backgroundColor: '#FFFFFF',
  },
  chipActive: {
    backgroundColor: '#2E7D32',
    borderColor: '#2E7D32',
  },
  chipText: {
    fontSize: 13,
    color: '#1A237E',
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  prefChip: {
    borderColor: '#81C784',
    backgroundColor: '#F1F8E9',
  },
  prefChipActive: {
    backgroundColor: '#388E3C',
    borderColor: '#388E3C',
  },
  nutritionChip: {
    borderColor: '#FF8A65',
    backgroundColor: '#FFF3E0',
  },
  nutritionChipActive: {
    backgroundColor: '#FF7043',
    borderColor: '#FF7043',
  },
  clearChip: {
    borderColor: '#BDBDBD',
    backgroundColor: '#F5F5F5',
  },
  clearText: {
    fontSize: 13,
    color: '#757575',
    fontWeight: '500',
  },
});
