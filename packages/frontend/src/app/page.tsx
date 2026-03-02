import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col">
      {/* Hero */}
      <section className="flex flex-col items-center justify-center px-4 pt-24 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-halo-900/50 border border-halo-600/30 text-halo-400 text-sm mb-6">
          <span className="w-2 h-2 bg-halo-400 rounded-full animate-pulse" />
          Live on Arbitrum Sepolia
        </div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 max-w-4xl">
          Build Credit.
          <br />
          <span className="bg-gradient-to-r from-halo-400 to-halo-600 bg-clip-text text-transparent">
            On-Chain.
          </span>
        </h1>

        <p className="text-xl text-gray-400 max-w-2xl mb-10">
          Join a Halo Circle — a community savings group — and every on-time payment builds your verifiable credit score.
          No bank required.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <Link
            href="/circles"
            className="px-8 py-4 rounded-xl bg-halo-500 hover:bg-halo-600 font-semibold text-lg transition-colors"
          >
            Browse Circles
          </Link>
          <Link
            href="/dashboard"
            className="px-8 py-4 rounded-xl border border-gray-700 hover:border-gray-500 font-semibold text-lg transition-colors"
          >
            My Dashboard
          </Link>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 px-4">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { label: 'Waitlist Users', value: '510+' },
            { label: 'Test Circles', value: '12' },
            { label: 'Default Rate', value: '0%' },
            { label: 'Demo Retention', value: '94%' },
          ].map((stat) => (
            <div key={stat.label} className="p-6 rounded-xl bg-gray-900 border border-gray-800 text-center">
              <div className="text-3xl font-bold text-halo-400 mb-1">{stat.value}</div>
              <div className="text-gray-400 text-sm">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">How Halo Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'Join a Circle',
                desc: '5 members, $100/month. Deposit $400 escrow (returned on completion). Zero credit risk.',
              },
              {
                step: '02',
                title: 'Build Your Score',
                desc: 'Every on-time payment earns +10 score points. Circle completion +25 bonus. Starting score: 500.',
              },
              {
                step: '03',
                title: 'Access Credit',
                desc: 'Score 650+ unlocks discounted DeFi lending. Score 800+ = near-zero collateral requirements.',
              },
            ].map((item) => (
              <div key={item.step} className="p-6 rounded-xl bg-gray-900 border border-gray-800">
                <div className="text-4xl font-bold text-halo-900/50 mb-3">{item.step}</div>
                <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                <p className="text-gray-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Score tiers */}
      <section className="py-16 px-4 bg-gray-900/50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Halo Score Tiers</h2>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            {[
              { tier: 'Poor', range: '300–579', color: 'bg-red-500' },
              { tier: 'Fair', range: '580–669', color: 'bg-orange-500' },
              { tier: 'Good', range: '670–739', color: 'bg-yellow-500' },
              { tier: 'Very Good', range: '740–799', color: 'bg-green-500' },
              { tier: 'Exceptional', range: '800–850', color: 'bg-indigo-500' },
            ].map((t) => (
              <div key={t.tier} className="p-4 rounded-xl bg-gray-900 border border-gray-800 text-center">
                <div className={`w-3 h-3 rounded-full ${t.color} mx-auto mb-2`} />
                <div className="font-semibold">{t.tier}</div>
                <div className="text-sm text-gray-400">{t.range}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
