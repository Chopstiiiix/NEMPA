import type { AlertType } from '../types';

/**
 * Single source of truth for report types.
 *
 * These used to be `t === 'missing_person' ? … : …` ternaries repeated across the
 * report form, the feed filter, the card and the detail view — which silently
 * mislabels every type after the second. Adding a type should mean adding a row
 * here plus a colour rule in index.css, and nothing else.
 */
export interface AlertTypeMeta {
  value: AlertType;
  /** Full name — the report form's type picker. */
  label: string;
  /** Short name — badges and the feed filter, where space is tight. */
  short: string;
  /** CSS suffix: `.badge--{cls}`, `.segment__item--on.is-{cls}`. */
  cls: string;
  /** Placeholder for the report form's Details box — prompts for what responders need. */
  detailsHint: string;
}

export const ALERT_TYPES: readonly AlertTypeMeta[] = [
  {
    value: 'missing_person',
    label: 'Missing Person',
    short: 'Missing',
    cls: 'missing',
    detailsHint: 'Clothing, distinguishing features, when they were last seen…',
  },
  {
    value: 'robbery',
    label: 'Robbery',
    short: 'Robbery',
    cls: 'robbery',
    detailsHint: 'What was taken, how many people, weapons, which way they went…',
  },
  {
    value: 'other',
    label: 'Other',
    short: 'Other',
    cls: 'other',
    detailsHint: 'What happened, when, who was involved, exactly where…',
  },
];

/**
 * Never throws on an unknown type: the enum lives in Postgres, so a value added
 * there before a client ships would otherwise render as a blank badge.
 */
export function alertTypeMeta(type: string): AlertTypeMeta {
  return (
    ALERT_TYPES.find((m) => m.value === type) ??
    {
      value: type as AlertType,
      label: 'Incident',
      short: 'Incident',
      cls: 'other',
      detailsHint: 'What happened, when, who was involved, exactly where…',
    }
  );
}
