import { motion, useTransform } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ScrollReveal } from './ScrollReveal';
import { SectionBackdrop } from './SectionBackdrop';
import { useScrollMotionProfile } from '../useScrollMotionProfile';
import { useSectionScroll } from './useSectionScroll';

const POINTS = ['connectP1', 'connectP2', 'connectP3'] as const;
const POINT_RANGES: [number, number][] = [
  [0.28, 0.44],
  [0.34, 0.5],
  [0.4, 0.56],
];

export function ConnectSection() {
  const { t } = useTranslation();
  const { ref, progress } = useSectionScroll();
  const { lite, mobile } = useScrollMotionProfile();
  const motionOff = lite || mobile;
  const copyY = useTransform(progress, [0.12, 0.88], motionOff ? [0, 0] : [36, -28]);

  return (
    <section ref={ref} className="hh-sec hh-sec--connect">
      <SectionBackdrop variant="connect" progress={progress} lite={motionOff} />

      <div className="hh-sec-inner">
        <motion.div className="hh-sec-copy" style={{ y: copyY }}>
          <ScrollReveal progress={progress} range={[0.08, 0.24]} lite={motionOff} from={{ y: 20, opacity: 0 }}>
            <p className="hh-sec-kicker">{t('landing.connectKicker')}</p>
          </ScrollReveal>

          <ScrollReveal
            progress={progress}
            range={[0.14, 0.32]}
            lite={motionOff}
            from={{ y: 40, opacity: 0, scale: 0.98 }}
          >
            <h2 className="hh-sec-title hh-sec-title--serif">
              {t('landing.connectTitle')}
              <em className="hh-sec-em">{t('landing.connectTitleEm')}</em>
            </h2>
          </ScrollReveal>

          <ScrollReveal progress={progress} range={[0.22, 0.4]} lite={motionOff} from={{ y: 32, opacity: 0 }}>
            <p className="hh-sec-lead">{t('landing.connectLead')}</p>
          </ScrollReveal>

          <ul className="hh-sec-points">
            {POINTS.map((key, i) => (
              <ScrollReveal
                key={key}
                as="li"
                progress={progress}
                range={POINT_RANGES[i]!}
                lite={motionOff}
                from={{ y: 24, opacity: 0 }}
                className="hh-sec-point"
              >
                <span className="hh-sec-point-dot" aria-hidden="true" />
                {t(`landing.${key}`)}
              </ScrollReveal>
            ))}
          </ul>
        </motion.div>

        <ScrollReveal
          progress={progress}
          range={[0.32, 0.58]}
          lite={motionOff}
          from={{ x: motionOff ? 0 : 48, y: 20, opacity: 0 }}
          className="hh-sec-visual hh-sec-visual--connect"
        >
          <p className="hh-sec-visual-label">{t('landing.connectVisualLabel')}</p>
          <div className="hh-sec-link-row">
            <span>{t('landing.connectYou')}</span>
            <span className="hh-sec-link-line" aria-hidden="true" />
            <span className="hh-sec-link-mid">HupHup</span>
            <span className="hh-sec-link-line" aria-hidden="true" />
            <span>{t('landing.connectThem')}</span>
          </div>
          <p className="hh-sec-visual-note">{t('landing.connectVisualNote')}</p>
        </ScrollReveal>
      </div>
    </section>
  );
}
