import { useMemo } from 'react';
import { buildAirportIndex } from '../lib/airport-index.ts';
import type { LoadedData } from '../state/use-loaded-data.ts';
import { LandingFlightMap } from './LandingFlightMap.tsx';
import { SiteHeader, type SiteView } from './SiteHeader.tsx';
import { useLocale } from '../i18n/use-locale.ts';

interface Props {
  readonly data: LoadedData;
  readonly onNavigate: (view: SiteView) => void;
}

export function LandingPage({ data, onNavigate }: Props): React.ReactElement {
  const { locale } = useLocale();
  const copy = locale === 'zh-TW' ? {
    hero: <>把世界變成一條<br />看得懂的航線。</>,
    intro: '從台灣出發，探索三大航空聯盟的環球票路線。先看世界怎麼連起來，再進入規劃器把旅程做成真的。',
    plan: '開始規劃', browse: '瀏覽所有航線', routes: '收錄方向航線', members: '三大聯盟成員', alliances: '航空聯盟',
    sectionEyebrow: '一趟旅程，三種視角', sectionTitle: '先理解航網，再開始規劃。',
    cards: [
      ['看世界航線', '從經典跨太平洋、跨大西洋與亞洲樞紐開始，理解一張環球票如何繞世界一圈。'],
      ['建立你的路線', '選聯盟、開票方案、航司與班號，GCMP 即時檢查方向、停留、航段與距離規則。'],
      ['查完整航線資料', '獨立航線資料庫可依航空公司、洲別、區域與大型國家內部區域逐層篩選。'],
    ],
    pattern: '經典環球結構', patternBody: '不是推薦行程，也不是即時座位保證；它是一條讓人一眼理解「跨太平洋 → 北美 → 跨大西洋 → 歐洲 → 亞洲 → 回台灣」的典型環球結構。',
    patternCta: '用這個思路開始規劃 →', supportEyebrow: '支持獨立 GCMP', supportTitle: '讓工具保持快速、乾淨、可驗證。',
    supportBody: '未來這裡可以放 Buy Me a Coffee 與低干擾贊助；廣告位會留在內容段落之間，不會切進規劃器核心操作。',
    footer: '給喜歡繞遠路的人。',
  } : {
    hero: <>Turn the world into<br />a route you can read.</>,
    intro: 'Start from Taiwan and explore round-the-world patterns across the three global alliances. Understand the network first, then make the trip concrete in the planner.',
    plan: 'Start planning', browse: 'Browse all routes', routes: 'directional routes', members: 'alliance members', alliances: 'global alliances',
    sectionEyebrow: 'One journey, three views', sectionTitle: 'Understand the network before you plan.',
    cards: [
      ['See the world network', 'Start with classic Pacific, Atlantic and Asian hub patterns to understand how one RTW journey connects.'],
      ['Build your route', 'Choose an alliance, ticketing program, carrier and flight number while GCMP checks direction, stops, sectors and distance.'],
      ['Explore the route library', 'Browse the network separately by airline, continent, region and local areas inside large countries.'],
    ],
    pattern: 'Classic RTW pattern', patternBody: 'This is not a recommended itinerary or live award-seat guarantee. It is a readable example of Pacific → North America → Atlantic → Europe → Asia → Taiwan.',
    patternCta: 'Plan from this pattern →', supportEyebrow: 'Keep GCMP independent', supportTitle: 'Keep the tool fast, clean and verifiable.',
    supportBody: 'This area can later host Buy Me a Coffee and low-interruption sponsorship. Ads should sit between content sections, never inside the planner workflow.',
    footer: 'Built for people who enjoy the long way around.',
  };
  const airportIndex = useMemo(() => buildAirportIndex(data.airports), [data.airports]);
  const routeCount = useMemo(
    () => [...(data.routeNetworkCounts?.values() ?? [])].reduce((sum, count) => sum + count, 0),
    [data.routeNetworkCounts],
  );
  const memberCount = data.allianceCatalog.memberships.filter((membership) => membership.status === 'member').length;

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
          <LandingFlightMap airportLookup={airportIndex.byIata} />
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
            <h2>TPE → NRT → LAX → JFK → LHR → IST → SIN → TPE</h2>
          </div>
          <p>{copy.patternBody}</p>
          <button type="button" className="text-link" onClick={() => onNavigate('planner')}>{copy.patternCta}</button>
        </section>

        <section className="landing-section landing-support">
          <div><span>{copy.supportEyebrow}</span><h2>{copy.supportTitle}</h2></div>
          <p>{copy.supportBody}</p>
        </section>
      </main>
      <footer className="site-footer"><strong>gcmp</strong><span>{copy.footer}</span></footer>
    </div>
  );
}
