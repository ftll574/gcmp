import { lazy, Suspense } from 'react';
import { SiteHeader, type SiteView } from './SiteHeader.tsx';
import { useLocale } from '../i18n/use-locale.ts';
import { useLandingData } from '../state/use-landing-data.ts';

interface Props {
  readonly onNavigate: (view: SiteView) => void;
}

const LazyLandingGlobe = lazy(() =>
  import('./LandingGlobe.tsx').then((module) => ({ default: module.LandingGlobe })),
);

export function LandingPage({ onNavigate }: Props): React.ReactElement {
  const { locale } = useLocale();
  const landing = useLandingData();
  const copy = locale === 'zh-TW' ? {
    hero: <>把世界變成一條<br />看得懂的航線。</>,
    intro: '先讓世界在你眼前轉起來。從台灣出發，看懂三大航空聯盟如何跨越太平洋、大西洋與主要樞紐，再把它變成自己的環球路線。',
    plan: '開始規劃', browse: '瀏覽所有航線', routes: '收錄方向航線', members: '三大聯盟成員', alliances: '航空聯盟',
    sectionEyebrow: '一趟旅程，三種視角', sectionTitle: '先理解航網，再開始規劃。',
    cards: [
      ['看世界航線', '從經典跨太平洋、跨大西洋與亞洲樞紐開始，理解一張環球票如何繞世界一圈。'],
      ['建立你的路線', '選聯盟、開票方案、航司與班號，GCMP 即時檢查方向、停留、航段與距離規則。'],
      ['查完整航線資料', '獨立航線資料庫可依航空公司、洲別、區域與大型國家內部區域逐層篩選。'],
    ],
    pattern: '不是假的動畫資料', patternBody: '首頁四組展示由目前 GCMP runtime 自動建置。每一段都必須是目前 published 航線、已確認營運者，而且指定班號仍在 confirmed flight-number evidence 裡；它不代表即時座位或特定日期一定執飛。',
    patternCta: '查看完整航線資料庫 →', supportEyebrow: '支持獨立 GCMP', supportTitle: '讓 GCMP 保持快速、乾淨、可驗證。',
    supportBody: 'Buy Me a Coffee 與贊助版位會放在內容頁與首頁底部，不切進 Planner 的核心操作。這裡先保留一個低干擾的支持區。',
    footer: '給喜歡繞遠路的人。',
  } : {
    hero: <>Turn the world into<br />a route you can read.</>,
    intro: 'Watch the world move first. Start from Taiwan, understand how the three global alliances cross the Pacific, Atlantic and major hubs, then turn that structure into your own RTW route.',
    plan: 'Start planning', browse: 'Browse all routes', routes: 'directional routes', members: 'alliance members', alliances: 'global alliances',
    sectionEyebrow: 'One journey, three views', sectionTitle: 'Understand the network before you plan.',
    cards: [
      ['See the world network', 'Start with classic Pacific, Atlantic and Asian hub patterns to understand how one RTW journey connects.'],
      ['Build your route', 'Choose an alliance, ticketing program, carrier and flight number while GCMP checks direction, stops, sectors and distance.'],
      ['Explore the route library', 'Browse the network separately by airline, continent, region and local areas inside large countries.'],
    ],
    pattern: 'Not decorative route data', patternBody: 'The four homepage showcases are generated from the current GCMP runtime. Every displayed leg must remain published, carry confirmed operating identity, and retain its confirmed flight designator. This is not live-seat or date-specific operating proof.',
    patternCta: 'Open the complete route library →', supportEyebrow: 'Keep GCMP independent', supportTitle: 'Keep GCMP fast, clean and verifiable.',
    supportBody: 'Buy Me a Coffee and sponsorship space can live in content pages and the bottom of the homepage, never inside the planner workflow. This section reserves that low-interruption space.',
    footer: 'Built for people who enjoy the long way around.',
  };
  const routeCount = landing.data?.stats.publishedRoutes ?? 0;
  const memberCount = landing.data?.stats.allianceMembers ?? 60;

  return (
    <div className="site-page landing-page">
      <SiteHeader active="home" onNavigate={onNavigate} />
      <main>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <span className="landing-eyebrow">Round-the-world award route planner</span>
            <h1>{copy.hero}</h1>
            <p>{copy.intro}</p>
            <div className="landing-actions">
              <button type="button" className="site-button primary" onClick={() => onNavigate('planner')}>{copy.plan} <span>→</span></button>
              <button type="button" className="site-button secondary" onClick={() => onNavigate('routes')}>{copy.browse}</button>
            </div>
            <dl className="landing-stats">
              <div><dt>{routeCount > 0 ? routeCount.toLocaleString() : '29k+'}</dt><dd>{copy.routes}</dd></div>
              <div><dt>{memberCount}</dt><dd>{copy.members}</dd></div>
              <div><dt>3</dt><dd>{copy.alliances}</dd></div>
            </dl>
          </div>
          <div className="landing-globe-shell">
            {landing.status === 'ready' ? (
              <Suspense fallback={<div className="landing-three-loading" aria-label="Loading 3D globe" />}>
                <LazyLandingGlobe catalog={landing.data} onPlan={() => onNavigate('planner')} />
              </Suspense>
            ) : (
              <div className="landing-three-loading" data-status={landing.status}>
                <span>GCMP / WORLD NETWORK</span>
                <strong>{landing.status === 'error' ? '3D route data unavailable' : 'Loading 3D route network…'}</strong>
              </div>
            )}
          </div>
        </section>

        <section className="landing-section landing-how">
          <div className="landing-section-heading">
            <span>{copy.sectionEyebrow}</span>
            <h2>{copy.sectionTitle}</h2>
          </div>
          <div className="landing-feature-grid">
            {copy.cards.map(([title, body], index) => <article key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{body}</p></article>)}
          </div>
        </section>

        <section className="landing-section landing-route-story">
          <div>
            <span className="landing-eyebrow">{copy.pattern}</span>
            <h2>{locale === 'zh-TW' ? '動畫裡的班號，真的來自我們現在的航線資料。' : 'The flight numbers in the animation come from the current route catalog.'}</h2>
          </div>
          <p>{copy.patternBody}</p>
          <button type="button" className="text-link" onClick={() => onNavigate('routes')}>{copy.patternCta}</button>
        </section>

        <section className="landing-section landing-support">
          <div><span>{copy.supportEyebrow}</span><h2>{copy.supportTitle}</h2></div>
          <div className="landing-support-actions">
            <p>{copy.supportBody}</p>
            <div>
              <span className="support-reserve">Buy Me a Coffee · reserved</span>
              <span className="support-reserve">Sponsor · reserved</span>
            </div>
          </div>
        </section>
      </main>
      <footer className="site-footer"><strong>gcmp</strong><span>{copy.footer}</span></footer>
    </div>
  );
}
