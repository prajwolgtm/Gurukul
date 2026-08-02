const INDIA_TIME_ZONE = 'Asia/Kolkata';

const indiaDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: INDIA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const indiaDateTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: INDIA_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true
});

const getIndiaDateParts = (dateValue) => {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;

  const parts = indiaDateFormatter.formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day)
  };
};

export const buildIndiaDateTime = (dateValue, timeValue) => {
  if (!dateValue || !timeValue) return null;

  const dateParts = getIndiaDateParts(dateValue);
  if (!dateParts) return null;

  const [hours = 0, minutes = 0] = String(timeValue).split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

  // Asia/Kolkata is UTC+05:30. This creates the exact instant for the
  // requested India-local calendar date and clock time.
  return new Date(Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    hours - 5,
    minutes - 30,
    0,
    0
  ));
};

export const formatIndiaDateTime = (dateValue) => {
  if (!dateValue) return '';
  return `${indiaDateTimeFormatter.format(new Date(dateValue))} IST`;
};

export { INDIA_TIME_ZONE };
