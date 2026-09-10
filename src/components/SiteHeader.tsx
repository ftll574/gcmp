import { LanguagePicker } from './LanguagePicker.tsx';
import { useLocale } from '../i18n/use-locale.ts';
import { shouldHandleSiteLink, siteViewHref } from '../lib/site-navigation.ts';

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
      <a className="skip-link" href="#main-content">{locale === 'zh-TW' ? '跳到主要內容' : 'Skip to main content'}</a>
      <a className="site-brand" href={siteViewHref('home')} onClick={(event) => {
        if (!shouldHandleSiteLink(event.nativeEvent)) return;
        event.preventDefault();
        onNavigate('home');
      }} aria-label="gcmp home">
        <span className="site-brand-mark">gcmp</span>
        <span>{copy.tagline}</span>
      </a>
      <nav className="site-nav" aria-label="Primary navigation">
        {(['home', 'planner', 'routes'] as const).map((view) => <a
          key={view}
          href={siteViewHref(view)}
          className={active === view ? 'active' : ''}
          aria-current={active === view ? 'page' : undefined}
          onClick={(event) => {
            if (!shouldHandleSiteLink(event.nativeEvent)) return;
            event.preventDefault();
            onNavigate(view);
          }}
        >{view === 'home' ? copy.home : view === 'planner' ? copy.planner : copy.routes}</a>)}
      </nav>
      <div className="site-header-tools"><LanguagePicker /></div>
    </header>
  );
}
