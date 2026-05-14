import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { Feather } from '@expo/vector-icons';

var GREEN  = '#0C9E54';
var NAVY   = '#172250';
var WHITE  = '#FFFFFF';
var GRAY   = '#6B7280';
var BORDER = '#E5E7EB';
var MINT   = '#E8F5E9';
var AMBER  = '#F59E0B';
var CORAL  = '#fb5b5b';

var CONFIDENCE_CONFIG = {
  'Likely':       { color: GREEN,  bgColor: MINT,       icon: 'check-circle' },
  'Maybe':        { color: AMBER,  bgColor: '#FFFBEB',  icon: 'alert-circle' },
  'Needs review': { color: CORAL,  bgColor: '#FFF1F0',  icon: 'help-circle'  },
};

function PantryItemCard(props) {
  var item     = props.item;
  var onKeep   = props.onKeep;
  var onRemove = props.onRemove;
  var onEdit   = props.onEdit;
  var kept     = props.kept;

  var [editing, setEditing]   = useState(false);
  var [editName, setEditName] = useState(item.name);

  var cfg = CONFIDENCE_CONFIG[item.confidence] || CONFIDENCE_CONFIG['Maybe'];

  function handleEditDone() {
    setEditing(false);
    if (editName.trim() && onEdit) {
      onEdit({ ...item, name: editName.trim() });
    }
  }

  return (
    <View style={[styles.card, kept && styles.cardKept]}>
      {/* Left: icon + info */}
      <View style={[styles.iconWrap, { backgroundColor: cfg.bgColor }]}>
        <Feather name={cfg.icon} size={18} color={cfg.color} />
      </View>

      <View style={styles.info}>
        {editing ? (
          <TextInput
            style={styles.editInput}
            value={editName}
            onChangeText={setEditName}
            onBlur={handleEditDone}
            onSubmitEditing={handleEditDone}
            autoFocus
          />
        ) : (
          <Text style={styles.name}>{item.name}</Text>
        )}
        <View style={[styles.confidencePill, { backgroundColor: cfg.bgColor }]}>
          <Text style={[styles.confidenceText, { color: cfg.color }]}>{item.confidence}</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, kept && styles.actionBtnActive]}
          onPress={onKeep}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Feather name="check" size={15} color={kept ? WHITE : GREEN} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => setEditing(true)}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Feather name="edit-2" size={14} color={GRAY} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={onRemove}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Feather name="x" size={15} color={CORAL} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

var styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WHITE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
    gap: 12,
  },
  cardKept: {
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FBF4',
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: '600', color: NAVY, marginBottom: 4 },
  editInput: {
    fontSize: 14,
    fontWeight: '600',
    color: NAVY,
    borderBottomWidth: 1,
    borderBottomColor: GREEN,
    paddingVertical: 2,
    marginBottom: 4,
  },
  confidencePill: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  confidenceText: { fontSize: 10, fontWeight: '700' },
  actions: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnActive: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
});

export default PantryItemCard;
