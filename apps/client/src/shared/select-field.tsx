import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Dialog } from './dialog';
import { Field, formStyles } from './forms';
import { colors } from './theme';

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState('');
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setOpen(true)}
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 13 }}
      >
        <Text style={{ color: colors.ink }}>
          {options.find((option) => option.value === value)?.label ?? 'Выберите…'} ▾
        </Text>
      </Pressable>
      <Dialog title={label} visible={open} onClose={() => setOpen(false)}>
        {options.length > 8 && <Field label="Поиск" value={search} onChangeText={setSearch} />}
        <ScrollView style={{ maxHeight: 360 }}>
          {options
            .filter((option) => option.label.toLowerCase().includes(search.toLowerCase()))
            .map((option) => (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                  setSearch('');
                }}
                style={{ paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.border }}
              >
                <Text
                  style={[
                    formStyles.muted,
                    option.value === value && { color: colors.primary, fontWeight: '700' },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
        </ScrollView>
      </Dialog>
    </View>
  );
}
