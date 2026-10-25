import { BadRequestException } from '@nestjs/common';
import { DateTime } from 'luxon';

export function calendarDate(value: string) {
  const date = DateTime.fromISO(value, { zone: 'UTC' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !date.isValid)
    throw new BadRequestException('Укажите существующую дату в формате ГГГГ-ММ-ДД.');
  return date;
}
export function dateString(value: Date) {
  return DateTime.fromJSDate(value, { zone: 'UTC' }).toISODate()!;
}
export function weekNumber(date: string, weekStartDate: string) {
  return Math.floor(calendarDate(date).diff(calendarDate(weekStartDate), 'days').days / 7) + 1;
}
export function matchesWeek(
  date: string,
  dayOfWeek: number,
  parity: string,
  weekStartDate: string,
) {
  return (
    calendarDate(date).weekday === dayOfWeek &&
    (parity === 'ALL' ||
      (weekNumber(date, weekStartDate) % 2 === 0 ? parity === 'EVEN' : parity === 'ODD'))
  );
}
export function validateTimes(start: string, end: string) {
  if (start >= end)
    throw new BadRequestException('Окончание пары должно быть позже начала в пределах одного дня.');
}
export function localInstant(date: string, time: string, zone: string) {
  const value = DateTime.fromISO(`${date}T${time}`, { zone });
  if (!value.isValid || value.toFormat('HH:mm') !== time)
    throw new BadRequestException('Это время не существует в выбранном часовом поясе.');
  const first = value.getPossibleOffsets().sort((a, b) => a.toMillis() - b.toMillis())[0] ?? value;
  return first.toUTC();
}
