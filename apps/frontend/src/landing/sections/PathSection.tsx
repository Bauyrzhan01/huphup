import { Link } from 'react-router-dom';
import { motion, useTransform } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ScrollReveal } from './ScrollReveal';
import { SectionBackdrop } from './SectionBackdrop';
import { useLandingCta } from '../useLandingCta';
import { useScrollMotionProfile } from '../useScrollMotionProfile';
import { useSectionScroll } from './useSectionScroll';

const STEPS = [
  { n: '01', title: 'pathS1', body: 'pathS1b', range: [0.22, 0.38] as [number, number] },
  { n: '02', title: 'pathS2', body: 'pathS2b', range: [0.32, 0.48] as [number, number] },
  { n: '03', title: 'pathS3', body: 'pathS3b', range: [0.42, 0.58] as [number, number] },
] as const;

export function PathSection() {
  const { t } = useTranslation();
  const ctaTo = useLandingCta();
  const { ref, progress } = useSectionScroll();
  const { lite, mobile } = useScrollMotionProfile();
  const motionOff = lite || mobile;
  const railDraw = useTransform(progress, [0.16, 0.64], [0, 1]);
  const headerY = useTransform(progress, [0.1, 0.85], motionOff ? [0, 0] : [28, -18]);

  return (
    <section ref={ref} className="hh-sec hh-sec--path">
      <SectionBackdrop variant="path" progress={progress} lite={motionOff} />

      <div className="hh-sec-inner hh-sec-inner--path">
        <motion.div style={{ y: headerY }}>
          <ScrollReveal progress={progress} range={[0.06, 0.22]} lite={motionOff} from={{ y: 18, opacity: 0 }}>
            <p className="hh-sec-kicker">{t('landing.pathKicker')}</p>
          </ScrollReveal>

          <ScrollReveal
            progress={progress}
            range={[0.12, 0.3]}
            lite={motionOff}
            from={{ y: 36, opacity: 0, scale: 0.98 }}
          >
            <h2 className="hh-sec-title hh-sec-title--serif">{t('landing.pathTitle')}</h2>
          </ScrollReveal>
        </motion.div>

        <div className="hh-sec-steps">
          <div className="hh-sec-steps-rail" aria-hidden="true">
            <motion.span
              className="hh-sec-steps-rail-fill"
              style={{ scaleY: railDraw, transformOrigin: 'top center' }}
            />
          </div>
          {STEPS.map((step) => (
            <ScrollReveal
              key={step.n}
              as="article"
              progress={progress}
              range={step.range}
              lite={motionOff}
              from={{ y: 32, opacity: 0 }}
              className="hh-sec-step"
            >
              <span className="hh-sec-step-n">{step.n}</span>
              <h3 className="hh-sec-step-title">{t(`landing.${step.title}`)}</h3>
              <p className="hh-sec-step-body">{t(`landing.${step.body}`)}</p>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal
          progress={progress}
          range={[0.52, 0.68]}
          lite={motionOff}
          from={{ y: 28, opacity: 0 }}
          className="hh-sec-cta-row"
        >
          <Link to={ctaTo} className="hh-sec-cta">
            {t('landing.pathCta')}
            <span className="hh-sec-cta-arrow" aria-hidden="true">
              →
            </span>
          </Link>
          <p className="hh-sec-cta-note">{t('landing.pathNote')}</p>
        </ScrollReveal>
      </div>
    </section>
  );
}
