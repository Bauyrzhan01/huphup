import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

function useInView(threshold = 0.25) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin: '0px 0px -10% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return { ref, shown };
}

export function RequestFlowContinue() {
  const { t } = useTranslation();
  const match = useInView(0.2);
  const offers = useInView(0.2);
  const chat = useInView(0.25);

  const suppliers = [
    { name: t('landing.demoSupplier1'), score: 96, product: t('landing.demoProduct1') },
    { name: t('landing.demoSupplier2'), score: 91, product: t('landing.demoProduct2') },
    { name: t('landing.demoSupplier3'), score: 87, product: t('landing.demoProduct3') },
  ];

  const offerRows = [
    {
      company: t('landing.demoSupplier1'),
      days: 3,
      label: t('landing.demoOffer1'),
      note: t('landing.continueOfferNote1'),
    },
    {
      company: t('landing.demoSupplier2'),
      days: 5,
      label: t('landing.demoOffer2'),
      note: t('landing.continueOfferNote2'),
    },
    {
      company: t('landing.demoSupplier3'),
      days: 4,
      label: t('landing.continueOffer3'),
      note: t('landing.continueOfferNote3'),
    },
  ];

  return (
    <div className="landing-continue">
      <div className="landing-continue-rail" aria-hidden="true">
        <span className="landing-continue-dot is-done" />
        <span className="landing-continue-line" />
        <span className={`landing-continue-dot${match.shown ? ' is-on' : ''}`} />
        <span className="landing-continue-line" />
        <span className={`landing-continue-dot${offers.shown ? ' is-on' : ''}`} />
        <span className="landing-continue-line" />
        <span className={`landing-continue-dot${chat.shown ? ' is-on' : ''}`} />
      </div>

      <div className="landing-continue-steps">
        <div className="landing-continue-bridge">
          <span className="landing-continue-bridge-pill">{t('landing.continueBridge')}</span>
          <p>{t('landing.continueBridgeText')}</p>
        </div>

        <div
          ref={match.ref}
          className={`landing-continue-card${match.shown ? ' is-visible' : ''}`}
        >
          <div className="landing-continue-card-head">
            <span className="landing-demo-stage is-current">{t('landing.demoStage3')}</span>
            <h3>{t('landing.demoMatching')}</h3>
            <p>{t('landing.step2Text')}</p>
          </div>
          <div className="landing-demo-suppliers">
            {suppliers.map((s, i) => (
              <div
                key={s.name}
                className={`landing-demo-supplier${match.shown ? ' is-show' : ''}`}
                style={{ animationDelay: `${120 + i * 160}ms` }}
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

        <div
          ref={offers.ref}
          className={`landing-continue-card${offers.shown ? ' is-visible' : ''}`}
        >
          <div className="landing-continue-card-head">
            <span className="landing-demo-stage is-current">{t('landing.demoStage4')}</span>
            <h3>{t('landing.demoOffers')}</h3>
            <p>{t('landing.step3Text')}</p>
          </div>
          <div className="landing-continue-offers">
            {offerRows.map((o, i) => (
              <div
                key={o.company}
                className={`landing-continue-offer${offers.shown ? ' is-show' : ''}`}
                style={{ animationDelay: `${140 + i * 180}ms` }}
              >
                <div className="landing-continue-offer-top">
                  <div>
                    <b>{o.company}</b>
                    <span>{o.label}</span>
                  </div>
                  <span className="landing-demo-offer-days">
                    {t('landing.demoDays', { count: o.days })}
                  </span>
                </div>
                <p>{o.note}</p>
              </div>
            ))}
          </div>
        </div>

        <div
          ref={chat.ref}
          className={`landing-continue-card landing-continue-chat${chat.shown ? ' is-visible' : ''}`}
        >
          <div className="landing-continue-card-head">
            <span className="landing-demo-stage is-on">{t('landing.continueStageChat')}</span>
            <h3>{t('landing.continueChatTitle')}</h3>
            <p>{t('landing.continueChatText')}</p>
          </div>
          <div className={`landing-continue-thread${chat.shown ? ' is-show' : ''}`}>
            <div className="landing-continue-bubble is-them">
              {t('landing.continueMsg1')}
            </div>
            <div className="landing-continue-bubble is-me">
              {t('landing.continueMsg2')}
            </div>
            <div className="landing-continue-bubble is-them">
              {t('landing.continueMsg3')}
            </div>
            <div className="landing-demo-chat is-show">
              <span className="landing-demo-dot" />
              {t('landing.demoChatReady')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
