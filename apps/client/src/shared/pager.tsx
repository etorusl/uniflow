import { Text, View } from 'react-native';
import { Button, formStyles } from './forms';

export function Pager({
  page,
  total,
  limit,
  setPage,
}: {
  page: number;
  total: number;
  limit: number;
  setPage: (n: number) => void;
}) {
  if (total <= limit && page === 1) return null;
  return (
    <View style={formStyles.row}>
      <Button title="Назад" secondary disabled={page <= 1} onPress={() => setPage(page - 1)} />
      <Text>Страница {page}</Text>
      <Button
        title="Далее"
        secondary
        disabled={page * limit >= total}
        onPress={() => setPage(page + 1)}
      />
    </View>
  );
}
