import type { ReactNode } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, formStyles } from './forms';
import { colors } from './theme';

export function Dialog({
  title,
  visible,
  onClose,
  children,
}: {
  title: string;
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          <View style={[formStyles.card, styles.card]}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            {children}
            <Button title="Закрыть" secondary onPress={onClose} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#17223B77' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: { maxWidth: 560, width: '100%', alignSelf: 'center' },
  title: { color: colors.ink, fontWeight: '700', fontSize: 22 },
});
