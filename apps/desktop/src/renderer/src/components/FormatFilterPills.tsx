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
              ? 'bg-orange-500 text-white'
              : 'bg-[#1C1C24] text-slate-400 hover:text-white hover:bg-[#2A2A35]'
          }`}
        >
          {t(`stats.formatFilter.${fmt}`)}
        </button>
      ))}
    </div>
  );
}
