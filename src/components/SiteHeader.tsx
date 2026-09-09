import { LanguagePicker } from './LanguagePicker.tsx';
import { useLocale } from '../i18n/use-locale.ts';

export type SiteView = 'home' | 'planner' | 'routes';

interface Props {
  readonly active: SiteView;
  readonly onNavigate: (view: SiteView) => void;
}

export function SiteHeader({ active, onNavigate }: Props): React.ReactElement {
  const { locale } = useLocale();
  const copy = locale === 'zh-TW'
    ? { home: '首頁', planner: '規劃', routes: '航線資料庫', tagline: '把世界航線變得清楚。' }
    : { home: 'Home', planner: 'Planner', routes: 'Route library', tagline: 'Round the world, clearly.' };
  return (
    <header className="site-header">
      <button type="button" className="site-brand" onClick={() => onNavigate('home')} aria-label="gcmp home">
        <span className="site-brand-mark">gcmp</span>
        <span>{copy.tagline}</span>
      </button>
      <nav className="site-nav" aria-label="Primary navigation">
        <button type="button" className={active === 'home' ? 'active' : ''} onClick={() => onNavigate('home')}>{copy.home}</button>
        <button type="button" className={active === 'planner' ? 'active' : ''} onClick={() => onNavigate('planner')}>{copy.planner}</button>
        <button type="button" className={active === 'routes' ? 'active' : ''} onClick={() => onNavigate('routes')}>{copy.routes}</button>
      </nav>
      <div className="site-header-tools"><LanguagePicker /></div>
    </header>
  );
}
