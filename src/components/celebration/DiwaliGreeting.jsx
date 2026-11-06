import "./celebration.css";

export function DiwaliLights() {
  return (
    <div className="diwali-lights" aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => (
        <span key={i} className="diwali-lights__bulb" style={{ "--bulb-delay": `${(i % 5) * .35}s` }} />
      ))}
    </div>
  );
}

function Diya({ small = false }) {
  return (
    <svg className={`diwali-diya${small ? " diwali-diya--small" : ""}`} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <ellipse cx="50" cy="86" rx="35" ry="6" fill="#a44613" opacity=".12" />
      <g className="diwali-diya__flame">
        <path d="M50 8C51 23 68 27 62 44C58 56 42 56 38 45C34 32 47 25 50 8Z" fill="#ffab25" />
        <path d="M50 27C52 34 59 39 55 47C53 52 45 51 44 46C42 39 49 34 50 27Z" fill="#fff3af" />
      </g>
      <path d="M50 58L50 50" stroke="#6e331f" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M14 59C20 93 80 93 86 59H14Z" fill="#c05824" />
      <path d="M18 64C27 89 66 91 81 66C65 75 35 75 18 64Z" fill="#9b3c23" />
      <ellipse cx="50" cy="59" rx="36" ry="9" fill="#f7b747" />
      <ellipse cx="50" cy="58" rx="29" ry="5" fill="#e78628" />
      <path d="M29 75L33 80M43 78L45 83M57 78L55 83M71 75L67 80" stroke="#ffd878" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export default function DiwaliGreeting({ onExplore }) {
  return (
    <section className="diwali-greeting" aria-label="Diwali wishes from MLM LIVE">
      <div className="diwali-greeting__copy">
        <p className="diwali-greeting__eyebrow" lang="hi">MLM LIVE की ओर से</p>
        <h1 className="diwali-greeting__title" lang="hi">शुभ दीपावली</h1>
        <p className="diwali-greeting__wish" lang="hi">खुशियों से रोशन हो आपका हर दिन।</p>
        <button type="button" className="diwali-greeting__link" onClick={onExplore} lang="hi">
          फेस्टिवल बैनर देखें <span aria-hidden="true">→</span>
        </button>
      </div>
      <div className="diwali-greeting__art" aria-hidden="true">
        <span className="diwali-greeting__halo" />
        <span className="diwali-greeting__spark diwali-greeting__spark--one">✧</span>
        <span className="diwali-greeting__spark diwali-greeting__spark--two">✦</span>
        <span className="diwali-greeting__spark diwali-greeting__spark--three">✧</span>
        <Diya small /><Diya /><Diya small />
      </div>
    </section>
  );
}
