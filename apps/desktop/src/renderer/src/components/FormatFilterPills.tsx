import type { ReactElement } from 'react';
import type { FormatFilter } from '@hdt/core';

import { useTranslation } from '../i18n';
import { Button } from './beui/button';
import { SelectionIndicator, SelectionScope } from './beui/selection';

const FORMATS: FormatFilter[] = ['all', 'standard', 'wild', 'classic', 'twist'];

export interface FormatFilterPillsProps {
  value: FormatFilter;
  onChange: (next: FormatFilter) => void;
}

export function FormatFilterPills({ value, onChange }: FormatFilterPillsProps): ReactElement {
  const { t } = useTranslation();
  return (
    <div className="beui-filter-group flex flex-wrap gap-1" data-testid="format-filter-pills">
      <SelectionScope>
        {FORMATS.map((fmt) => (
          <Button
            key={fmt}
            onClick={() => onChange(fmt)}
            data-testid={`format-pill-${fmt}`}
            aria-pressed={value === fmt}
            className="beui-selection px-3 py-1.5 rounded-md text-xs font-medium"
          >
            <SelectionIndicator active={value === fmt} />
            {t(`stats.formatFilter.${fmt}`)}
          </Button>
        ))}
      </SelectionScope>
    </div>
  );
}
