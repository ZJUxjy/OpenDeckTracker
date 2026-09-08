import { useSearchParams } from 'react-router';
import { Settings } from './Settings';

export function SettingsRoute() {
  const [params, setParams] = useSearchParams();
  return <Settings category={params.get('category') ?? 'appearance'}
    onCategoryChange={category => setParams({ category }, { replace: true })} />;
}
