import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Stage = 'type' | 'analyze' | 'match' | 'offers';

const STAGE_ORDER: Stage[] = ['type', 'analyze', 'match', 'offers'];

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export function RequestFlowDemo() {
  const { t } = useTranslation();
  const reduced = usePrefersReducedMotion();
  const question = t('landing.mockQuestion');
  const [stage, setStage] = useState<Stage>('type');
  const [typed, setTyped] = useState('');
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (reduced) {
      setTyped(question);
      setStage('offers');
      return;
    }
    setTyped('');
    setStage('type');
    let i = 0;
    const typeId = window.setInterval(() => {
      i += 1;
      setTyped(question.slice(0, i));
      if (i >= question.length) {
        window.clearInterval(typeId);
        setStage('analyze');
      }
    }, 26);
    return () => window.clearInterval(typeId);
  }, [question, cycle, reduced]);

  useEffect(() => {
    if (reduced) return;
    if (stage === 'type') return;
    const delays: Record<Exclude<Stage, 'type'>, number> = {
      analyze: 1600,
      match: 2200,
      offers: 2800,
    };
    const id = window.setTimeout(() => {
      const idx = STAGE_ORDER.indexOf(stage);
      if (stage === 'offers') {
        setCycle((c) => c + 1);
        return;
      }
      setStage(STAGE_ORDER[idx + 1] ?? 'type');
    }, delays[stage]);
    return () => window.clearTimeout(id);
  }, [stage, reduced]);

  const stageIndex = STAGE_ORDER.indexOf(stage);

  const suppliers = [
    { name: t('landing.demoSupplier1'), score: 96, product: t('landing.demoProduct1') },
    { name: t('landing.demoSupplier2'), score: 91, product: t('landing.demoProduct2') },
    { name: t('landing.demoSupplier3'), score: 87, product: t('landing.demoProduct3') },
  ];

  const offers = [
    { company: t('landing.demoSupplier1'), days: 3, label: t('landing.demoOffer1') },
    { company: t('landing.demoSupplier2'), days: 5, label: t('landing.demoOffer2') },
  ];

  return (
    <div className="landing-demo" aria-hidden="true">
      <div className="landing-demo-bar">
        <span />
        <span />
        <span />
        <div className="landing-demo-stages">
          {STAGE_ORDER.map((s, i) => (
            <span
              key={s}
              className={`landing-demo-stage${i <= stageIndex ? ' is-on' : ''}${i === stageIndex ? ' is-current' : ''}`}
            >
              {t(`landing.demoStage${i + 1}`)}
            </span>
          ))}
        </div>
      </div>

      <div className="landing-demo-body">
        <div className={`landing-demo-panel landing-demo-compose${stage === 'type' || stage === 'analyze' ? ' is-active' : ''}`}>
          <div className="landing-demo-label">{t('landing.demoCompose')}</div>
          <p className={`landing-mock-q${stage !== 'type' ? ' is-done' : ''}`}>
            {typed}
            {stage === 'type' ? <span className="landing-caret" /> : null}
          </p>
          <div className={`landing-demo-ai${stage === 'analyze' || stageIndex > 1 ? ' is-show' : ''}`}>
            <div className="landing-demo-ai-title">
              <span className="landing-demo-spark" />
              {t('landing.demoAnalyzing')}
            </div>
            <div className="landing-demo-fields">
              <div className="landing-demo-field" style={{ animationDelay: '80ms' }}>
                <small>{t('landing.demoFieldCategory')}</small>
                <b>{t('landing.demoValueCategory')}</b>
              </div>
              <div className="landing-demo-field" style={{ animationDelay: '180ms' }}>
                <small>{t('landing.demoFieldCity')}</small>
                <b>{t('landing.demoValueCity')}</b>
              </div>
              <div className="landing-demo-field" style={{ animationDelay: '280ms' }}>
                <small>{t('landing.demoFieldQty')}</small>
                <b>{t('landing.demoValueQty')}</b>
              </div>
            </div>
          </div>
        </div>

        <div className={`landing-demo-panel landing-demo-match${stage === 'match' || stage === 'offers' ? ' is-active' : ''}`}>
          <div className="landing-demo-label">{t('landing.demoMatching')}</div>
          <div className="landing-demo-suppliers">
            {suppliers.map((s, i) => (
              <div
                key={s.name}
                className={`landing-demo-supplier${stageIndex >= 2 ? ' is-show' : ''}`}
                style={{ animationDelay: `${120 + i * 180}ms` }}
              >
                <div className="landing-demo-supplier-logo">{s.name.slice(0, 2)}</div>
                <div>
                  <b>{s.name}</b>
                  <span>{s.product}</span>
                </div>
                <em>{s.score}%</em>
              </div>
            ))}
          </div>
        </div>

        <div className={`landing-demo-panel landing-demo-offers${stage === 'offers' ? ' is-active' : ''}`}>
          <div className="landing-demo-label">{t('landing.demoOffers')}</div>
          <div className="landing-demo-offer-list">
            {offers.map((o, i) => (
              <div
                key={o.company}
                className={`landing-demo-offer${stage === 'offers' ? ' is-show' : ''}`}
                style={{ animationDelay: `${140 + i * 220}ms` }}
              >
                <div>
                  <b>{o.company}</b>
                  <span>{o.label}</span>
                </div>
                <span className="landing-demo-offer-days">
                  {t('landing.demoDays', { count: o.days })}
                </span>
              </div>
            ))}
          </div>
          <div className={`landing-demo-chat${stage === 'offers' ? ' is-show' : ''}`}>
            <span className="landing-demo-dot" />
            {t('landing.demoChatReady')}
          </div>
        </div>
      </div>
    </div>
  );
}
