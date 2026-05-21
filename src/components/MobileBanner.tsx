/**
 * Mobile banner. Shown below 768px viewport. Drag-and-edit UX is v1.2;
 * v1 renders the map + numbers in read-only mode so a FlyerTalk-linked
 * URL is still meaningful on phones.
 */

interface Props {
  visible: boolean;
}

export function MobileBanner({ visible }: Props): React.ReactElement | null {
  if (!visible) return null;
  return (
    <div className="mobile-banner" role="status">
      Best viewed on desktop. Routing is read-only on phone — drag + edit comes in v1.2.
    </div>
  );
}
