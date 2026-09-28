import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRightCircle,
  Zap,
  LockKeyhole,
  Fingerprint,
  Menu,
  X,
  ShieldAlert,
  ShieldCheck,
  Network,
  Sliders,
  Cpu,
  Activity,
  Clock,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Database,
  Lock,
  Layers,
  Sparkles,
  Loader2,
} from 'lucide-react';
import './VaultShield.css';

export interface VaultShieldHeroProps {
  onEnterDashboard?: () => void;
  onNavigateToTab?: (tabName: string) => void;
  onOpenSignIn?: () => void;
  onOpenDemo?: () => void;
}

// Navigation links supporting both on-page smooth scroll anchors and direct console tabs
const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Demo', href: '#demo' },
  { label: 'About', href: '#about' },
  { label: 'Live Telemetry', tab: 'TRANSACTIONS' },
] as const;

export const VaultShieldLogo: React.FC<{ size?: number; className?: string; fill?: string }> = ({
  size = 32,
  className = '',
  fill = '#192837',
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    fill="none"
    overflow="visible"
    viewBox="0 0 256 256"
    className={className}
    aria-label="Sentinel Fraud Shield Logo"
  >
    <path
      d="M 64 128 L 64.5 128 L 32 95 L 0 64 L 0 0 L 64 0 L 128 64 L 128 64.5 L 161 32 L 192 0 L 256 0 L 256 64 L 192 128 L 128 128 L 128 192 L 96 223 L 63.5 256 L 0 256 L 0 192 Z M 256 192 L 224 223 L 191.5 256 L 128 256 L 128 192 L 192 128 L 256 128 Z"
      fill={fill}
    />
  </svg>
);

export const VaultShieldHero: React.FC<VaultShieldHeroProps> = ({
  onEnterDashboard,
  onNavigateToTab,
  onOpenSignIn,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeNotice, setActiveNotice] = useState<string | null>(null);

  // Demo form state & submission handlers
  const [demoForm, setDemoForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    company: '',
    volume: 'Less than 10,000',
  });
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoSubmitted, setDemoSubmitted] = useState(false);

  useEffect(() => {
    const handleLocationChange = () => {
      const hash = window.location.hash;
      if (hash && hash.startsWith('#')) {
        const target = document.querySelector(hash);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth' });
        }
      }
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);

    if (window.location.hash) {
      setTimeout(handleLocationChange, 150);
    }

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  const handleNavClick = (link: { label: string; href?: string; tab?: string }) => {
    setMobileMenuOpen(false);
    if (link.href) {
      if (window.location.hash !== link.href) {
        window.history.pushState(null, '', link.href);
      }
      const target = document.querySelector(link.href);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    } else if (link.tab) {
      if (onNavigateToTab) {
        onNavigateToTab(link.tab);
      } else if (onEnterDashboard) {
        onEnterDashboard();
      }
    }
  };

  const handleLaunchConsole = () => {
    setMobileMenuOpen(false);
    if (onEnterDashboard) {
      onEnterDashboard();
    } else {
      setActiveNotice('Initializing Sentinel Real-Time Fraud Defense Engine...');
      setTimeout(() => setActiveNotice(null), 3500);
    }
  };

  const handleSignIn = () => {
    setMobileMenuOpen(false);
    if (onOpenSignIn) {
      onOpenSignIn();
    } else if (onEnterDashboard) {
      onEnterDashboard();
    } else {
      setActiveNotice('Authorizing Security Analyst Credentials...');
      setTimeout(() => setActiveNotice(null), 3500);
    }
  };

  const handleGetDemo = () => {
    setMobileMenuOpen(false);
    if (window.location.hash !== '#demo') {
      window.history.pushState(null, '', '#demo');
    }
    const target = document.getElementById('demo') || document.querySelector('#demo');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleDemoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!demoForm.email.trim()) return;

    setDemoLoading(true);
    setTimeout(() => {
      setDemoLoading(false);
      setDemoSubmitted(true);
      setActiveNotice('✨ Demo Walkthrough scheduled! Check your work email for calendar coordinates.');
      setTimeout(() => setActiveNotice(null), 4500);
    }, 700);
  };

  // Fade Up variant according to exact specification:
  // hidden: { opacity: 0, y: 28 }
  // visible: { opacity: 1, y: 0, transition: { delay: i * 0.15, duration: 0.6, ease: [0.22, 1, 0.36, 1] } }
  const fadeUp = {
    hidden: { opacity: 0, y: 28 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: i * 0.15,
        duration: 0.6,
        ease: [0.22, 1, 0.36, 1],
      },
    }),
  };

  return (
    <div className="vaultshield-landing-page">
      {/* ==========================================================================
          STICKY TOP NAVBAR (SMOOTH ANCHOR + CONSOLE ROUTING)
          ========================================================================== */}
      <header className="vaultshield-nav-container">
        <div className="vaultshield-nav-inner">
          {/* Left: Logo & Brand */}
          <div
            className="vaultshield-nav-left"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            title="Scroll to Top / Sentinel AI"
          >
            <VaultShieldLogo size={32} />
            <span className="vaultshield-brand-text">Sentinel AI</span>
          </div>

          {/* Center / Right: Navigation Links */}
          <nav className="vaultshield-nav-links">
            {navLinks.map((link) => (
              <button
                key={link.label}
                type="button"
                className="vaultshield-nav-link"
                onClick={() => handleNavClick(link)}
              >
                {link.label}
              </button>
            ))}
          </nav>

          {/* Mobile: Hamburger toggle icon */}
          <button
            type="button"
            className="vaultshield-mobile-toggle"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu size={24} color="#192837" />
          </button>
        </div>
      </header>

      {/* ==========================================================================
          MOBILE MENU SHEET (ANIMATEPRESENCE + FRAMER MOTION)
          ========================================================================== */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              className="vaultshield-mobile-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={() => setMobileMenuOpen(false)}
            />

            <motion.aside
              className="vaultshield-mobile-sheet"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.45 }}
            >
              <div className="vaultshield-sheet-header">
                <div className="flex items-center gap-2.5">
                  <VaultShieldLogo size={28} />
                  <span className="font-bold text-lg text-[#192837]">Sentinel AI</span>
                </div>
                <button
                  type="button"
                  className="vaultshield-sheet-close-btn"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close navigation sheet"
                >
                  <X size={22} color="#192837" />
                </button>
              </div>

              <div className="vaultshield-sheet-divider" />

              <div className="vaultshield-sheet-links">
                {navLinks.map((link, i) => (
                  <motion.button
                    key={link.label}
                    type="button"
                    className="vaultshield-sheet-link-btn"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      delay: 0.18 + i * 0.07,
                      duration: 0.4,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    onClick={() => handleNavClick(link)}
                  >
                    <span>{link.label}</span>
                    <ExternalLink size={16} style={{ opacity: 0.4 }} />
                  </motion.button>
                ))}
              </div>

              <div className="vaultshield-sheet-footer-actions">
                <button
                  type="button"
                  className="vaultshield-sheet-btn-free"
                  onClick={handleLaunchConsole}
                >
                  Launch Defense Console
                </button>
                <button
                  type="button"
                  className="vaultshield-sheet-btn-signin"
                  onClick={handleSignIn}
                >
                  Analyst Sign In
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ==========================================================================
          HERO SECTION (FULLSCREEN VIEWPORT WITH BACKGROUND VIDEO & ACCENTS)
          ========================================================================== */}
      <section id="hero" className="vaultshield-hero-root">
        {/* Full-screen background video */}
        <video
          className="vaultshield-video-bg"
          autoPlay
          muted
          loop
          playsInline
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260518_003132_8b7edcb6-c64d-4a52-a9ca-879942e122ad.mp4"
        />

        {/* Soft contrast gradient overlay */}
        <div className="vaultshield-video-overlay" />

        {/* Hero Content block */}
        <div className="vaultshield-hero-content-wrap">
          <div className="vaultshield-hero-block">
            {/* Hero Heading:
                - Font: var(--font-heading)
                - Size: clamp(1.65rem, 5vw, 3rem)
                - Line-height: 1.05
                - Letter-spacing: -0.01em
                - Color: #192837
                - Margin-bottom: 24px
                - Contains inline Lucide icons (Zap, LockKeyhole, Fingerprint) at 24px, color #192837, vertically aligned middle, positioned top: -2px
                - Text: "Lock Down Fraudulent Transactions with Ironclad Security"
                  - Zap icon before "Lock"
                  - LockKeyhole icon between "Transactions" and "with"
                  - Fingerprint icon after "Security"
            */}
            <motion.h1
              custom={0}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="vaultshield-hero-heading"
            >
              <Zap
                size={24}
                color="#192837"
                className="vaultshield-inline-icon mr-2"
              />
              Lock Down Fraudulent Transactions{' '}
              <LockKeyhole
                size={24}
                color="#192837"
                className="vaultshield-inline-icon mx-1.5"
              />{' '}
              with Ironclad Security{' '}
              <Fingerprint
                size={24}
                color="#192837"
                className="vaultshield-inline-icon ml-2"
              />
            </motion.h1>

            {/* Hero Subtext */}
            <motion.p
              custom={1}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="vaultshield-hero-subtext"
            >
              Zero fraud, total control. Sentinel shields your transaction pipeline with
              sub-second ML risk scoring, autonomous threat quarantine, and pro-grade forensic
              intelligence for high-volume payments.
            </motion.p>

            {/* Hero CTA Button Group: Primary + Secondary "Get the Demo" */}
            <div className="vaultshield-hero-cta-group">
              <motion.button
                type="button"
                custom={2}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                whileHover={{ scale: 1.04, filter: 'brightness(1.1)' }}
                whileTap={{ scale: 0.96 }}
                className="vaultshield-cta-button"
                onClick={handleLaunchConsole}
              >
                <span>Launch Defense Console</span>
                <ArrowRightCircle size={20} color="#ffffff" />
              </motion.button>

              <motion.button
                type="button"
                custom={2.2}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                className="vaultshield-cta-secondary-button"
                onClick={handleGetDemo}
              >
                <span>Get the Demo</span>
                <Sparkles size={18} color="#7342E2" />
              </motion.button>
            </div>
          </div>
        </div>

        {/* Smooth Scroll-Down Indicator */}
        <div className="vaultshield-scroll-down-hint">
          <a
            href="#features"
            className="vaultshield-scroll-down-btn"
            onClick={(e) => {
              e.preventDefault();
              document.querySelector('#features')?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            <span>Explore Core Capabilities</span>
            <ChevronDown size={15} />
          </a>
        </div>
      </section>

      {/* ==========================================================================
          SECTION 1: FEATURES SECTION (#features)
          ========================================================================== */}
      <section id="features" className="sentinel-features-bg">
        <div className="sentinel-section-wrap">
          <div className="sentinel-section-header">
            <span className="sentinel-section-pill">
              <Zap size={14} /> Core Capabilities
            </span>
            <h2 className="sentinel-section-title">
              Defense-Grade Security Architecture
            </h2>
            <p className="sentinel-section-subtitle">
              Engineered for high-throughput payment networks, neo-banks, and fintech platforms
              requiring instant risk decisions with explainable intelligence.
            </p>
          </div>

          <div className="sentinel-features-grid">
            {/* Feature 1: Real-Time Risk Scoring */}
            <motion.div
              className="sentinel-feature-card"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.05 }}
            >
              <div className="sentinel-feature-icon-box">
                <Activity size={26} />
              </div>
              <h3 className="sentinel-feature-card-title">Real-Time Risk Scoring</h3>
              <p className="sentinel-feature-card-desc">
                Sub-second anomaly detection across high-volume pipelines. Evaluates 45+
                transactional variables—including velocity spikes, card-not-present signals,
                and geographic disparities—in under 15 milliseconds.
              </p>
              <div className="sentinel-feature-badge-telemetry">
                <span className="sentinel-feature-badge-dot" />
                <span>P(Fraud): 0.942 • High-Risk Intercept</span>
              </div>
            </motion.div>

            {/* Feature 2: Entity Graph Forensics */}
            <motion.div
              className="sentinel-feature-card"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.15 }}
            >
              <div className="sentinel-feature-icon-box">
                <Network size={26} />
              </div>
              <h3 className="sentinel-feature-card-title">Entity Graph Forensics</h3>
              <p className="sentinel-feature-card-desc">
                Visualizing linked accounts, cards, and suspicious clusters. Trace relational
                dependencies between senders, recipient mule rings, device fingerprints, and
                shared merchant terminals to dismantle organized syndicate fraud.
              </p>
              <div className="sentinel-feature-badge-telemetry">
                <span className="sentinel-feature-badge-dot" />
                <span>Cluster Map: 6 Linked Cards • Shared CID</span>
              </div>
            </motion.div>

            {/* Feature 3: Autonomous Threat Quarantine */}
            <motion.div
              className="sentinel-feature-card"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.25 }}
            >
              <div className="sentinel-feature-icon-box">
                <ShieldAlert size={26} />
              </div>
              <h3 className="sentinel-feature-card-title">Autonomous Threat Quarantine</h3>
              <p className="sentinel-feature-card-desc">
                Automatic hold on high-risk transactions with configurable thresholds. Intercept
                malicious liquidity before settlement while letting legitimate customers pass
                frictionlessly through frictionless dynamic bypass rules.
              </p>
              <div className="sentinel-feature-badge-telemetry">
                <span className="sentinel-feature-badge-dot" />
                <span>Auto-Action: Quarantined &gt; 85% Threshold</span>
              </div>
            </motion.div>

            {/* Feature 4: Custom Rule Engine */}
            <motion.div
              className="sentinel-feature-card"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.35 }}
            >
              <div className="sentinel-feature-icon-box">
                <Sliders size={26} />
              </div>
              <h3 className="sentinel-feature-card-title">Custom Rule Engine</h3>
              <p className="sentinel-feature-card-desc">
                Tailored rules and telemetry filters for enterprise compliance. Combine machine
                learning decision weights with heuristic sensitivity sliders, merchant
                blacklists, and country-level geo-fencing with instant hot-reloading.
              </p>
              <div className="sentinel-feature-badge-telemetry">
                <span className="sentinel-feature-badge-dot" />
                <span>Policy Engine: 14 Active Heuristic Rules</span>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ==========================================================================
          SECTION 2: "HOW IT WORKS" SECTION (#how-it-works)
          ========================================================================== */}
      <section id="how-it-works" className="sentinel-hiw-bg">
        <div className="sentinel-section-wrap">
          <div className="sentinel-section-header">
            <span className="sentinel-section-pill">
              <Cpu size={14} /> How It Works
            </span>
            <h2 className="sentinel-section-title">
              From Raw Telemetry to Sub-Second Interception
            </h2>
            <p className="sentinel-section-subtitle">
              A 4-stage automated security pipeline operating between your payment gateway and
              settlement engine without introducing checkout latency.
            </p>
          </div>

          <div className="sentinel-steps-grid">
            {/* Step 1: Ingest & Telemetry */}
            <motion.div
              className="sentinel-step-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.05 }}
            >
              <div className="sentinel-step-number-wrap">
                <span className="sentinel-step-badge">STAGE 01</span>
                <Database size={20} className="sentinel-step-icon" />
              </div>
              <h3 className="sentinel-step-title">Ingest & Telemetry</h3>
              <p className="sentinel-step-desc">
                Connect live stream transactions or bulk CSV/JSON audit batches via the Sentinel
                REST API or webhook collectors with automatic ACID persistence.
              </p>
              <span className="sentinel-step-tag">POST /predict • &lt;1.2ms</span>
            </motion.div>

            {/* Step 2: Multi-Layer Evaluation */}
            <motion.div
              className="sentinel-step-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.15 }}
            >
              <div className="sentinel-step-number-wrap">
                <span className="sentinel-step-badge">STAGE 02</span>
                <Layers size={20} className="sentinel-step-icon" />
              </div>
              <h3 className="sentinel-step-title">Multi-Layer Evaluation</h3>
              <p className="sentinel-step-desc">
                Transactions are instantly scored through machine learning ensemble models
                cross-referenced with active heuristic rules and velocity histories.
              </p>
              <span className="sentinel-step-tag">Random Forest + ML Decision</span>
            </motion.div>

            {/* Step 3: Action & Quarantine */}
            <motion.div
              className="sentinel-step-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.25 }}
            >
              <div className="sentinel-step-number-wrap">
                <span className="sentinel-step-badge">STAGE 03</span>
                <ShieldCheck size={20} className="sentinel-step-icon" />
              </div>
              <h3 className="sentinel-step-title">Action & Quarantine</h3>
              <p className="sentinel-step-desc">
                Low-latency automated decisioning: instantaneous clearance for safe payments,
                flagging for senior triage, or automatic quarantine of high-risk threats.
              </p>
              <span className="sentinel-step-tag">PASS / REVIEW / BLOCK</span>
            </motion.div>

            {/* Step 4: Forensic Review */}
            <motion.div
              className="sentinel-step-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.35 }}
            >
              <div className="sentinel-step-number-wrap">
                <span className="sentinel-step-badge">STAGE 04</span>
                <Fingerprint size={20} className="sentinel-step-icon" />
              </div>
              <h3 className="sentinel-step-title">Forensic Review</h3>
              <p className="sentinel-step-desc">
                Investigate flagged clusters in the Interactive Defense Console. Review entity
                dossiers, audit trails, and counterparty graphs with full regulatory compliance.
              </p>
              <span className="sentinel-step-tag">Entity Dossier &amp; Graph</span>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ==========================================================================
          SECTION 3: REQUEST A DEMO SECTION (#demo)
          Positioned directly between "How It Works" and "About Sentinel AI"
          ========================================================================== */}
      <section id="demo" className="sentinel-demo-bg">
        <div className="sentinel-section-wrap">
          <div className="sentinel-section-header">
            <span className="sentinel-section-pill">
              <Sparkles size={14} /> Request a Demo
            </span>
            <h2 className="sentinel-section-title">
              Experience Sentinel Live on Your Volume
            </h2>
            <p className="sentinel-section-subtitle">
              Schedule an interactive walkthrough with our fraud intelligence engineers to see Sentinel live against your volume profile.
            </p>
          </div>

          <motion.div
            className="sentinel-demo-card"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            {/* Left Column: Value Proposition & Trust Signals (Premium Light Green) */}
            <div className="sentinel-demo-info-col">
              <div className="sentinel-demo-info-top">
                <h3 className="sentinel-demo-headline">
                  Ready to secure your business?
                </h3>
                <p className="sentinel-demo-subheadline">
                  Schedule a personalized demo to see how Sentinel can drastically reduce fraud and increase approval rates for your specific use case.
                </p>

                <div className="sentinel-demo-bullets">
                  <div className="sentinel-demo-bullet">
                    <CheckCircle2 size={20} className="sentinel-demo-check-icon" />
                    <span>Custom ROI analysis</span>
                  </div>

                  <div className="sentinel-demo-bullet">
                    <CheckCircle2 size={20} className="sentinel-demo-check-icon" />
                    <span>Live platform walkthrough</span>
                  </div>

                  <div className="sentinel-demo-bullet">
                    <CheckCircle2 size={20} className="sentinel-demo-check-icon" />
                    <span>Integration consultation</span>
                  </div>
                </div>
              </div>

              {/* Trust Badges */}
              <div className="sentinel-demo-trust-badges">
                <div className="sentinel-demo-trust-badge">
                  <ShieldCheck size={15} className="sentinel-demo-badge-icon" />
                  <span>SOC-2 Type II</span>
                </div>
                <div className="sentinel-demo-trust-badge">
                  <Lock size={15} className="sentinel-demo-badge-icon" />
                  <span>PCI-DSS Level 1</span>
                </div>
                <div className="sentinel-demo-trust-badge">
                  <Clock size={15} className="sentinel-demo-badge-icon" />
                  <span>&lt;15ms SLA</span>
                </div>
              </div>
            </div>

            {/* Right Column: Demo Request Form (Completely White) */}
            <div className="sentinel-demo-form-col">
              {demoSubmitted ? (
                <div className="sentinel-demo-success-box">
                  <div className="sentinel-demo-success-icon-wrap">
                    <CheckCircle2 size={46} color="#059669" />
                  </div>
                  <h4 className="sentinel-demo-success-title">Walkthrough Requested!</h4>
                  <p className="sentinel-demo-success-desc">
                    We've received your request for <strong>{demoForm.email}</strong>. Our fraud intelligence engineers will dispatch access credentials and session coordinates shortly.
                  </p>
                  <div className="sentinel-demo-success-details">
                    <div className="sentinel-demo-success-item">
                      <span className="sentinel-demo-success-label">Organization:</span>
                      <span className="sentinel-demo-success-val">{demoForm.company || 'Enterprise Partner'}</span>
                    </div>
                    <div className="sentinel-demo-success-item">
                      <span className="sentinel-demo-success-label">Volume Tier:</span>
                      <span className="sentinel-demo-success-val">{demoForm.volume}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="sentinel-demo-reset-btn"
                    onClick={() => {
                      setDemoSubmitted(false);
                      setDemoForm({
                        email: '',
                        firstName: '',
                        lastName: '',
                        company: '',
                        volume: 'Less than 10,000',
                      });
                    }}
                  >
                    Submit Another Request
                  </button>
                </div>
              ) : (
                <form className="sentinel-demo-form" onSubmit={handleDemoSubmit}>
                  {/* Work Email (Required) */}
                  <div className="sentinel-demo-field">
                    <label htmlFor="demo-email" className="sentinel-demo-label">
                      Work Email
                    </label>
                    <input
                      id="demo-email"
                      type="email"
                      required
                      placeholder="you@company.com"
                      className="sentinel-demo-input"
                      value={demoForm.email}
                      onChange={(e) => setDemoForm({ ...demoForm, email: e.target.value })}
                    />
                  </div>

                  {/* First Name & Last Name (Grid row) */}
                  <div className="sentinel-demo-row">
                    <div className="sentinel-demo-field">
                      <label htmlFor="demo-fname" className="sentinel-demo-label">
                        First Name
                      </label>
                      <input
                        id="demo-fname"
                        type="text"
                        placeholder=""
                        className="sentinel-demo-input"
                        value={demoForm.firstName}
                        onChange={(e) => setDemoForm({ ...demoForm, firstName: e.target.value })}
                      />
                    </div>
                    <div className="sentinel-demo-field">
                      <label htmlFor="demo-lname" className="sentinel-demo-label">
                        Last Name
                      </label>
                      <input
                        id="demo-lname"
                        type="text"
                        placeholder=""
                        className="sentinel-demo-input"
                        value={demoForm.lastName}
                        onChange={(e) => setDemoForm({ ...demoForm, lastName: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Company Website */}
                  <div className="sentinel-demo-field">
                    <label htmlFor="demo-company" className="sentinel-demo-label">
                      Company Website
                    </label>
                    <input
                      id="demo-company"
                      type="text"
                      placeholder="https://..."
                      className="sentinel-demo-input"
                      value={demoForm.company}
                      onChange={(e) => setDemoForm({ ...demoForm, company: e.target.value })}
                    />
                  </div>

                  {/* Monthly Transaction Volume Dropdown */}
                  <div className="sentinel-demo-field">
                    <label htmlFor="demo-volume" className="sentinel-demo-label">
                      Monthly Transaction Volume
                    </label>
                    <select
                      id="demo-volume"
                      className="sentinel-demo-select"
                      value={demoForm.volume}
                      onChange={(e) => setDemoForm({ ...demoForm, volume: e.target.value })}
                    >
                      <option value="Less than 10,000">Less than 10,000</option>
                      <option value="10,000 – 50,000">10,000 – 50,000</option>
                      <option value="50,000 – 250,000">50,000 – 250,000</option>
                      <option value="250,000 – 1,000,000">250,000 – 1,000,000</option>
                      <option value="1,000,000+">1,000,000+</option>
                    </select>
                  </div>

                  {/* Action Button: "Request Demo" */}
                  <button
                    type="submit"
                    className="sentinel-demo-submit-btn"
                    disabled={demoLoading}
                  >
                    {demoLoading ? (
                      <>
                        <Loader2 size={18} className="sentinel-spinner" />
                        <span>Requesting Demo...</span>
                      </>
                    ) : (
                      <span>Request Demo</span>
                    )}
                  </button>

                  {/* Ephemeral Privacy Disclaimer */}
                  <p className="sentinel-demo-disclaimer">
                    <Lock size={12} className="inline mr-1 opacity-70" />
                    Enterprise-grade confidentiality. Zero-storage ephemeral privacy.
                  </p>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ==========================================================================
          SECTION 4: "ABOUT SENTINEL" SECTION (#about)
          ========================================================================== */}
      <section id="about" className="sentinel-about-bg">
        <div className="sentinel-section-wrap">
          <div className="sentinel-about-grid">
            {/* Left: Mission & Story */}
            <div className="sentinel-about-text-col">
              <span className="sentinel-section-pill" style={{ width: 'fit-content' }}>
                <ShieldCheck size={14} /> About Sentinel AI
              </span>
              <h2 className="sentinel-about-headline">
                Building Defense-Grade Infrastructure for High-Scale Fintech
              </h2>
              <p className="sentinel-about-paragraph">
                Financial crime has evolved from isolated fraud attempts into sophisticated,
                distributed syndicates utilizing synthetic identities and coordinated bot nets.
                Sentinel AI was built from the ground up to replace outdated rule engines and
                slow batch audits with millisecond-grade autonomous defense.
              </p>
              <p className="sentinel-about-paragraph">
                Our mission is to empower risk officers, compliance analysts, and fraud teams
                with an explainable AI command center that provides absolute visibility into every
                dollar moving across global payment rails.
              </p>
            </div>

            {/* Right: Key Metrics / Stats 2x2 Grid */}
            <div className="sentinel-stats-grid">
              <motion.div
                className="sentinel-stat-card"
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.05 }}
              >
                <div className="sentinel-stat-number">&lt; 15ms</div>
                <div className="sentinel-stat-label">Scoring Latency</div>
                <div className="sentinel-stat-sub">Real-time inline inference SLA</div>
              </motion.div>

              <motion.div
                className="sentinel-stat-card"
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.15 }}
              >
                <div className="sentinel-stat-number">99.99%</div>
                <div className="sentinel-stat-label">System Uptime</div>
                <div className="sentinel-stat-sub">High-availability redundant architecture</div>
              </motion.div>

              <motion.div
                className="sentinel-stat-card"
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.25 }}
              >
                <div className="sentinel-stat-number">$4.2B+</div>
                <div className="sentinel-stat-label">Protected Volume</div>
                <div className="sentinel-stat-sub">Safeguarded across fintech pipelines</div>
              </motion.div>

              <motion.div
                className="sentinel-stat-card"
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.35 }}
              >
                <div className="sentinel-stat-number">0.01%</div>
                <div className="sentinel-stat-label">False Positive Rate</div>
                <div className="sentinel-stat-sub">Industry-leading approval precision</div>
              </motion.div>
            </div>
          </div>

          {/* Trust and Compliance Badges Strip */}
          <div className="sentinel-trust-strip">
            <div className="sentinel-trust-item">
              <CheckCircle2 size={18} color="#7342E2" />
              <span>SOC-2 Type II Certified</span>
            </div>
            <div className="sentinel-trust-item">
              <Lock size={18} color="#7342E2" />
              <span>PCI-DSS Level 1 Compliant</span>
            </div>
            <div className="sentinel-trust-item">
              <ShieldCheck size={18} color="#7342E2" />
              <span>GDPR &amp; GLBA Ready</span>
            </div>
            <div className="sentinel-trust-item">
              <Clock size={18} color="#7342E2" />
              <span>Zero-Storage Ephemeral Mode</span>
            </div>
          </div>
        </div>
      </section>

      {/* ==========================================================================
          SECTION 4: GLOBAL FOOTER
          ========================================================================== */}
      <footer className="sentinel-footer-root">
        <div className="sentinel-footer-inner">
          {/* Pre-footer Call-To-Action Banner */}
          <div className="sentinel-footer-banner">
            <div>
              <h3 className="sentinel-footer-banner-title">
                Ready to eliminate financial fraud across your transaction flow?
              </h3>
              <p className="sentinel-footer-banner-desc">
                Launch the Sentinel Operations Console to score live transactions, test batch data,
                or inspect suspicious entity networks in real-time.
              </p>
            </div>
            <button
              type="button"
              className="vaultshield-btn-free"
              style={{
                fontSize: '1rem',
                padding: '14px 28px',
                boxShadow: '0 6px 24px rgba(115, 66, 226, 0.4)',
              }}
              onClick={handleLaunchConsole}
            >
              <span>Launch Sentinel Console</span>
              <ArrowRightCircle size={18} />
            </button>
          </div>

          {/* Main Footer Links Grid */}
          <div className="sentinel-footer-grid">
            {/* Brand Column */}
            <div className="sentinel-footer-brand-col">
              <div className="sentinel-footer-logo-row">
                <VaultShieldLogo size={32} fill="#FFFFFF" />
                <span className="sentinel-footer-brand-name">Sentinel AI</span>
              </div>
              <p className="sentinel-footer-desc">
                Defense-grade real-time fraud detection and financial risk intelligence platform
                designed for enterprise scale.
              </p>
            </div>

            {/* Platform Navigation */}
            <div className="sentinel-footer-links-col">
              <span className="sentinel-footer-col-title">Platform</span>
              <a
                href="#features"
                className="sentinel-footer-link"
                onClick={(e) => {
                  e.preventDefault();
                  document.querySelector('#features')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Features
              </a>
              <a
                href="#how-it-works"
                className="sentinel-footer-link"
                onClick={(e) => {
                  e.preventDefault();
                  document.querySelector('#how-it-works')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                How It Works
              </a>
              <a
                href="#demo"
                className="sentinel-footer-link"
                onClick={(e) => {
                  e.preventDefault();
                  handleGetDemo();
                }}
              >
                Demo
              </a>
              <a
                href="#about"
                className="sentinel-footer-link"
                onClick={(e) => {
                  e.preventDefault();
                  document.querySelector('#about')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                About
              </a>
              <button
                type="button"
                className="sentinel-footer-link"
                onClick={() => {
                  if (onNavigateToTab) {
                    onNavigateToTab('TRANSACTIONS');
                  } else if (onEnterDashboard) {
                    onEnterDashboard();
                  }
                }}
              >
                Live Telemetry
              </button>
            </div>

            {/* Console Modules */}
            <div className="sentinel-footer-links-col">
              <span className="sentinel-footer-col-title">Console Modules</span>
              <button
                type="button"
                className="sentinel-footer-link"
                onClick={() => {
                  if (onNavigateToTab) onNavigateToTab('TRANSACTIONS');
                  else handleLaunchConsole();
                }}
              >
                Live Telemetry Feed
              </button>
              <button
                type="button"
                className="sentinel-footer-link"
                onClick={() => {
                  if (onNavigateToTab) onNavigateToTab('RULES');
                  else handleLaunchConsole();
                }}
              >
                Detection Rules
              </button>
              <button
                type="button"
                className="sentinel-footer-link"
                onClick={() => {
                  if (onNavigateToTab) onNavigateToTab('ENTITIES');
                  else handleLaunchConsole();
                }}
              >
                Entity Forensics Graph
              </button>
              <button
                type="button"
                className="sentinel-footer-link"
                onClick={() => {
                  if (onNavigateToTab) onNavigateToTab('ANALYTICS');
                  else handleLaunchConsole();
                }}
              >
                Visual Analytics
              </button>
              <button
                type="button"
                className="sentinel-footer-link"
                onClick={() => {
                  if (onNavigateToTab) onNavigateToTab('BATCH');
                  else handleLaunchConsole();
                }}
              >
                Batch Upload Scanner
              </button>
            </div>

            {/* Security & Compliance */}
            <div className="sentinel-footer-links-col">
              <span className="sentinel-footer-col-title">Security &amp; Legal</span>
              <span className="sentinel-footer-link" style={{ cursor: 'default' }}>
                SOC-2 Type II Certified
              </span>
              <span className="sentinel-footer-link" style={{ cursor: 'default' }}>
                PCI-DSS Level 1 Verified
              </span>
              <span className="sentinel-footer-link" style={{ cursor: 'default' }}>
                GDPR &amp; GLBA Compliant
              </span>
              <span className="sentinel-footer-link" style={{ cursor: 'default' }}>
                Responsible ML Governance
              </span>
            </div>
          </div>

          {/* Footer Bottom Bar */}
          <div className="sentinel-footer-bottom">
            <span>
              &copy; {new Date().getFullYear()} Sentinel AI Technologies, Inc. All rights reserved.
              Enterprise Fraud Defense.
            </span>
            <div className="sentinel-footer-socials">
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                className="sentinel-footer-social-btn"
                title="GitHub"
              >
                <ExternalLink size={16} />
              </a>
              <button
                type="button"
                className="sentinel-footer-social-btn"
                onClick={handleLaunchConsole}
                title="Open Command Center"
              >
                <Activity size={16} />
              </button>
              <button
                type="button"
                className="sentinel-footer-social-btn"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                title="Scroll To Top"
              >
                <ChevronDown size={16} style={{ transform: 'rotate(180deg)' }} />
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* Floating Toast Notification */}
      <AnimatePresence>
        {activeNotice && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            style={{
              position: 'fixed',
              bottom: '24px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 70,
              backgroundColor: '#192837',
              color: '#ffffff',
              padding: '12px 24px',
              borderRadius: '9999px',
              fontSize: '0.9rem',
              fontWeight: 500,
              boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <span>{activeNotice}</span>
            <button
              type="button"
              onClick={() => setActiveNotice(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#ffffff',
                opacity: 0.7,
                cursor: 'pointer',
                fontSize: '1rem',
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VaultShieldHero;
