import { useLocale } from '../i18n/use-locale.ts';

interface Props {
  visible: boolean;
}

export function MobileBanner({ visible }: Props): React.ReactElement | null {
  const { t } = useLocale();
  if (!visible) return null;
  return (
    <div className="mobile-banner" role="status">
      {t('mobile.banner')}
    </div>
  );
}
