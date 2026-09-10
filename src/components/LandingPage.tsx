import { lazy, Suspense } from 'react';
import { SiteHeader, type SiteView } from './SiteHeader.tsx';
import { useLocaleState } from '../i18n/use-locale-state.ts';
import { useLandingData } from '../state/use-landing-data.ts';
import { shouldHandleSiteLink, siteViewHref } from '../lib/site-navigation.ts';

interface Props {
  readonly onNavigate: (view: SiteView) => void;
}

const LazyLandingGlobe = lazy(() =>
  import('./LandingGlobe.tsx').then((module) => ({ default: module.LandingGlobe })),
);

export function LandingPage({ onNavigate }: Props): React.ReactElement {
  const { locale } = useLocaleState();
  const landing = useLandingData();
  const copy = locale === 'zh-TW' ? {
    hero: <>把世界變成一條<br />看得懂的航線。</>,
    intro: '先讓世界在你眼前轉起來。從台灣出發，看懂三大航空聯盟如何跨越太平洋、大西洋與主要樞紐，再把它變成自己的環球路線。',
    plan: '開始規劃', browse: '瀏覽所有航線', routes: '收錄方向航線', members: '三大聯盟成員', alliances: '航空聯盟',
    sectionEyebrow: '從航網到行程', sectionTitle: '先理解航網，再開始規劃。',
    cards: [
      ['看世界航線', '從經典跨太平洋、跨大西洋與亞洲樞紐開始，理解一張環球票如何繞世界一圈。'],
      ['建立你的路線', '選聯盟、開票方案、航司與班號，GCMP 即時檢查方向、停留、航段與距離規則。'],
      ['查完整航線資料', '獨立航線資料庫可依航空公司、洲別、區域與大型國家內部區域逐層篩選。'],
    ],
    pattern: '班號有來源，不靠猜。', patternBody: '展示航線會標示目前收錄的實際營運者與已確認班號；座位與特定日期是否執飛，仍需在開票前重新確認。',
    patternCta: '查看航線資料',
    footer: '給喜歡繞遠路的人。',
  } : {
    hero: <>Turn the world into<br />a route you can read.</>,
    intro: 'Watch the world move first. Start from Taiwan, understand how the three global alliances cross the Pacific, Atlantic and major hubs, then turn that structure into your own RTW route.',
    plan: 'Start planning', browse: 'Browse all routes', routes: 'directional routes', members: 'alliance members', alliances: 'global alliances',
    sectionEyebrow: 'From network to itinerary', sectionTitle: 'Understand the network before you plan.',
    cards: [
      ['See the world network', 'Start with classic Pacific, Atlantic and Asian hub patterns to understand how one RTW journey connects.'],
      ['Build your route', 'Choose an alliance, ticketing program, carrier and flight number while GCMP checks direction, stops, sectors and distance.'],
      ['Explore the route library', 'Browse the network separately by airline, continent, region and local areas inside large countries.'],
    ],
    pattern: 'Flight numbers with evidence', patternBody: 'Showcase routes display the operating identity and confirmed flight numbers currently in the catalog. Seats and date-specific operation still need to be rechecked before ticketing.',
    patternCta: 'Open route library',
    footer: 'Built for people who enjoy the long way around.',
  };
  const routeCount = landing.data?.stats.publishedRoutes ?? 0;
  const memberCount = landing.data?.stats.allianceMembers ?? 60;

  return (
    <div className="site-page landing-page">
      <SiteHeader active="home" onNavigate={onNavigate} />
      <main id="main-content">
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <span className="landing-kicker">Round-the-world award planner</span>
            <h1>{copy.hero}</h1>
            <p>{copy.intro}</p>
            <div className="landing-actions">
              <a className="site-button primary" href={siteViewHref('planner')} onClick={(event) => {
                if (!shouldHandleSiteLink(event.nativeEvent)) return;
                event.preventDefault();
                onNavigate('planner');
              }}>{copy.plan}</a>
              <a className="site-button secondary" href={siteViewHref('routes')} onClick={(event) => {
                if (!shouldHandleSiteLink(event.nativeEvent)) return;
                event.preventDefault();
                onNavigate('routes');
              }}>{copy.browse}</a>
            </div>
            <dl className="landing-stats">
              <div><dt>{routeCount > 0 ? routeCount.toLocaleString() : '29k+'}</dt><dd>{copy.routes}</dd></div>
              <div><dt>{memberCount}</dt><dd>{copy.members}</dd></div>
              <div><dt>3</dt><dd>{copy.alliances}</dd></div>
            </dl>
          </div>
          <div className="landing-globe-shell">
            {landing.status === 'ready' ? (
              <Suspense fallback={<div className="landing-three-loading" aria-label={locale === 'zh-TW' ? '正在載入 3D 地球' : 'Loading 3D globe'} />}>
                <LazyLandingGlobe catalog={landing.data} onPlan={() => onNavigate('planner')} />
              </Suspense>
            ) : (
              <div className="landing-three-loading" data-status={landing.status}>
                <span>{locale === 'zh-TW' ? '世界航網' : 'World network'}</span>
                <strong>{landing.status === 'error'
                  ? (locale === 'zh-TW' ? '互動地球暫時無法載入' : 'Interactive globe is temporarily unavailable')
                  : (locale === 'zh-TW' ? '正在載入航網…' : 'Loading route network…')}</strong>
                {landing.status === 'error' && <a href={siteViewHref('routes')} onClick={(event) => {
                  if (!shouldHandleSiteLink(event.nativeEvent)) return;
                  event.preventDefault();
                  onNavigate('routes');
                }}>{copy.browse}</a>}
              </div>
            )}
          </div>
        </section>

        <section className="landing-section landing-how">
          <div className="landing-section-heading">
            <span className="landing-kicker">{copy.sectionEyebrow}</span>
            <h2>{copy.sectionTitle}</h2>
          </div>
          <div className="landing-feature-grid">
            {copy.cards.map(([title, body]) => <article key={title}><h3>{title}</h3><p>{body}</p></article>)}
          </div>
        </section>

        <section className="landing-section landing-route-story">
          <div>
            <span className="landing-kicker">{copy.pattern}</span>
            <h2>{locale === 'zh-TW' ? '每條展示航線，都能追到它的營運與班號證據。' : 'Every showcase route keeps its operating and flight-number evidence close.'}</h2>
          </div>
          <p>{copy.patternBody}</p>
          <a className="text-link" href={siteViewHref('routes')} onClick={(event) => {
            if (!shouldHandleSiteLink(event.nativeEvent)) return;
            event.preventDefault();
            onNavigate('routes');
          }}>{copy.patternCta}</a>
        </section>
      </main>
      <footer className="site-footer"><strong>gcmp</strong><span>{copy.footer}</span></footer>
    </div>
  );
}
