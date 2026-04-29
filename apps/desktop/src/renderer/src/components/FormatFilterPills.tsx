import type { ReactElement } from 'react';
import type { FormatFilter } from '@hdt/core';

import { useTranslation } from '../i18n';

const FORMATS: FormatFilter[] = ['all', 'standard', 'wild', 'classic', 'twist'];

export interface FormatFilterPillsProps {
  value: FormatFilter;
  onChange: (next: FormatFilter) => void;
}

export function FormatFilterPills({ value, onChange }: FormatFilterPillsProps): ReactElement {
  const { t } = useTranslation();
  return (
    <div className="flex space-x-2" data-testid="format-filter-pills">
      {FORMATS.map((fmt) => (
        <button
          key={fmt}
          onClick={() => onChange(fmt)}
          data-testid={`format-pill-${fmt}`}
          aria-pressed={value === fmt}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            value === fmt
              ? 'bg-accent text-text'
              : 'bg-bg-2 text-text-dim hover:text-text hover:bg-bg-3'
          }`}
        >
          {t(`stats.formatFilter.${fmt}`)}
        </button>
      ))}
    </div>
  );
}
