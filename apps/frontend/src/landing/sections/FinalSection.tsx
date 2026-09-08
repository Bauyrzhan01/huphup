import { Link } from 'react-router-dom';
import { motion, useTransform } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ScrollReveal } from './ScrollReveal';
import { SectionBackdrop } from './SectionBackdrop';
import { useLandingCta } from '../useLandingCta';
import { useScrollMotionProfile } from '../useScrollMotionProfile';
import { useSectionScroll } from './useSectionScroll';

export function FinalSection() {
  const { t } = useTranslation();
  const ctaTo = useLandingCta();
  const { ref, progress } = useSectionScroll();
  const { lite, mobile } = useScrollMotionProfile();
  const motionOff = lite || mobile;

  const titleScale = useTransform(progress, [0.18, 0.72], [1, motionOff ? 1 : 1.04]);
  const titleY = useTransform(progress, [0.14, 0.78], motionOff ? [0, 0] : [32, -16]);
  const leadY = useTransform(progress, [0.22, 0.82], motionOff ? [0, 0] : [24, -8]);

  return (
    <section ref={ref} className="hh-sec hh-sec--final">
      <SectionBackdrop variant="final" progress={progress} lite={motionOff} />

      <div className="hh-sec-inner hh-sec-inner--final">
        <ScrollReveal progress={progress} range={[0.08, 0.24]} lite={motionOff} from={{ y: 18, opacity: 0 }}>
          <p className="hh-sec-kicker">{t('landing.finalKicker')}</p>
        </ScrollReveal>

        <motion.div style={{ y: titleY }}>
          <ScrollReveal
            progress={progress}
            range={[0.14, 0.34]}
            lite={motionOff}
            from={{ y: 44, opacity: 0, scale: 0.98 }}
          >
            <motion.h2 className="hh-sec-title hh-sec-title--large" style={{ scale: titleScale }}>
              <span className="hh-sec-title-line">{t('landing.finalL1')}</span>
              <span className="hh-sec-title-line">
                {t('landing.finalL2')}
                <em className="hh-sec-em">{t('landing.finalL2Em')}</em>
              </span>
            </motion.h2>
          </ScrollReveal>
        </motion.div>

        <motion.div style={{ y: leadY }}>
          <ScrollReveal progress={progress} range={[0.26, 0.44]} lite={motionOff} from={{ y: 28, opacity: 0 }}>
            <p className="hh-sec-lead hh-sec-lead--center">{t('landing.finalLead')}</p>
          </ScrollReveal>
        </motion.div>

        <ScrollReveal
          progress={progress}
          range={[0.38, 0.58]}
          lite={motionOff}
          from={{ y: 32, opacity: 0 }}
          className="hh-sec-final-cta"
        >
          <Link to={ctaTo} className="hh-sec-cta hh-sec-cta--large">
            {t('landing.finalCta')}
            <span className="hh-sec-cta-arrow" aria-hidden="true">
              →
            </span>
          </Link>
          <p className="hh-sec-cta-note">{t('landing.finalNote')}</p>
        </ScrollReveal>
      </div>
    </section>
  );
}
