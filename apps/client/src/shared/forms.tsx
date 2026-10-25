import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { colors } from './theme';

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#989EAE"
        style={[styles.input, props.multiline && { minHeight: 90, textAlignVertical: 'top' }]}
        autoCapitalize="none"
        {...props}
      />
    </View>
  );
}
export function Button({
  title,
  onPress,
  busy = false,
  secondary = false,
  disabled = false,
  style,
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  secondary?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={[
        styles.button,
        secondary && styles.secondary,
        (disabled || busy) && { opacity: 0.6 },
        style,
      ]}
    >
      {busy && <ActivityIndicator size="small" color={secondary ? colors.primary : 'white'} />}
      <Text style={[styles.buttonLabel, secondary && { color: colors.primary }]}>{title}</Text>
    </Pressable>
  );
}
export function Notice({ message, success = false }: { message: string; success?: boolean }) {
  return (
    <View
      accessibilityRole={success ? 'text' : 'alert'}
      style={[styles.notice, { backgroundColor: success ? colors.greenSoft : '#FFF0EF' }]}
    >
      <Text style={{ color: success ? colors.green : colors.danger, lineHeight: 22 }}>
        {message}
      </Text>
    </View>
  );
}
export const formStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 24,
    gap: 18,
  },
  narrow: { width: '100%', maxWidth: 480, alignSelf: 'center' },
  link: { color: colors.primary, fontSize: 14, fontWeight: '600', paddingVertical: 5 },
  row: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', alignItems: 'center' },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 22 },
});
const styles = StyleSheet.create({
  field: { gap: 8 },
  label: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#DCE0E9',
    backgroundColor: 'white',
    color: colors.ink,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 12,
    minHeight: 46,
    fontSize: 15,
  },
  button: {
    minHeight: 46,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  secondary: { backgroundColor: colors.primarySoft },
  buttonLabel: { color: 'white', fontSize: 14, fontWeight: '700' },
  notice: { padding: 14, borderRadius: 10 },
});
